import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AccountStatus } from '@ktb/shared-types';
import { UniversalTimeWallet } from '../identity/entities/universal-time-wallet.entity';
import { User } from '../identity/entities/user.entity';
import { GlobalServiceDefinition } from '../catalogue/entities/global-service-definition.entity';
import { AuditService } from '../audit/audit.service';
import {
  TimeCreditLedgerEntry,
  TimeCreditTxType,
} from './entities/time-credit-ledger-entry.entity';

/** Credit policy inputs from the central service definition (FR-TIME-02). */
export interface CreditPolicy {
  baseCreditRateHourly: number;
  creditMultiplier: number;
  allowPartialHours: boolean;
}

/**
 * Credits for confirmed minutes: one credit per hour at the base rate, scaled
 * by the service multiplier. Whole hours only when partial hours are not allowed.
 * Worked in hundredths so results match the NUMERIC(10,2) columns exactly.
 */
export function creditsForMinutes(minutes: number, policy: CreditPolicy): number {
  const counted = policy.allowPartialHours ? minutes : Math.floor(minutes / 60) * 60;
  const rate = Math.round(Number(policy.baseCreditRateHourly) * 100);
  const multiplier = Math.round(Number(policy.creditMultiplier) * 100);
  // minutes × rate(hundredths) × multiplier(hundredths) / 60 / 100 → hundredths
  return Math.round((counted * rate * multiplier) / 6000) / 100;
}

export interface ServiceEarning {
  volunteerUserId: string;
  organizationId: string;
  serviceRequestId: string;
  volunteerAssignmentId: string;
  minutes: number;
  policy: CreditPolicy;
  reference?: string;
}

@Injectable()
export class TimeLedgerService {
  constructor(
    @InjectRepository(UniversalTimeWallet)
    private readonly walletRepo: Repository<UniversalTimeWallet>,
    @InjectRepository(TimeCreditLedgerEntry)
    private readonly ledgerRepo: Repository<TimeCreditLedgerEntry>,
    private readonly auditService: AuditService,
  ) {}

  /** Loads the credit policy for a request's service inside the caller's transaction. */
  async policyForRequest(manager: EntityManager, serviceRequestId: string): Promise<CreditPolicy> {
    const service = await manager
      .getRepository(GlobalServiceDefinition)
      .createQueryBuilder('gs')
      .innerJoin('organization_service_catalog', 'cat', 'cat.global_service_id = gs.id')
      .innerJoin('service_requests', 'req', 'req.service_catalog_id = cat.id')
      .where('req.id = :serviceRequestId', { serviceRequestId })
      .getOneOrFail();
    return {
      baseCreditRateHourly: Number(service.baseCreditRateHourly),
      creditMultiplier: Number(service.creditMultiplier),
      allowPartialHours: service.allowPartialHours,
    };
  }

  /**
   * Pays a confirmed assignment into the volunteer's universal wallet, inside the
   * caller's transaction. A unique key makes a second payment impossible. Credits
   * for an inactive wallet or account are held in frozen credits instead.
   * Returns null when the policy yields no credits (for example under an hour
   * of a whole-hours-only service).
   */
  async postServiceEarning(
    manager: EntityManager,
    earning: ServiceEarning,
  ): Promise<TimeCreditLedgerEntry | null> {
    const amount = creditsForMinutes(earning.minutes, earning.policy);
    if (amount <= 0) return null;

    // Older accounts may predate automatic wallet provisioning.
    await manager.query(
      'INSERT INTO universal_time_wallets(user_id) VALUES($1) ON CONFLICT (user_id) DO NOTHING',
      [earning.volunteerUserId],
    );
    const wallet = await manager.getRepository(UniversalTimeWallet).findOneOrFail({
      where: { userId: earning.volunteerUserId },
      lock: { mode: 'pessimistic_write' },
    });
    const user = await manager
      .getRepository(User)
      .findOneOrFail({ where: { id: earning.volunteerUserId } });
    const restrictions = await manager.query(
      "SELECT id FROM global_account_restrictions WHERE user_id=$1 AND status='ACTIVE'",
      [earning.volunteerUserId],
    );
    const held =
      wallet.status !== 'ACTIVE' || user.status !== AccountStatus.ACTIVE || restrictions.length > 0;

    const cents = (value: number) => Math.round(Number(value) * 100);
    if (held) wallet.frozenCredits = (cents(wallet.frozenCredits) + cents(amount)) / 100;
    else wallet.balanceCredits = (cents(wallet.balanceCredits) + cents(amount)) / 100;
    await manager.getRepository(UniversalTimeWallet).save(wallet);

    const entry = await manager.getRepository(TimeCreditLedgerEntry).save(
      manager.getRepository(TimeCreditLedgerEntry).create({
        walletId: wallet.id,
        amount,
        balanceAfter: wallet.balanceCredits,
        held,
        frozenDelta: held ? amount : 0,
        txType: TimeCreditTxType.SERVICE_EARNED,
        originatingOrgId: earning.organizationId,
        serviceRequestId: earning.serviceRequestId,
        volunteerAssignmentId: earning.volunteerAssignmentId,
        minutes: earning.minutes,
        reference: earning.reference ?? null,
      }),
    );
    await this.auditService.logEvent(
      {
        eventType: held ? 'TIME_CREDITS_HELD' : 'TIME_CREDITS_EARNED',
        actorId: null,
        targetId: entry.id,
        targetType: 'time_credit_ledger',
        organizationId: earning.organizationId,
        payload: {
          walletId: wallet.id,
          volunteerAssignmentId: earning.volunteerAssignmentId,
          minutes: earning.minutes,
          amount,
        },
      },
      manager,
    );
    return entry;
  }

  /**
   * Minutes come from confirmed visits, including services which earned no credits.
   * Each helper contributes their own minutes to a team visit. Donations are
   * recorded separately from service time and from optional funding of a visit.
   */
  async mySummary(userId: string) {
    const [summary] = await this.walletRepo.manager.query(
      `SELECT
         COALESCE(wallet.balance_credits, 0) AS "balanceCredits",
         COALESCE(wallet.frozen_credits, 0) AS "frozenCredits",
         COALESCE(wallet.status, 'ACTIVE') AS status,
         COALESCE((
           SELECT SUM(visit.confirmed_minutes)
           FROM organization_memberships member
           JOIN volunteer_assignments visit ON visit.volunteer_membership_id = member.id
           WHERE member.user_id = $1 AND visit.confirmed_at IS NOT NULL
             AND visit.status = 'COMPLETED'
         ), 0)::text AS "minutesGiven",
         COALESCE((
           SELECT SUM(visit.confirmed_minutes)
           FROM organization_memberships member
           JOIN service_requests request ON request.beneficiary_membership_id = member.id
           JOIN volunteer_assignments visit ON visit.service_request_id = request.id
           WHERE member.user_id = $1 AND visit.confirmed_at IS NOT NULL
             AND visit.status = 'COMPLETED'
         ), 0)::text AS "minutesReceived",
         COALESCE((
           SELECT SUM(-entry.amount) FROM time_credit_ledger entry
           WHERE entry.wallet_id = wallet.id AND entry.tx_type = 'DONATION_SENT'
         ), 0) AS "creditsDonated"
       FROM users account
       LEFT JOIN universal_time_wallets wallet ON wallet.user_id = account.id
       WHERE account.id = $1`,
      [userId],
    );
    return {
      balanceCredits: Number(summary?.balanceCredits ?? 0),
      frozenCredits: Number(summary?.frozenCredits ?? 0),
      status: summary?.status ?? 'ACTIVE',
      minutesGiven: Number(summary?.minutesGiven ?? 0),
      minutesReceived: Number(summary?.minutesReceived ?? 0),
      creditsDonated: Number(summary?.creditsDonated ?? 0),
    };
  }

  /** The signed-in user's universal wallet and newest-first credit history. */
  async listMyTransactions(userId: string, page = 1, limit = 20) {
    const wallet = await this.walletRepo.findOne({ where: { userId } });
    if (!wallet) {
      return { balanceCredits: 0, frozenCredits: 0, status: 'ACTIVE', data: [], total: 0 };
    }
    const [entries, total] = await this.ledgerRepo.findAndCount({
      where: { walletId: wallet.id },
      relations: [
        'originatingOrg',
        'serviceRequest',
        'serviceRequest.serviceCatalog',
        'serviceRequest.serviceCatalog.globalService',
        'donation',
        'donation.recipientPool',
        'donation.recipientPool.organization',
        'donation.recipientMembership',
        'donation.recipientMembership.organization',
      ],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      balanceCredits: wallet.balanceCredits,
      frozenCredits: wallet.frozenCredits,
      status: wallet.status,
      total,
      data: entries.map((entry) => ({
        id: entry.id,
        amount: entry.amount,
        balanceAfter: entry.balanceAfter,
        held: entry.held,
        frozenDelta: entry.frozenDelta,
        reviewId: entry.reviewId ?? null,
        operationId: entry.operationId ?? null,
        txType: entry.txType,
        minutes: entry.minutes ?? null,
        createdAt: entry.createdAt,
        organization: entry.originatingOrg
          ? { id: entry.originatingOrg.id, name: entry.originatingOrg.name }
          : null,
        serviceRequest: entry.serviceRequest
          ? {
              id: entry.serviceRequest.id,
              requestNumber: entry.serviceRequest.requestNumber,
              serviceName:
                entry.serviceRequest.serviceCatalog?.customLabelEn ??
                entry.serviceRequest.serviceCatalog?.globalService?.nameEn ??
                null,
            }
          : null,
        donation: entry.donation ? this.donationView(entry) : null,
      })),
    };
  }

  /**
   * The donor sees who received the gift. A recipient sees only the note and
   * the organization it came through, never the donor's identity.
   */
  private donationView(entry: TimeCreditLedgerEntry) {
    const donation = entry.donation!;
    if (entry.txType !== TimeCreditTxType.DONATION_SENT) {
      return { id: donation.id, note: donation.note ?? null, recipient: null };
    }
    const pool = donation.recipientPool;
    const member = donation.recipientMembership;
    return {
      id: donation.id,
      note: donation.note ?? null,
      recipient: pool
        ? {
            type: 'POOL',
            id: pool.id,
            name: pool.name,
            organizationName: pool.organization?.name ?? null,
          }
        : {
            type: 'MEMBER',
            membershipNumber: member?.membershipNumber ?? null,
            organizationName: member?.organization?.name ?? null,
          },
    };
  }
}
