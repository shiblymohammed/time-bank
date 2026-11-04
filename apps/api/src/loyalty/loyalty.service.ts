import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  LoyaltyCoinTxType,
  MerchantOfferStatus,
  MerchantStatus,
  UserRole,
} from '@ktb/shared-types';

import { LoyaltyCoinWallet } from './entities/loyalty-coin-wallet.entity';
import { LoyaltyCoinLedger } from './entities/loyalty-coin-ledger.entity';
import { OrganizationMerchant } from './entities/organization-merchant.entity';
import { MerchantOffer } from './entities/merchant-offer.entity';
import { LoyaltyRedemption } from './entities/loyalty-redemption.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';

import { RegisterMerchantDto } from './dto/register-merchant.dto';
import { ProposeOfferDto } from './dto/propose-offer.dto';
import { ReviewOfferDto } from './dto/review-offer.dto';
import { RedeemOfferDto } from './dto/redeem-offer.dto';

/**
 * LoyaltyService — Milestone 6 Loyalty Coins & Merchants.
 *
 * Manages:
 *   - Loyalty coin wallets (per user per org, municipality-scoped)
 *   - Merchant registration and Municipality Admin approval
 *   - Merchant offer proposal and review workflow
 *   - Offer redemption via QR / one-time code (atomic, double-spend-proof)
 *   - Coin earning on service confirmation (called from RequestsService)
 */
@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  // Default coin earning rate per confirmed minute (configurable per catalogue item in future)
  private static readonly COINS_PER_MINUTE = 1; // 1 coin per minute worked

  constructor(
    @InjectRepository(LoyaltyCoinWallet)
    private readonly walletRepo: Repository<LoyaltyCoinWallet>,
    @InjectRepository(LoyaltyCoinLedger)
    private readonly ledgerRepo: Repository<LoyaltyCoinLedger>,
    @InjectRepository(OrganizationMerchant)
    private readonly merchantRepo: Repository<OrganizationMerchant>,
    @InjectRepository(MerchantOffer)
    private readonly offerRepo: Repository<MerchantOffer>,
    @InjectRepository(LoyaltyRedemption)
    private readonly redemptionRepo: Repository<LoyaltyRedemption>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepo: Repository<OrganizationMembership>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  // ─── Coin Wallet ──────────────────────────────────────────────────────────────

  /**
   * Gets or creates a loyalty coin wallet for a user in a specific organization.
   * Idempotent — safe to call multiple times.
   */
  async getOrCreateWallet(
    userId: string,
    organizationId: string,
    manager?: EntityManager,
  ): Promise<LoyaltyCoinWallet> {
    const repo = manager
      ? manager.getRepository(LoyaltyCoinWallet)
      : this.walletRepo;

    const existing = await repo.findOne({ where: { userId, organizationId } });
    if (existing) return existing;

    const wallet = repo.create({ userId, organizationId, balanceCoins: 0, status: 'ACTIVE' });
    return repo.save(wallet);
  }

  /**
   * Returns the calling user's loyalty coin wallet for the given org,
   * along with their recent transaction history.
   */
  async getMyWallet(orgId: string, userId: string) {
    const wallet = await this.getOrCreateWallet(userId, orgId);
    const history = await this.ledgerRepo.find({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return {
      walletId: wallet.id,
      organizationId: orgId,
      balanceCoins: Number(wallet.balanceCoins),
      status: wallet.status,
      history: history.map((e) => ({
        id: e.id,
        amount: Number(e.amount),
        balanceAfter: Number(e.balanceAfter),
        txType: e.txType,
        reference: e.reference,
        createdAt: e.createdAt,
      })),
    };
  }

  // ─── Coin Earning (called transactionally from RequestsService) ───────────────

  /**
   * Posts a SERVICE_EARNED coin credit in the same transaction as service confirmation.
   * Creates the wallet lazily if it doesn't exist yet.
   * Enforced idempotent via unique index on (assignment_id, tx_type = 'SERVICE_EARNED').
   *
   * Called from RequestsService.confirmCompletion — pass the EntityManager to participate
   * in the confirmation transaction. (FR-LOY-01, D#3)
   */
  async postServiceEarning(
    manager: EntityManager,
    input: {
      userId: string;
      organizationId: string;
      serviceRequestId: string;
      assignmentId: string;
      confirmedMinutes: number;
    },
  ): Promise<{ coinsEarned: number }> {
    const coins = Math.round(input.confirmedMinutes * LoyaltyService.COINS_PER_MINUTE * 100) / 100;
    if (coins <= 0) return { coinsEarned: 0 };

    // Check idempotency — don't pay twice for the same assignment
    const existing = await manager.findOne(LoyaltyCoinLedger, {
      where: { assignmentId: input.assignmentId, txType: LoyaltyCoinTxType.SERVICE_EARNED },
    });
    if (existing) {
      this.logger.warn(`Coins already earned for assignment ${input.assignmentId} — skipping`);
      return { coinsEarned: Number(existing.amount) };
    }

    // Get or create wallet (within the same transaction)
    const wallet = await this.getOrCreateWallet(input.userId, input.organizationId, manager);

    if (wallet.status !== 'ACTIVE') {
      this.logger.warn(
        `Loyalty wallet not ACTIVE for user ${input.userId} in org ${input.organizationId} — skipping coin award`,
      );
      return { coinsEarned: 0 };
    }

    const newBalance = Number(wallet.balanceCoins) + coins;

    // Update wallet balance
    await manager.update(LoyaltyCoinWallet, { id: wallet.id }, { balanceCoins: newBalance });

    // Write ledger entry
    const entry = manager.create(LoyaltyCoinLedger, {
      walletId: wallet.id,
      organizationId: input.organizationId,
      amount: coins,
      balanceAfter: newBalance,
      txType: LoyaltyCoinTxType.SERVICE_EARNED,
      serviceRequestId: input.serviceRequestId,
      assignmentId: input.assignmentId,
      reference: `Service earned — ${input.confirmedMinutes} min`,
    });
    await manager.save(LoyaltyCoinLedger, entry);

    return { coinsEarned: coins };
  }

  // ─── Merchants ────────────────────────────────────────────────────────────────

  /**
   * Register a new merchant in the organization (Municipality Admin or Coordinator).
   * The merchant starts in PENDING_APPROVAL status.
   */
  async registerMerchant(
    orgId: string,
    dto: RegisterMerchantDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<OrganizationMerchant> {
    await this.assertStaff(orgId, actorId);

    const merchant = this.merchantRepo.create({
      organizationId: orgId,
      merchantName: dto.merchantName,
      phone: dto.phone,
      address: dto.address,
      category: dto.category ?? null,
      status: MerchantStatus.PENDING_APPROVAL,
      createdBy: actorId,
    });
    const saved = await this.merchantRepo.save(merchant);

    await this.auditService.logEvent({
      eventType: 'MERCHANT_REGISTERED',
      actorId,
      targetId: saved.id,
      targetType: 'organization_merchants',
      organizationId: orgId,
      payload: { merchantName: dto.merchantName },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  /**
   * Municipality Admin approves or suspends a merchant.
   */
  async reviewMerchant(
    orgId: string,
    merchantId: string,
    status: MerchantStatus.ACTIVE | MerchantStatus.SUSPENDED,
    actorId: string,
    ipAddress?: string,
  ): Promise<OrganizationMerchant> {
    await this.assertAdmin(orgId, actorId);

    const merchant = await this.merchantRepo.findOne({
      where: { id: merchantId, organizationId: orgId },
    });
    if (!merchant) throw new NotFoundException('Merchant not found in this organization');

    merchant.status = status;
    if (status === MerchantStatus.ACTIVE) {
      merchant.approvedBy = actorId;
      merchant.approvedAt = new Date();
    }
    const saved = await this.merchantRepo.save(merchant);

    await this.auditService.logEvent({
      eventType: 'MERCHANT_STATUS_UPDATED',
      actorId,
      targetId: saved.id,
      targetType: 'organization_merchants',
      organizationId: orgId,
      payload: { status },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async listMerchants(orgId: string): Promise<OrganizationMerchant[]> {
    return this.merchantRepo.find({
      where: { organizationId: orgId, status: MerchantStatus.ACTIVE },
      order: { merchantName: 'ASC' },
    });
  }

  // ─── Merchant Offers ──────────────────────────────────────────────────────────

  /**
   * Merchant (or staff) proposes a new offer for Municipality Admin review (FR-LOY-03, D#20).
   */
  async proposeOffer(
    orgId: string,
    merchantId: string,
    dto: ProposeOfferDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<MerchantOffer> {
    // Verify merchant is active in this org
    const merchant = await this.merchantRepo.findOne({
      where: { id: merchantId, organizationId: orgId, status: MerchantStatus.ACTIVE },
    });
    if (!merchant) throw new NotFoundException('Active merchant not found in this organization');

    const validFrom = new Date(dto.validFrom);
    const validUntil = new Date(dto.validUntil);
    if (validUntil <= validFrom) {
      throw new BadRequestException('valid_until must be after valid_from');
    }

    const offer = this.offerRepo.create({
      organizationId: orgId,
      merchantId,
      title: dto.title,
      description: dto.description,
      coinCost: dto.coinCost,
      maxRedemptions: dto.maxRedemptions ?? null,
      validFrom,
      validUntil,
      status: MerchantOfferStatus.PENDING_REVIEW,
      proposedBy: actorId,
    });
    const saved = await this.offerRepo.save(offer);

    await this.auditService.logEvent({
      eventType: 'MERCHANT_OFFER_PROPOSED',
      actorId,
      targetId: saved.id,
      targetType: 'merchant_offers',
      organizationId: orgId,
      payload: { title: dto.title, coinCost: dto.coinCost },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  /**
   * Municipality Admin approves or rejects a pending offer (FR-LOY-03, D#20).
   */
  async reviewOffer(
    orgId: string,
    offerId: string,
    dto: ReviewOfferDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<MerchantOffer> {
    await this.assertAdmin(orgId, actorId);

    const offer = await this.offerRepo.findOne({
      where: { id: offerId, organizationId: orgId },
    });
    if (!offer) throw new NotFoundException('Offer not found in this organization');

    if (offer.status !== MerchantOfferStatus.PENDING_REVIEW) {
      throw new ConflictException(`Offer is already ${offer.status}`);
    }

    if (dto.status === MerchantOfferStatus.REJECTED && !dto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required when rejecting an offer');
    }

    offer.status = dto.status;
    offer.reviewedBy = actorId;
    offer.reviewedAt = new Date();
    offer.rejectionReason = dto.rejectionReason ?? null;
    const saved = await this.offerRepo.save(offer);

    await this.auditService.logEvent({
      eventType: 'MERCHANT_OFFER_REVIEWED',
      actorId,
      targetId: saved.id,
      targetType: 'merchant_offers',
      organizationId: orgId,
      payload: { status: dto.status, rejectionReason: dto.rejectionReason ?? null },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  /**
   * Lists all ACTIVE offers available in an organization.
   */
  async listActiveOffers(orgId: string): Promise<MerchantOffer[]> {
    const now = new Date();
    return this.offerRepo
      .createQueryBuilder('offer')
      .where('offer.organizationId = :orgId', { orgId })
      .andWhere('offer.status = :status', { status: MerchantOfferStatus.ACTIVE })
      .andWhere('offer.validFrom <= :now', { now })
      .andWhere('offer.validUntil > :now', { now })
      .orderBy('offer.validUntil', 'ASC')
      .getMany();
  }

  // ─── Redemption (FR-LOY-04, D#21) ────────────────────────────────────────────

  /**
   * Redeems a merchant offer, debiting loyalty coins from the member's wallet.
   * Atomic — offer availability, wallet balance, and redemption record all commit together.
   * The unique constraint on one_time_code + the redemptions_count check prevent
   * double redemption (FR-LOY-04).
   */
  async redeemOffer(
    orgId: string,
    userId: string,
    dto: RedeemOfferDto,
    ipAddress?: string,
  ): Promise<LoyaltyRedemption> {
    if (!dto.offerId && !dto.oneTimeCode) {
      throw new BadRequestException('Either offerId or oneTimeCode must be provided');
    }

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // Resolve offer
      let offer: MerchantOffer | null = null;
      if (dto.offerId) {
        offer = await manager.findOne(MerchantOffer, {
          where: { id: dto.offerId, organizationId: orgId },
          lock: { mode: 'pessimistic_write' },
        });
      } else if (dto.oneTimeCode) {
        // One-time code path — find the offer by the code on a pending redemption
        // In this simpler implementation, oneTimeCode IS the offer lookup key
        // (the code is pre-generated and given to the merchant for their QR)
        offer = await manager
          .createQueryBuilder(MerchantOffer, 'o')
          .setLock('pessimistic_write')
          .where('o.organizationId = :orgId', { orgId })
          .andWhere("encode(decode(o.id::text, 'escape'), 'hex') LIKE :code OR o.id::text = :rawCode", {
            code: dto.oneTimeCode,
            rawCode: dto.oneTimeCode,
          })
          .getOne();
        // Fallback: look up by exact offerId if code is a UUID prefix
        if (!offer) {
          throw new NotFoundException('Offer not found for this code');
        }
      }

      if (!offer) throw new NotFoundException('Offer not found in this organization');

      const now = new Date();
      if (offer.status !== MerchantOfferStatus.ACTIVE) {
        throw new ConflictException(`Offer is not active (status: ${offer.status})`);
      }
      if (now < offer.validFrom || now > offer.validUntil) {
        throw new ConflictException('Offer is not valid at this time');
      }
      if (offer.maxRedemptions != null && offer.redemptionsCount >= offer.maxRedemptions) {
        throw new ConflictException('Offer has reached its maximum redemption limit');
      }

      // Get member's wallet and lock it
      const wallet = await manager
        .createQueryBuilder(LoyaltyCoinWallet, 'w')
        .setLock('pessimistic_write')
        .where('w.userId = :userId AND w.organizationId = :orgId', { userId, orgId })
        .getOne();

      if (!wallet) {
        throw new ForbiddenException('You do not have a loyalty coin wallet in this organization');
      }
      if (wallet.status !== 'ACTIVE') {
        throw new ForbiddenException('Your loyalty coin wallet is not active');
      }
      if (Number(wallet.balanceCoins) < offer.coinCost) {
        throw new BadRequestException(
          `Insufficient coins: need ${offer.coinCost}, have ${wallet.balanceCoins}`,
        );
      }

      // Generate a unique one-time code for this redemption
      const code = dto.oneTimeCode ?? this.generateOneTimeCode();

      const newBalance = Number(wallet.balanceCoins) - offer.coinCost;

      // Debit wallet
      await manager.update(LoyaltyCoinWallet, { id: wallet.id }, { balanceCoins: newBalance });

      // Write ledger debit entry
      const ledgerEntry = manager.create(LoyaltyCoinLedger, {
        walletId: wallet.id,
        organizationId: orgId,
        amount: -offer.coinCost,
        balanceAfter: newBalance,
        txType: LoyaltyCoinTxType.OFFER_REDEEMED,
        reference: `Redeemed: ${offer.title}`,
      });
      await manager.save(LoyaltyCoinLedger, ledgerEntry);

      // Increment offer redemption count
      await manager.increment(MerchantOffer, { id: offer.id }, 'redemptionsCount', 1);

      // Write redemption record
      const redemption = manager.create(LoyaltyRedemption, {
        organizationId: orgId,
        offerId: offer.id,
        merchantId: offer.merchantId,
        userId,
        walletId: wallet.id,
        coinsSpent: offer.coinCost,
        oneTimeCode: code,
      });
      const savedRedemption = await manager.save(LoyaltyRedemption, redemption);

      await this.auditService.logEvent(
        {
          eventType: 'LOYALTY_OFFER_REDEEMED',
          actorId: userId,
          targetId: savedRedemption.id,
          targetType: 'loyalty_redemptions',
          organizationId: orgId,
          payload: {
            offerId: offer.id,
            offerTitle: offer.title,
            coinsSpent: offer.coinCost,
            balanceAfter: newBalance,
          },
          ipAddress: ipAddress ?? null,
        },
        manager,
      );

      return savedRedemption;
    });
  }

  /**
   * Lists a merchant's redemption history (volume report for the merchant).
   */
  async listMerchantRedemptions(
    orgId: string,
    merchantId: string,
    actorId: string,
  ): Promise<LoyaltyRedemption[]> {
    // Validate merchant exists and is in this org
    const merchant = await this.merchantRepo.findOne({
      where: { id: merchantId, organizationId: orgId },
    });
    if (!merchant) throw new NotFoundException('Merchant not found in this organization');

    await this.assertStaff(orgId, actorId);

    return this.redemptionRepo.find({
      where: { merchantId, organizationId: orgId },
      order: { redeemedAt: 'DESC' },
      take: 200,
      relations: ['offer', 'user'],
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Generates a random 8-character alphanumeric one-time code. */
  private generateOneTimeCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable chars
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  private async assertStaff(orgId: string, actorId: string): Promise<void> {
    const context = await this.authorizationService.evaluateOrganizationAccess(actorId, orgId);
    if (
      !context.isSuperAdmin &&
      !context.roles.some((r) =>
        [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN].includes(r),
      )
    ) {
      throw new ForbiddenException('Staff authority required');
    }
  }

  private async assertAdmin(orgId: string, actorId: string): Promise<void> {
    const context = await this.authorizationService.evaluateOrganizationAccess(actorId, orgId);
    if (
      !context.isSuperAdmin &&
      !context.roles.some((r) =>
        [UserRole.MUNICIPALITY_ADMIN].includes(r),
      )
    ) {
      throw new ForbiddenException('Municipality Admin authority required');
    }
  }
}
