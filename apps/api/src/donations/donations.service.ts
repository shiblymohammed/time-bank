import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  AccountStatus,
  IdentityVerificationStatus,
  MembershipStatus,
  OrganizationStatus,
} from '@ktb/shared-types';
import { AuditService } from '../audit/audit.service';
import { User } from '../identity/entities/user.entity';
import { UniversalTimeWallet } from '../identity/entities/universal-time-wallet.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import {
  TimeCreditLedgerEntry,
  TimeCreditTxType,
} from '../time-ledger/entities/time-credit-ledger-entry.entity';
import { CommunityCreditPool, CommunityPoolStatus } from './entities/community-credit-pool.entity';
import { CreditDonation } from './entities/credit-donation.entity';
import { CreateDonationDto } from './dto/create-donation.dto';
import { CreateCommunityPoolDto } from './dto/create-community-pool.dto';

const cents = (value: number) => Math.round(Number(value) * 100);

export type DonationRecipient =
  | { type: 'MEMBER'; membershipNumber: string; organizationName: string | null }
  | { type: 'POOL'; id: string; name: string; organizationName: string | null };

@Injectable()
export class DonationsService {
  constructor(
    @InjectRepository(CreditDonation)
    private readonly donationRepo: Repository<CreditDonation>,
    @InjectRepository(CommunityCreditPool)
    private readonly poolRepo: Repository<CommunityCreditPool>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Gives credits from the caller's universal wallet to a verified member of any
   * participating organization, or to an approved community pool (FR-TIME-03).
   * The donor's debit and the recipient's credit are two ledger rows in one
   * transaction. Wallet rows are locked in id order, then the pool, so two
   * members giving to each other at once cannot deadlock or overspend.
   */
  async donate(orgId: string, donorUserId: string, dto: CreateDonationDto, ipAddress?: string) {
    const toPool = dto.poolId !== undefined;
    const toMember =
      dto.recipientOrganizationId !== undefined || dto.recipientMembershipNumber !== undefined;
    if (toPool === toMember) {
      throw new BadRequestException('Choose one recipient: a member or a community pool');
    }
    if (toMember && (!dto.recipientOrganizationId || !dto.recipientMembershipNumber)) {
      throw new BadRequestException(
        'A member is found by their organization and membership number',
      );
    }
    const amount = cents(dto.amount) / 100;

    return this.donationRepo.manager.transaction('READ COMMITTED', async (manager) => {
      let membership: OrganizationMembership | null = null;
      let pool: CommunityCreditPool | null = null;
      if (toMember) {
        membership = await manager.getRepository(OrganizationMembership).findOne({
          where: {
            organizationId: dto.recipientOrganizationId!,
            membershipNumber: dto.recipientMembershipNumber!,
            status: MembershipStatus.APPROVED,
          },
          relations: ['organization', 'user', 'user.verifiedIdentity'],
        });
        // D#19: only verified individuals may receive credits.
        if (
          !membership ||
          membership.organization.status !== OrganizationStatus.ACTIVE ||
          membership.user.status !== AccountStatus.ACTIVE ||
          membership.user.verifiedIdentity?.verificationStatus !==
            IdentityVerificationStatus.VERIFIED
        ) {
          throw new NotFoundException('No verified member has that membership number');
        }
        if (membership.userId === donorUserId) {
          throw new BadRequestException('You cannot give credits to yourself');
        }
        // Older accounts may predate automatic wallet provisioning.
        await manager.query(
          'INSERT INTO universal_time_wallets(user_id) VALUES($1) ON CONFLICT (user_id) DO NOTHING',
          [membership.userId],
        );
      } else {
        pool = await manager.getRepository(CommunityCreditPool).findOne({
          where: { id: dto.poolId!, status: CommunityPoolStatus.ACTIVE },
          relations: ['organization'],
        });
        if (!pool || pool.organization?.status !== OrganizationStatus.ACTIVE) {
          throw new NotFoundException('That community pool is not accepting credits');
        }
      }

      const owners = membership ? [donorUserId, membership.userId] : [donorUserId];
      const wallets = await manager
        .getRepository(UniversalTimeWallet)
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.userId IN (:...owners)', { owners })
        .orderBy('w.id')
        .getMany();
      const donorWallet = wallets.find((w) => w.userId === donorUserId);
      const recipientWallet = membership
        ? wallets.find((w) => w.userId === membership!.userId)!
        : null;

      // Checked under the donor's wallet lock, so a retry cannot give twice.
      const previous = await manager
        .getRepository(CreditDonation)
        .findOne({ where: { donorUserId, idempotencyKey: dto.idempotencyKey } });
      if (previous) {
        const same =
          cents(previous.amount) === cents(amount) &&
          (previous.recipientMembershipId ?? null) === (membership?.id ?? null) &&
          (previous.recipientPoolId ?? null) === (pool?.id ?? null);
        if (!same) {
          throw new ConflictException('This gift key was already used for a different gift');
        }
        return this.summary(previous, donorWallet!.balanceCredits, membership, pool, true);
      }

      const donor = await manager.getRepository(User).findOneOrFail({ where: { id: donorUserId } });
      // D#79: a suspended or banned account keeps its balance but cannot give.
      if (
        donor.status !== AccountStatus.ACTIVE ||
        (donorWallet && donorWallet.status !== 'ACTIVE')
      ) {
        throw new ForbiddenException('Your wallet is frozen, so credits cannot be given now');
      }
      if (!donorWallet || cents(donorWallet.balanceCredits) < cents(amount)) {
        throw new ConflictException(
          `You have ${donorWallet?.balanceCredits ?? 0} credits available to give`,
        );
      }
      if (recipientWallet && recipientWallet.status !== 'ACTIVE') {
        throw new ConflictException('This member cannot receive credits right now');
      }
      if (pool) {
        // Wallets are always locked before pools.
        const locked = await manager.getRepository(CommunityCreditPool).findOneOrFail({
          where: { id: pool.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (locked.status !== CommunityPoolStatus.ACTIVE) {
          throw new NotFoundException('That community pool is not accepting credits');
        }
        pool.balanceCredits = locked.balanceCredits;
      }

      const donation = await manager.getRepository(CreditDonation).save(
        manager.getRepository(CreditDonation).create({
          donorUserId,
          originatingOrgId: orgId,
          recipientUserId: membership?.userId ?? null,
          recipientMembershipId: membership?.id ?? null,
          recipientPoolId: pool?.id ?? null,
          amount,
          note: dto.note ?? null,
          idempotencyKey: dto.idempotencyKey,
        }),
      );

      donorWallet.balanceCredits = (cents(donorWallet.balanceCredits) - cents(amount)) / 100;
      await manager.getRepository(UniversalTimeWallet).save(donorWallet);
      const legs: Partial<TimeCreditLedgerEntry>[] = [
        {
          walletId: donorWallet.id,
          amount: -amount,
          balanceAfter: donorWallet.balanceCredits,
          txType: TimeCreditTxType.DONATION_SENT,
        },
      ];
      if (recipientWallet) {
        recipientWallet.balanceCredits =
          (cents(recipientWallet.balanceCredits) + cents(amount)) / 100;
        await manager.getRepository(UniversalTimeWallet).save(recipientWallet);
        legs.push({
          walletId: recipientWallet.id,
          amount,
          balanceAfter: recipientWallet.balanceCredits,
          txType: TimeCreditTxType.DONATION_RECEIVED,
        });
      } else {
        pool!.balanceCredits = (cents(pool!.balanceCredits) + cents(amount)) / 100;
        await manager.getRepository(CommunityCreditPool).save(pool!);
        legs.push({
          poolId: pool!.id,
          amount,
          balanceAfter: pool!.balanceCredits,
          txType: TimeCreditTxType.DONATION_RECEIVED,
        });
      }
      const ledger = manager.getRepository(TimeCreditLedgerEntry);
      await ledger.save(
        legs.map((leg) =>
          ledger.create({
            ...leg,
            held: false,
            originatingOrgId: orgId,
            donationId: donation.id,
            reference: dto.idempotencyKey,
          }),
        ),
      );

      await this.auditService.logEvent(
        {
          eventType: 'CREDITS_DONATED',
          actorId: donorUserId,
          targetId: donation.id,
          targetType: 'credit_donations',
          organizationId: orgId,
          payload: {
            amount,
            recipientType: pool ? 'POOL' : 'MEMBER',
            recipientMembershipId: membership?.id ?? null,
            recipientPoolId: pool?.id ?? null,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
      return this.summary(donation, donorWallet.balanceCredits, membership, pool, false);
    });
  }

  private summary(
    donation: CreditDonation,
    balanceCredits: number,
    membership: OrganizationMembership | null,
    pool: CommunityCreditPool | null,
    replayed: boolean,
  ) {
    const recipient: DonationRecipient = pool
      ? {
          type: 'POOL',
          id: pool.id,
          name: pool.name,
          organizationName: pool.organization?.name ?? null,
        }
      : {
          type: 'MEMBER',
          membershipNumber: membership!.membershipNumber!,
          organizationName: membership!.organization?.name ?? null,
        };
    return {
      id: donation.id,
      amount: donation.amount,
      note: donation.note ?? null,
      createdAt: donation.createdAt,
      balanceCredits,
      recipient,
      replayed,
    };
  }

  /** Approved pools of every participating organization, for any signed-in member. */
  async listPools() {
    const pools = await this.poolRepo.find({
      where: { status: CommunityPoolStatus.ACTIVE },
      relations: ['organization'],
      order: { name: 'ASC' },
    });
    return {
      data: pools
        .filter((pool) => pool.organization?.status === OrganizationStatus.ACTIVE)
        .map((pool) => ({
          id: pool.id,
          name: pool.name,
          description: pool.description ?? null,
          balanceCredits: pool.balanceCredits,
          organization: { id: pool.organizationId, name: pool.organization!.name },
        })),
    };
  }

  /** A municipality administrator approves a new pool for their organization. */
  async createPool(
    orgId: string,
    userId: string,
    dto: CreateCommunityPoolDto,
    ipAddress?: string,
  ): Promise<CommunityCreditPool> {
    return this.poolRepo.manager.transaction(async (manager: EntityManager) => {
      const repo = manager.getRepository(CommunityCreditPool);
      if (await repo.exist({ where: { organizationId: orgId, name: dto.name } })) {
        throw new ConflictException('This organization already has a pool with that name');
      }
      const pool = await repo.save(
        repo.create({
          organizationId: orgId,
          name: dto.name,
          description: dto.description ?? null,
          createdByUserId: userId,
        }),
      );
      await this.auditService.logEvent(
        {
          eventType: 'COMMUNITY_POOL_CREATED',
          actorId: userId,
          targetId: pool.id,
          targetType: 'community_credit_pools',
          organizationId: orgId,
          payload: { name: pool.name },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );
      return pool;
    });
  }
}
