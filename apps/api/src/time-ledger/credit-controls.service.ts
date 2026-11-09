import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { UserRole } from '@ktb/shared-types';
import { AuditService } from '../audit/audit.service';
import { staffPowersAllowed } from '../auth/staff-context';
import {
  ChangeWalletStatusDto,
  CreditAmountDto,
  InvestigateCreditReviewDto,
  OpenCreditReviewDto,
  ResolveCreditReviewDto,
  SpendAssistanceCreditsDto,
} from './dto/credit-controls.dto';

const cents = (value: number | string) => Math.round(Number(value) * 100);
type Account = {
  id: string;
  user_id?: string;
  organization_id?: string;
  balance_credits: string;
  frozen_credits: string;
  status: string;
};
type Review = {
  id: string;
  organization_id: string;
  source_entry_id: string;
  wallet_id: string | null;
  pool_id: string | null;
  amount: string;
  held_amount: string;
  from_frozen: boolean;
  pre_frozen_amount: string;
  parent_review_id: string | null;
  reason: string;
  opened_by: string;
  investigation: string | null;
  investigated_by: string | null;
  decision: string | null;
  resolution: string | null;
};

/**
 * Financial mutations share the existing wallet/pool locks with donations and
 * service payments. Every balance change, control record and audit is atomic.
 * Reviews preserve the source row; correcting credits appends a compensating row.
 */
@Injectable()
export class CreditControlsService {
  constructor(
    private readonly db: DataSource,
    private readonly audit: AuditService,
  ) {}

  private validateAmount(dto: CreditAmountDto) {
    if (
      !Number.isFinite(dto.amount) ||
      cents(dto.amount) < 1 ||
      dto.amount > 1000 ||
      Math.abs(dto.amount * 100 - cents(dto.amount)) > 0.000001 ||
      !dto.idempotencyKey ||
      dto.idempotencyKey.length < 8 ||
      dto.idempotencyKey.length > 100 ||
      !dto.reason?.trim() ||
      dto.reason.trim().length < 5 ||
      dto.reason.length > 1000
    ) {
      throw new BadRequestException('Supply hundredths of credits, a reason and a retry key');
    }
  }

  /** Lock current account/tenant authority; JWT claims never authorize money changes. */
  private async authority(m: EntityManager, org: string, actor: string, roles?: UserRole[]) {
    const [user] = await m.query('SELECT status FROM users WHERE id=$1 FOR SHARE', [actor]);
    const [organization] = await m.query('SELECT status FROM organizations WHERE id=$1 FOR SHARE', [
      org,
    ]);
    const restrictions = await m.query(
      "SELECT id FROM global_account_restrictions WHERE user_id=$1 AND status='ACTIVE'",
      [actor],
    );
    if (user?.status !== 'ACTIVE' || organization?.status !== 'ACTIVE' || restrictions.length) {
      throw new ForbiddenException('An active account and organization are required');
    }
    const lockedGrants: { role: string; organization_id: string }[] = await m.query(
      `SELECT g.role, m.organization_id FROM organization_memberships m
       JOIN membership_role_grants g ON g.membership_id=m.id
       WHERE m.user_id=$1 AND m.status='APPROVED' AND g.status='ACTIVE'
       AND (m.organization_id=$2 OR g.role='SUPER_ADMIN') FOR SHARE OF m,g`,
      [actor, org],
    );
    // Staff roles wait until this sign-in passes the emailed staff code.
    const staffRoles: string[] = [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN];
    const grants = staffPowersAllowed()
      ? lockedGrants
      : lockedGrants.filter((g) => !staffRoles.includes(g.role));
    if (grants.some((g) => g.role === 'SUPER_ADMIN')) return;
    const members = await m.query(
      "SELECT id FROM organization_memberships WHERE user_id=$1 AND organization_id=$2 AND status='APPROVED' FOR SHARE",
      [actor, org],
    );
    if (!members.length || (roles && !grants.some((g) => roles.includes(g.role as UserRole)))) {
      throw new ForbiddenException('Current organization authority is required');
    }
  }

  private async account(m: EntityManager, walletId: string | null, poolId: string | null) {
    // The table choice comes only from an internal boolean, never request text.
    const table = walletId ? 'universal_time_wallets' : 'community_credit_pools';
    const [account]: Account[] = await m.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [
      walletId ?? poolId,
    ]);
    if (!account) throw new NotFoundException('Credit account not found');
    return account;
  }

  private async assertActive(m: EntityManager, account: Account) {
    if (account.status !== 'ACTIVE')
      throw new ConflictException('Credit account is frozen or closed');
    if (account.user_id) {
      const [owner] = await m.query('SELECT status FROM users WHERE id=$1', [account.user_id]);
      const restrictions = await m.query(
        "SELECT id FROM global_account_restrictions WHERE user_id=$1 AND status='ACTIVE'",
        [account.user_id],
      );
      if (owner?.status !== 'ACTIVE' || restrictions.length) {
        throw new ConflictException('The account owner is restricted');
      }
    } else {
      const [org] = await m.query('SELECT status FROM organizations WHERE id=$1', [
        account.organization_id,
      ]);
      if (org?.status !== 'ACTIVE') throw new ConflictException('Pool organization is inactive');
    }
  }

  private async move(
    m: EntityManager,
    a: Account,
    pool: boolean,
    balanceDelta: number,
    frozenDelta: number,
  ) {
    const balance = cents(a.balance_credits) + balanceDelta;
    const frozen = cents(a.frozen_credits) + frozenDelta;
    if (balance < 0 || frozen < 0) throw new ConflictException('Not enough available credits');
    const table = pool ? 'community_credit_pools' : 'universal_time_wallets';
    await m.query(
      `UPDATE ${table} SET balance_credits=$2, frozen_credits=$3, updated_at=NOW() WHERE id=$1`,
      [a.id, balance / 100, frozen / 100],
    );
    a.balance_credits = String(balance / 100);
    a.frozen_credits = String(frozen / 100);
  }

  private async post(
    m: EntityManager,
    org: string,
    account: Account,
    pool: boolean,
    type: string,
    amount: number,
    frozenDelta: number,
    link: { reviewId?: string; operationId?: string; requestId?: string },
  ) {
    await m.query(
      `INSERT INTO time_credit_ledger(wallet_id,pool_id,amount,balance_after,held,tx_type,
       originating_org_id,frozen_delta,review_id,operation_id,service_request_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        pool ? null : account.id,
        pool ? account.id : null,
        amount / 100,
        account.balance_credits,
        type === 'CREDIT_CORRECTED',
        type,
        org,
        frozenDelta / 100,
        link.reviewId ?? null,
        link.operationId ?? null,
        link.requestId ?? null,
      ],
    );
  }

  private async event(
    m: EntityManager,
    org: string,
    actor: string,
    id: string,
    type: string,
    payload: Record<string, unknown>,
  ) {
    await this.audit.logEvent(
      {
        eventType: type,
        actorId: actor,
        organizationId: org,
        targetId: id,
        targetType: type.startsWith('CREDIT_REVIEW') ? 'credit_reviews' : 'credit_operations',
        payload,
      },
      m,
    );
  }

  async openReview(org: string, actor: string, dto: OpenCreditReviewDto) {
    this.validateAmount(dto);
    return this.db.transaction(async (m) => {
      await this.authority(m, org, actor, [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN]);
      // Serialize repeated keys even if a retry tries to change its target account.
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `credit-review:${actor}:${dto.idempotencyKey}`,
      ]);
      const [previous]: Review[] = await m.query(
        'SELECT * FROM credit_reviews WHERE opened_by=$1 AND idempotency_key=$2',
        [actor, dto.idempotencyKey],
      );
      if (previous) {
        if (
          previous.organization_id !== org ||
          previous.source_entry_id !== dto.sourceEntryId ||
          previous.parent_review_id !== (dto.parentReviewId ?? null) ||
          cents(previous.amount) !== cents(dto.amount) ||
          previous.reason !== dto.reason
        ) {
          throw new ConflictException('Review key already used for a different review');
        }
        return { ...previous, replayed: true };
      }
      // Parent-before-child locks serialize downstream reservations without ever
      // multiplying one disputed amount across several recipients.
      let parent: Review | undefined;
      if (dto.parentReviewId) {
        [parent] = await m.query('SELECT * FROM credit_reviews WHERE id=$1 FOR UPDATE', [
          dto.parentReviewId,
        ]);
        if (!parent || parent.decision)
          throw new ConflictException('An open parent review is required');
      }
      const [source] = await m.query(
        `SELECT l.* FROM time_credit_ledger l
         LEFT JOIN community_credit_pools p ON p.id=l.pool_id
         WHERE l.id=$1 AND ((l.wallet_id IS NOT NULL AND l.originating_org_id=$2) OR p.organization_id=$2)
         AND l.tx_type IN ('SERVICE_EARNED','DONATION_RECEIVED') AND l.amount>0`,
        [dto.sourceEntryId, org],
      );
      if (!source)
        throw new NotFoundException('Spendable source credit not found in this organization');
      if (parent) {
        // A recipient credit must be the other leg of an actual donation made
        // by the parent wallet after that wallet received its disputed source.
        const [transfer] = await m.query(
          `SELECT sent.id FROM time_credit_ledger sent
           JOIN time_credit_ledger parent_source ON parent_source.id=$1
           WHERE sent.donation_id=$2 AND sent.tx_type='DONATION_SENT'
           AND sent.wallet_id=$3 AND sent.created_at>=parent_source.created_at`,
          [parent.source_entry_id, source.donation_id, parent.wallet_id],
        );
        if (!transfer || source.tx_type !== 'DONATION_RECEIVED') {
          throw new BadRequestException('Source is not a downstream donation from this review');
        }
        const [{ allocated }] = await m.query(
          'SELECT COALESCE(sum(amount),0) AS allocated FROM credit_reviews WHERE parent_review_id=$1',
          [parent.id],
        );
        if (
          cents(dto.amount) >
          cents(parent.amount) - cents(parent.held_amount) - cents(allocated)
        ) {
          throw new ConflictException(
            'Amount exceeds the parent review’s unheld, unallocated credits',
          );
        }
      }
      const account = await this.account(m, source.wallet_id, source.pool_id);
      if (account.user_id === actor)
        throw new ForbiddenException('You cannot review your own credits');
      const [{ used }] = await m.query(
        "SELECT COALESCE(sum(amount),0) AS used FROM credit_reviews WHERE source_entry_id=$1 AND (decision IS NULL OR decision='CORRECT')",
        [source.id],
      );
      if (cents(used) + cents(dto.amount) > cents(source.amount)) {
        throw new ConflictException('Review amount exceeds the undisputed source credits');
      }
      // Spent credits are recorded as disputed but never create a negative
      // balance. Staff can follow actual donation legs for the unheld remainder.
      const fromFrozen = source.held === true;
      const preFrozen = fromFrozen
        ? Math.min(cents(dto.amount), await this.availableFrozenEarnings(m, account, org))
        : 0;
      const moved = Math.min(cents(dto.amount) - preFrozen, cents(account.balance_credits));
      const held = preFrozen + moved;
      await this.move(m, account, !!source.pool_id, -moved, moved);
      const [inserted]: Review[] = await m.query(
        `INSERT INTO credit_reviews(organization_id,source_entry_id,wallet_id,pool_id,amount,reason,opened_by,idempotency_key,held_amount,parent_review_id,from_frozen,pre_frozen_amount)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [
          org,
          source.id,
          source.wallet_id,
          source.pool_id,
          dto.amount,
          dto.reason,
          actor,
          dto.idempotencyKey,
          held / 100,
          parent?.id ?? null,
          fromFrozen,
          preFrozen / 100,
        ],
      );
      const review = inserted!;
      if (moved > 0)
        await this.post(m, org, account, !!source.pool_id, 'FRAUD_HELD', -moved, moved, {
          reviewId: review.id,
        });
      await this.event(m, org, actor, review.id, 'CREDIT_REVIEW_OPENED', {
        sourceEntryId: source.id,
        amount: dto.amount,
        heldAmount: held / 100,
        fromFrozen,
        preFrozenAmount: preFrozen / 100,
        parentReviewId: parent?.id ?? null,
        reason: dto.reason,
      });
      return { ...review, replayed: false };
    });
  }

  async investigate(org: string, actor: string, reviewId: string, dto: InvestigateCreditReviewDto) {
    if (
      !dto.investigation?.trim() ||
      dto.investigation.trim().length < 10 ||
      dto.investigation.length > 2000
    ) {
      throw new BadRequestException('Record the investigation findings');
    }
    return this.db.transaction(async (m) => {
      await this.authority(m, org, actor, [UserRole.COORDINATOR]);
      const review = await this.review(m, org, reviewId);
      const account = await this.account(m, review.wallet_id, review.pool_id);
      if (account.user_id === actor)
        throw new ForbiddenException('You cannot investigate your own credits');
      if (review.investigated_by) {
        if (review.investigated_by === actor && review.investigation === dto.investigation)
          return review;
        throw new ConflictException('Investigation is already recorded');
      }
      if (review.decision) throw new ConflictException('Review is already resolved');
      const [updated] = await m.query(
        'UPDATE credit_reviews SET investigation=$2, investigated_by=$3 WHERE id=$1 RETURNING *',
        [review.id, dto.investigation, actor],
      );
      await this.event(m, org, actor, review.id, 'CREDIT_REVIEW_INVESTIGATED', {
        investigation: dto.investigation,
      });
      return updated;
    });
  }

  private async review(m: EntityManager, org: string, reviewId: string): Promise<Review> {
    const [review] = await m.query(
      'SELECT * FROM credit_reviews WHERE id=$1 AND organization_id=$2 FOR UPDATE',
      [reviewId, org],
    );
    if (!review) throw new NotFoundException('Credit review not found');
    return review;
  }

  async resolve(org: string, actor: string, reviewId: string, dto: ResolveCreditReviewDto) {
    if (
      !['RELEASE', 'CORRECT'].includes(dto.decision) ||
      !dto.resolution?.trim() ||
      dto.resolution.trim().length < 10 ||
      dto.resolution.length > 2000
    ) {
      throw new BadRequestException('Supply a decision and resolution');
    }
    return this.db.transaction(async (m) => {
      await this.authority(m, org, actor, [UserRole.MUNICIPALITY_ADMIN]);
      const review = await this.review(m, org, reviewId);
      if (review.decision) {
        const [resolved] = await m.query('SELECT resolved_by FROM credit_reviews WHERE id=$1', [
          review.id,
        ]);
        if (
          resolved.resolved_by === actor &&
          review.decision === dto.decision &&
          review.resolution === dto.resolution
        ) {
          return { ...review, replayed: true };
        }
        throw new ConflictException('Review is already resolved');
      }
      if (!review.investigated_by)
        throw new ConflictException('A coordinator must investigate first');
      if (review.investigated_by === actor || review.opened_by === actor) {
        throw new ForbiddenException('A different administrator must authorize the resolution');
      }
      const children = await m.query(
        'SELECT decision FROM credit_reviews WHERE parent_review_id=$1',
        [review.id],
      );
      if (children.some((child: { decision: string | null }) => child.decision === null)) {
        throw new ConflictException('Resolve downstream reviews first');
      }
      const account = await this.account(m, review.wallet_id, review.pool_id);
      if (account.user_id === actor)
        throw new ForbiddenException('You cannot resolve your own credits');
      const released = dto.decision === 'RELEASE';
      // A resolved fraud case must not make banned/suspended credits spendable.
      if (released) await this.assertActive(m, account);
      const amount = cents(review.held_amount);
      await this.move(m, account, !!review.pool_id, released ? amount : 0, -amount);
      if (amount > 0)
        await this.post(
          m,
          org,
          account,
          !!review.pool_id,
          released ? 'FRAUD_RELEASED' : 'CREDIT_CORRECTED',
          released ? amount : -amount,
          -amount,
          { reviewId: review.id },
        );
      const [updated] = await m.query(
        `UPDATE credit_reviews SET decision=$2, resolution=$3, resolved_by=$4, resolved_at=NOW()
         WHERE id=$1 RETURNING *`,
        [review.id, dto.decision, dto.resolution, actor],
      );
      await this.event(m, org, actor, review.id, 'CREDIT_REVIEW_RESOLVED', {
        decision: dto.decision,
        resolution: dto.resolution,
        amount: amount / 100,
      });
      return { ...updated, replayed: false };
    });
  }

  async listReviews(org: string, actor: string, page = 1, limit = 20) {
    return this.db.transaction(async (m) => {
      await this.authority(m, org, actor, [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN]);
      const data = await m.query(
        `SELECT r.*, w.user_id AS subject_user_id, pool.name AS pool_name,
          COALESCE(member.membership_number,recipient.membership_number) AS membership_number,
          req.request_number,
          (SELECT count(*)::int FROM credit_reviews child WHERE child.parent_review_id=r.id AND child.decision IS NULL) AS pending_children,
          GREATEST(0,r.amount-r.held_amount-COALESCE((SELECT sum(child.amount) FROM credit_reviews child WHERE child.parent_review_id=r.id),0)) AS unallocated_amount
         FROM credit_reviews r
         LEFT JOIN universal_time_wallets w ON w.id=r.wallet_id
         LEFT JOIN community_credit_pools pool ON pool.id=r.pool_id
         LEFT JOIN organization_memberships member ON member.user_id=w.user_id AND member.organization_id=r.organization_id
         JOIN time_credit_ledger source ON source.id=r.source_entry_id
         LEFT JOIN service_requests req ON req.id=source.service_request_id
         LEFT JOIN credit_donations donation ON donation.id=source.donation_id
         LEFT JOIN organization_memberships recipient ON recipient.id=donation.recipient_membership_id
         WHERE r.organization_id=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT $2 OFFSET $3`,
        [org, Math.min(limit, 100), (page - 1) * limit],
      );
      const [{ total }] = await m.query(
        'SELECT count(*)::int AS total FROM credit_reviews WHERE organization_id=$1',
        [org],
      );
      return { data, total };
    });
  }

  /** Actual transfer legs to investigate, not an assertion that a recipient committed fraud. */
  async downstreamTransfers(org: string, actor: string, reviewId: string, page = 1, limit = 20) {
    return this.db.transaction(async (m) => {
      await this.authority(m, org, actor, [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN]);
      const review = await this.review(m, org, reviewId);
      const data = await m.query(
        `SELECT received.id AS source_entry_id, received.amount,
           COALESCE(pool.organization_id,received.originating_org_id) AS review_organization_id,
           received.created_at, organization.name AS organization_name,
           COALESCE(pool.name,recipient.membership_number,'Member wallet') AS recipient_label
         FROM time_credit_ledger sent
         JOIN time_credit_ledger received ON received.donation_id=sent.donation_id
           AND received.tx_type='DONATION_RECEIVED'
         JOIN time_credit_ledger source ON source.id=$1
         LEFT JOIN community_credit_pools pool ON pool.id=received.pool_id
         JOIN organizations organization ON organization.id=COALESCE(pool.organization_id,received.originating_org_id)
         LEFT JOIN credit_donations donation ON donation.id=received.donation_id
         LEFT JOIN organization_memberships recipient ON recipient.id=donation.recipient_membership_id
         WHERE sent.wallet_id=$2 AND sent.tx_type='DONATION_SENT' AND sent.created_at>=source.created_at
         ORDER BY sent.created_at,sent.id LIMIT $3 OFFSET $4`,
        [review.source_entry_id, review.wallet_id, Math.min(limit, 100), (page - 1) * limit],
      );
      return { data };
    });
  }

  async poolHistory(org: string, actor: string, poolId: string, page = 1, limit = 20) {
    return this.db.transaction(async (m) => {
      await this.authority(m, org, actor, [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN]);
      const [pool] = await m.query(
        'SELECT id,balance_credits,frozen_credits,status FROM community_credit_pools WHERE id=$1 AND organization_id=$2',
        [poolId, org],
      );
      if (!pool) throw new NotFoundException('Pool not found in this organization');
      const data = await m.query(
        `SELECT l.id,l.amount,l.balance_after,l.frozen_delta,l.held,l.tx_type,l.originating_org_id,
          l.service_request_id,l.review_id,l.operation_id,l.created_at,req.request_number,
          GREATEST(0,l.amount-COALESCE((SELECT sum(r.amount) FROM credit_reviews r WHERE r.source_entry_id=l.id
            AND (r.decision IS NULL OR r.decision='CORRECT')),0)) AS reviewable_amount
          FROM time_credit_ledger l LEFT JOIN service_requests req ON req.id=l.service_request_id
          WHERE l.pool_id=$1 ORDER BY l.created_at DESC,l.id DESC LIMIT $2 OFFSET $3`,
        [poolId, Math.min(limit, 100), (page - 1) * limit],
      );
      const [{ total }] = await m.query(
        'SELECT count(*)::int AS total FROM time_credit_ledger WHERE pool_id=$1',
        [poolId],
      );
      return { ...pool, data, total };
    });
  }

  /** Local staff see local ledger entries; the user's other organizations' history is private. */
  async walletHistory(org: string, actor: string, userId: string, page = 1, limit = 20) {
    return this.db.transaction(async (m) => {
      await this.authority(m, org, actor, [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN]);
      const [member] = await m.query(
        "SELECT membership_number FROM organization_memberships WHERE organization_id=$1 AND user_id=$2 AND status='APPROVED'",
        [org, userId],
      );
      if (!member) throw new NotFoundException('Member not found in this organization');
      const [wallet] = await m.query(
        `SELECT w.*,u.status AS account_status FROM universal_time_wallets w JOIN users u ON u.id=w.user_id WHERE w.user_id=$1`,
        [userId],
      );
      if (!wallet)
        return { membershipNumber: member.membership_number, wallet: null, data: [], total: 0 };
      const restrictions = await m.query(
        "SELECT id FROM global_account_restrictions WHERE user_id=$1 AND status='ACTIVE'",
        [userId],
      );
      const data = await m.query(
        `SELECT l.id,l.amount,l.balance_after,l.frozen_delta,l.held,l.tx_type,l.created_at,
          l.review_id,l.operation_id,req.request_number,
          GREATEST(0,l.amount-COALESCE((SELECT sum(r.amount) FROM credit_reviews r WHERE r.source_entry_id=l.id
            AND (r.decision IS NULL OR r.decision='CORRECT')),0)) AS reviewable_amount
         FROM time_credit_ledger l LEFT JOIN service_requests req ON req.id=l.service_request_id
         WHERE l.wallet_id=$1 AND l.originating_org_id=$2 ORDER BY l.created_at DESC,l.id DESC LIMIT $3 OFFSET $4`,
        [wallet.id, org, Math.min(limit, 100), (page - 1) * limit],
      );
      const [{ total }] = await m.query(
        'SELECT count(*)::int AS total FROM time_credit_ledger WHERE wallet_id=$1 AND originating_org_id=$2',
        [wallet.id, org],
      );
      return {
        membershipNumber: member.membership_number,
        wallet: {
          status: wallet.status,
          accountStatus: wallet.account_status,
          restricted: restrictions.length > 0,
          balanceCredits: Number(wallet.balance_credits),
          frozenCredits: Number(wallet.frozen_credits),
          releasableCredits: (await this.availableFrozenEarnings(m, wallet, org)) / 100,
        },
        data,
        total,
      };
    });
  }

  async fundingSummary(org: string, actor: string, requestId: string) {
    return this.db.transaction(async (m) => {
      await this.authority(m, org, actor, [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN]);
      const [request] = await m.query(
        'SELECT request_number,status FROM service_requests WHERE id=$1 AND organization_id=$2',
        [requestId, org],
      );
      if (!request) throw new NotFoundException('Service request not found');
      const [{ earned }] = await m.query(
        "SELECT COALESCE(sum(amount),0) AS earned FROM time_credit_ledger WHERE service_request_id=$1 AND tx_type='SERVICE_EARNED'",
        [requestId],
      );
      const [funding] = await m.query(
        `SELECT op.amount,op.created_at,p.name AS pool_name FROM credit_operations op
         LEFT JOIN community_credit_pools p ON p.id=op.pool_id WHERE op.service_request_id=$1`,
        [requestId],
      );
      return {
        requestNumber: request.request_number,
        status: request.status,
        verifiedCredits: Number(earned),
        funding: funding
          ? {
              amount: Number(funding.amount),
              createdAt: funding.created_at,
              source: funding.pool_name ?? 'Voluntary member contribution',
            }
          : null,
      };
    });
  }

  async releaseFrozen(org: string, actor: string, userId: string, dto: CreditAmountDto) {
    this.validateAmount(dto);
    return this.db.transaction(async (m) => {
      await this.authority(m, org, actor, [UserRole.MUNICIPALITY_ADMIN]);
      if (userId === actor) throw new ForbiddenException('You cannot release your own credits');
      const [wallet] = await m.query('SELECT id FROM universal_time_wallets WHERE user_id=$1', [
        userId,
      ]);
      if (!wallet) throw new NotFoundException('Wallet not found');
      const account = await this.account(m, wallet.id, null);
      const previous = await this.previousOperation(
        m,
        org,
        actor,
        dto,
        'FROZEN_RELEASED',
        account.id,
        null,
        null,
      );
      if (previous) return { ...previous, replayed: true };
      await this.assertActive(m, account);
      // Administrators release only their own organization's held earnings, never
      // another tenant's credits or funds reserved for an open fraud review.
      const releasable = await this.availableFrozenEarnings(m, account, org);
      if (cents(dto.amount) > releasable)
        throw new ConflictException('Amount exceeds this organization’s held earnings');
      await this.move(m, account, false, cents(dto.amount), -cents(dto.amount));
      const operation = await this.operation(
        m,
        org,
        actor,
        dto,
        'FROZEN_RELEASED',
        account.id,
        null,
        null,
      );
      await this.post(
        m,
        org,
        account,
        false,
        'FROZEN_RELEASED',
        cents(dto.amount),
        -cents(dto.amount),
        { operationId: operation.id },
      );
      await this.event(m, org, actor, operation.id, 'FROZEN_CREDITS_RELEASED', {
        userId,
        amount: dto.amount,
        reason: dto.reason,
      });
      return { ...operation, replayed: false };
    });
  }

  /**
   * When a restriction ends and no other remains, what the person earned during it comes back
   * (BR-11, D#85). A wallet frozen for another reason stays frozen, and an open review keeps what
   * it reserved. Earlier holds stay with an administrator, through releaseFrozen.
   */
  async releaseRestrictionHolds(
    m: EntityManager,
    userId: string,
    since: Date,
    actor: string,
    reference: string,
  ): Promise<number> {
    const [wallet] = await m.query('SELECT id FROM universal_time_wallets WHERE user_id=$1', [
      userId,
    ]);
    if (!wallet) return 0;
    const account = await this.account(m, wallet.id, null);
    if (account.status !== 'ACTIVE') return 0;
    const held: { org: string; amount: string }[] = await m.query(
      `SELECT originating_org_id AS org, sum(amount) AS amount FROM time_credit_ledger
       WHERE wallet_id=$1 AND tx_type='SERVICE_EARNED' AND held AND created_at>=$2
         AND originating_org_id IS NOT NULL
       GROUP BY originating_org_id`,
      [account.id, since],
    );
    let released = 0;
    for (const { org, amount } of held) {
      const releasable = Math.min(
        cents(amount),
        await this.availableFrozenEarnings(m, account, org),
      );
      if (releasable <= 0) continue;
      const dto = {
        amount: releasable / 100,
        idempotencyKey: `restriction-${reference}-${org}`,
        reason: `Access returned (${reference})`,
      } as CreditAmountDto;
      await this.move(m, account, false, releasable, -releasable);
      const operation = await this.operation(
        m,
        org,
        actor,
        dto,
        'FROZEN_RELEASED',
        account.id,
        null,
        null,
      );
      await this.post(m, org, account, false, 'FROZEN_RELEASED', releasable, -releasable, {
        operationId: operation.id,
      });
      await this.event(m, org, actor, operation.id, 'FROZEN_CREDITS_RELEASED', {
        userId,
        amount: dto.amount,
        reason: dto.reason,
      });
      released += releasable;
    }
    return released / 100;
  }

  /** Unreviewed held earnings; resolved frozen-source cases also consume their attribution. */
  private async availableFrozenEarnings(m: EntityManager, account: Account, org: string) {
    const [{ attributable, reserved }] = await m.query(
      `SELECT COALESCE((SELECT sum(amount) FROM time_credit_ledger WHERE wallet_id=$1
         AND originating_org_id=$2 AND tx_type='SERVICE_EARNED' AND held),0)
       - COALESCE((SELECT sum(amount) FROM credit_operations WHERE wallet_id=$1
         AND organization_id=$2 AND kind='FROZEN_RELEASED'),0)
       - COALESCE((SELECT sum(pre_frozen_amount) FROM credit_reviews WHERE wallet_id=$1
         AND organization_id=$2 AND from_frozen),0) AS attributable,
       COALESCE((SELECT sum(held_amount) FROM credit_reviews WHERE wallet_id=$1
         AND resolved_at IS NULL),0) AS reserved`,
      [account.id, org],
    );
    return Math.max(
      0,
      Math.min(cents(attributable), cents(account.frozen_credits) - cents(reserved)),
    );
  }

  /** Blanket wallet controls are global authority; local staff manage sourced holds instead. */
  async changeWalletStatus(org: string, actor: string, userId: string, dto: ChangeWalletStatusDto) {
    if (
      !['ACTIVE', 'FROZEN'].includes(dto.status) ||
      !dto.idempotencyKey ||
      dto.idempotencyKey.length < 8 ||
      dto.idempotencyKey.length > 100 ||
      !dto.reason?.trim() ||
      dto.reason.trim().length < 5 ||
      dto.reason.length > 1000
    ) {
      throw new BadRequestException('Supply a wallet status, reason and retry key');
    }
    return this.db.transaction(async (m) => {
      await this.authority(m, org, actor, [UserRole.SUPER_ADMIN]);
      if (actor === userId)
        throw new ForbiddenException('You cannot change your own wallet status');
      const [wallet] = await m.query('SELECT id FROM universal_time_wallets WHERE user_id=$1', [
        userId,
      ]);
      if (!wallet) throw new NotFoundException('Wallet not found');
      const account = await this.account(m, wallet.id, null);
      const [previous] = await m.query(
        `SELECT id,payload FROM audit_events WHERE actor_id=$1 AND target_id=$2
         AND event_type='TIME_WALLET_STATUS_CHANGED' AND payload->>'idempotencyKey'=$3`,
        [actor, account.id, dto.idempotencyKey],
      );
      if (previous) {
        if (
          previous.payload.status !== dto.status ||
          previous.payload.reason !== dto.reason ||
          previous.payload.organizationId !== org
        )
          throw new ConflictException('Wallet key already used for a different change');
        return { auditId: previous.id, status: previous.payload.status, replayed: true };
      }
      if (!['ACTIVE', 'FROZEN'].includes(account.status))
        throw new ConflictException('Closed wallet cannot be changed');
      if (dto.status === 'ACTIVE') await this.assertActive(m, { ...account, status: 'ACTIVE' });
      await m.query('UPDATE universal_time_wallets SET status=$2, updated_at=NOW() WHERE id=$1', [
        account.id,
        dto.status,
      ]);
      const event = await this.audit.logEvent(
        {
          eventType: 'TIME_WALLET_STATUS_CHANGED',
          actorId: actor,
          targetId: account.id,
          targetType: 'universal_time_wallets',
          organizationId: org,
          payload: {
            previousStatus: account.status,
            status: dto.status,
            reason: dto.reason,
            organizationId: org,
            idempotencyKey: dto.idempotencyKey,
          },
        },
        m,
      );
      return { auditId: event.id, status: dto.status, replayed: false };
    });
  }

  /** Voluntary funding of completed assistance; free eligibility never depends on this. */
  async spend(org: string, actor: string, requestId: string, dto: SpendAssistanceCreditsDto) {
    this.validateAmount(dto);
    return this.db.transaction(async (m) => {
      await this.authority(m, org, actor, dto.poolId ? [UserRole.MUNICIPALITY_ADMIN] : undefined);
      // A request lock serializes competing sponsors before account locks.
      const [request] = await m.query(
        'SELECT * FROM service_requests WHERE id=$1 AND organization_id=$2 FOR UPDATE',
        [requestId, org],
      );
      if (!request) throw new NotFoundException('Service request not found');
      // Funding must not disclose someone else's private request to a member.
      if (!dto.poolId) {
        const [membership] = await m.query(
          'SELECT user_id FROM organization_memberships WHERE id=$1',
          [request.beneficiary_membership_id],
        );
        if (membership?.user_id !== actor && request.created_by_user_id !== actor) {
          throw new ForbiddenException(
            'Only the recipient or request creator can volunteer their credits',
          );
        }
      }
      let walletId: string | null = null;
      if (!dto.poolId) {
        const [wallet] = await m.query('SELECT id FROM universal_time_wallets WHERE user_id=$1', [
          actor,
        ]);
        if (!wallet) throw new ConflictException('No credits are available');
        walletId = wallet.id;
      }
      const account = await this.account(m, walletId, dto.poolId ?? null);
      if (dto.poolId && account.organization_id !== org)
        throw new NotFoundException('Pool not found in this organization');
      const previous = await this.previousOperation(
        m,
        org,
        actor,
        dto,
        'ASSISTANCE_SPENT',
        walletId,
        dto.poolId ?? null,
        requestId,
      );
      if (previous) return { ...previous, replayed: true };
      await this.assertActive(m, account);
      if (request.status !== 'COMPLETED')
        throw new ConflictException(
          'Only independently confirmed, completed assistance can be funded',
        );
      const [{ earned }] = await m.query(
        "SELECT COALESCE(sum(amount),0) AS earned FROM time_credit_ledger WHERE service_request_id=$1 AND tx_type='SERVICE_EARNED'",
        [requestId],
      );
      if (cents(dto.amount) > cents(earned))
        throw new ConflictException('Funding exceeds verified service credits');
      const [funded] = await m.query(
        'SELECT id FROM credit_operations WHERE service_request_id=$1',
        [requestId],
      );
      if (funded) throw new ConflictException('This request has already been funded');
      await this.move(m, account, !!dto.poolId, -cents(dto.amount), 0);
      const operation = await this.operation(
        m,
        org,
        actor,
        dto,
        'ASSISTANCE_SPENT',
        walletId,
        dto.poolId ?? null,
        requestId,
      );
      await this.post(m, org, account, !!dto.poolId, 'ASSISTANCE_SPENT', -cents(dto.amount), 0, {
        operationId: operation.id,
        requestId,
      });
      await this.event(m, org, actor, operation.id, 'ASSISTANCE_CREDITS_SPENT', {
        requestId,
        poolId: dto.poolId ?? null,
        amount: dto.amount,
        reason: dto.reason,
      });
      return { ...operation, replayed: false };
    });
  }

  private async previousOperation(
    m: EntityManager,
    org: string,
    actor: string,
    dto: CreditAmountDto,
    kind: string,
    wallet: string | null,
    pool: string | null,
    request: string | null,
  ) {
    // Separate from account locks: a key is global to the actor, not the account.
    // A non-blocking lock avoids reversing request/wallet lock order on mismatched retries.
    const [{ locked }] = await m.query(
      'SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',
      [`credit-op:${actor}:${dto.idempotencyKey}`],
    );
    if (!locked)
      throw new ConflictException('This credit operation is still processing; retry shortly');
    const [previous] = await m.query(
      'SELECT * FROM credit_operations WHERE actor_id=$1 AND idempotency_key=$2',
      [actor, dto.idempotencyKey],
    );
    if (
      previous &&
      (previous.organization_id !== org ||
        previous.kind !== kind ||
        previous.wallet_id !== wallet ||
        previous.pool_id !== pool ||
        previous.service_request_id !== request ||
        cents(previous.amount) !== cents(dto.amount) ||
        previous.reason !== dto.reason)
    ) {
      throw new ConflictException('Credit key already used for a different operation');
    }
    return previous;
  }

  private async operation(
    m: EntityManager,
    org: string,
    actor: string,
    dto: CreditAmountDto,
    kind: string,
    wallet: string | null,
    pool: string | null,
    request: string | null,
  ) {
    const [operation] = await m.query(
      `INSERT INTO credit_operations(organization_id,actor_id,kind,wallet_id,pool_id,service_request_id,amount,idempotency_key,reason)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [org, actor, kind, wallet, pool, request, dto.amount, dto.idempotencyKey, dto.reason],
    );
    return operation;
  }
}
