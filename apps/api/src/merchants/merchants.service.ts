import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { UserRole } from '@ktb/shared-types';
import QRCode from 'qrcode';
import { LoyaltyService } from '../loyalty/loyalty.service';
import {
  ConsumeRedemptionDto,
  IssueRedemptionDto,
  LoyaltyCampaignDto,
  MerchantApplicationDto,
  MerchantOfferDto,
} from './dto/merchant.dto';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class MerchantsService {
  constructor(
    private readonly db: DataSource,
    private readonly loyalty: LoyaltyService,
    private readonly config: ConfigService,
  ) {}

  private dates(starts: string, ends: string) {
    if (
      ![starts, ends].every(
        (value) => Number.isFinite(new Date(value).getTime()) && /(Z|[+-]\d{2}:\d{2})$/.test(value),
      ) ||
      new Date(starts) >= new Date(ends) ||
      new Date(ends) <= new Date()
    ) {
      throw new BadRequestException(
        'Choose a valid start and future end time, including a time zone',
      );
    }
  }

  private async owner(m: EntityManager, org: string, user: string, lock = false) {
    await this.loyalty.actor(m, org, user, [UserRole.MERCHANT]);
    const [row] = await m.query(
      `SELECT * FROM organization_merchants WHERE organization_id=$1 AND owner_user_id=$2${lock ? ' FOR UPDATE' : ''}`,
      [org, user],
    );
    if (!row) throw new NotFoundException('Register your business first');
    return row;
  }

  async apply(org: string, user: string, dto: MerchantApplicationDto) {
    return this.db.transaction(async (m) => {
      await this.loyalty.actor(m, org, user, [UserRole.MERCHANT]);
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `merchant:${org}:${user}`,
      ]);
      const [prior] = await m.query(
        'SELECT * FROM organization_merchants WHERE organization_id=$1 AND owner_user_id=$2 FOR UPDATE',
        [org, user],
      );
      if (prior && prior.status !== 'REJECTED') {
        if (
          prior.name === dto.name.trim() &&
          prior.address === dto.address.trim() &&
          prior.phone === dto.phone
        )
          return prior;
        throw new ConflictException('Your business already has an application or approval');
      }
      const [row] = prior
        ? await m.query(
            "WITH changed AS (UPDATE organization_merchants SET name=$2,address=$3,phone=$4,status='PENDING',decided_by=NULL,decided_at=NULL WHERE id=$1 RETURNING *) SELECT * FROM changed",
            [prior.id, dto.name.trim(), dto.address.trim(), dto.phone],
          )
        : await m.query(
            'INSERT INTO organization_merchants(organization_id,owner_user_id,name,address,phone) VALUES($1,$2,$3,$4,$5) RETURNING *',
            [org, user, dto.name.trim(), dto.address.trim(), dto.phone],
          );
      await this.loyalty.event(m, org, user, 'MERCHANT_APPLIED', row.id, {});
      return row;
    });
  }

  async mine(org: string, user: string) {
    await this.loyalty.actor(this.db.manager, org, user, [UserRole.MERCHANT]);
    const [merchant] = await this.db.query(
      'SELECT * FROM organization_merchants WHERE organization_id=$1 AND owner_user_id=$2',
      [org, user],
    );
    return {
      merchant: merchant ?? null,
      volume: merchant
        ? (
            await this.db.query(
              "SELECT count(*)::int AS redemptions,COALESCE(sum(coins),0)::bigint AS coins FROM loyalty_redemptions WHERE merchant_id=$1 AND status='REDEEMED'",
              [merchant.id],
            )
          )[0]
        : { redemptions: 0, coins: 0 },
      offers: merchant
        ? await this.db.query(
            'SELECT * FROM merchant_offers WHERE merchant_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',
            [merchant.id],
          )
        : [],
      receipts: merchant
        ? await this.db.query(
            `SELECT r.id,r.coins,r.status,r.redeemed_at,o.title FROM loyalty_redemptions r JOIN merchant_offers o ON o.id=r.offer_id
        WHERE r.merchant_id=$1 AND r.status='REDEEMED' ORDER BY r.redeemed_at DESC LIMIT 100`,
            [merchant.id],
          )
        : [],
    };
  }

  async review(org: string, user: string) {
    await this.loyalty.actor(this.db.manager, org, user, [UserRole.MUNICIPALITY_ADMIN]);
    return {
      merchants: await this.db.query(
        'SELECT * FROM organization_merchants WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100',
        [org],
      ),
      offers: await this.db.query(
        'SELECT o.*,m.name AS merchant_name FROM merchant_offers o JOIN organization_merchants m ON m.id=o.merchant_id WHERE o.organization_id=$1 ORDER BY o.created_at DESC LIMIT 100',
        [org],
      ),
    };
  }

  async decideMerchant(
    org: string,
    user: string,
    id: string,
    status: 'APPROVED' | 'REJECTED' | 'SUSPENDED',
  ) {
    return this.db.transaction(async (m) => {
      await this.loyalty.actor(m, org, user, [UserRole.MUNICIPALITY_ADMIN]);
      const [row] = await m.query(
        'SELECT * FROM organization_merchants WHERE id=$1 AND organization_id=$2 FOR UPDATE',
        [id, org],
      );
      if (!row) throw new NotFoundException('Merchant not found');
      if (row.owner_user_id === user)
        throw new ForbiddenException('Someone else must decide your business application');
      if (row.status === status)
        throw new ConflictException('This business already has that status');
      const state = await this.loyalty.state(m, org, row.owner_user_id);
      const roles = await m.query(
        "SELECT 1 FROM membership_role_grants g JOIN organization_memberships om ON om.id=g.membership_id WHERE om.organization_id=$1 AND om.user_id=$2 AND g.role='MERCHANT' AND g.status='ACTIVE'",
        [org, row.owner_user_id],
      );
      if (
        status === 'APPROVED' &&
        (state?.status !== 'ACTIVE' ||
          state?.membership_status !== 'APPROVED' ||
          state.restricted ||
          !roles.length)
      )
        throw new ConflictException('The merchant account is no longer eligible');
      await m.query(
        'UPDATE organization_merchants SET status=$2,decided_by=$3,decided_at=now() WHERE id=$1',
        [id, status, user],
      );
      await this.loyalty.event(m, org, user, 'MERCHANT_DECIDED', id, { status });
      return { id, status };
    });
  }

  async proposeOffer(org: string, user: string, dto: MerchantOfferDto) {
    this.dates(dto.startsAt, dto.endsAt);
    return this.db.transaction(async (m) => {
      const merchant = await this.owner(m, org, user, true);
      if (merchant.status !== 'APPROVED')
        throw new ConflictException('Your business must be approved before proposing an offer');
      const [prior] = await m.query(
        'SELECT * FROM merchant_offers WHERE organization_id=$1 AND proposed_by=$2 AND client_operation_id=$3',
        [org, user, dto.clientOperationId],
      );
      if (prior) {
        if (
          prior.title !== dto.title.trim() ||
          prior.description !== dto.description.trim() ||
          prior.terms !== dto.terms.trim() ||
          prior.coins !== dto.coins ||
          prior.redemption_limit !== dto.redemptionLimit ||
          new Date(prior.starts_at).getTime() !== new Date(dto.startsAt).getTime() ||
          new Date(prior.ends_at).getTime() !== new Date(dto.endsAt).getTime() ||
          (prior.previous_offer_id ?? null) !== (dto.previousOfferId ?? null)
        )
          throw new ConflictException('This retry key was used for a different offer');
        return prior;
      }
      if (
        dto.previousOfferId &&
        !(
          await m.query(
            'SELECT 1 FROM merchant_offers WHERE id=$1 AND merchant_id=$2 AND organization_id=$3',
            [dto.previousOfferId, merchant.id, org],
          )
        ).length
      )
        throw new NotFoundException('Previous offer not found');
      const [row] = await m.query(
        `INSERT INTO merchant_offers(organization_id,merchant_id,previous_offer_id,title,description,terms,coins,starts_at,ends_at,redemption_limit,proposed_by,client_operation_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [
          org,
          merchant.id,
          dto.previousOfferId ?? null,
          dto.title.trim(),
          dto.description.trim(),
          dto.terms.trim(),
          dto.coins,
          dto.startsAt,
          dto.endsAt,
          dto.redemptionLimit,
          user,
          dto.clientOperationId,
        ],
      );
      await this.loyalty.event(m, org, user, 'MERCHANT_OFFER_PROPOSED', row.id, {
        merchantId: merchant.id,
      });
      return row;
    });
  }

  async decideOffer(org: string, user: string, id: string, approve: boolean) {
    return this.db.transaction(async (m) => {
      await this.loyalty.actor(m, org, user, [UserRole.MUNICIPALITY_ADMIN]);
      const [identity] = await m.query(
        'SELECT merchant_id FROM merchant_offers WHERE id=$1 AND organization_id=$2',
        [id, org],
      );
      if (!identity) throw new NotFoundException('Offer not found');
      const [merchant] = await m.query(
        'SELECT * FROM organization_merchants WHERE id=$1 FOR UPDATE',
        [identity.merchant_id],
      );
      const [row] = await m.query('SELECT * FROM merchant_offers WHERE id=$1 FOR UPDATE', [id]);
      if (merchant.owner_user_id === user || row.proposed_by === user)
        throw new ForbiddenException('Someone else must approve your offer');
      if (row.status !== 'PENDING')
        throw new ConflictException('This offer has already been decided');
      if (approve) {
        if (merchant.status !== 'APPROVED' || new Date(row.ends_at) <= new Date())
          throw new ConflictException('This merchant or offer is no longer eligible');
        if (row.previous_offer_id) {
          const [previous] = await m.query(
            'SELECT * FROM merchant_offers WHERE id=$1 AND merchant_id=$2 FOR UPDATE',
            [row.previous_offer_id, merchant.id],
          );
          if (previous?.status !== 'APPROVED')
            throw new ConflictException('The earlier offer has changed; propose a new offer');
          await m.query("UPDATE merchant_offers SET status='WITHDRAWN' WHERE id=$1", [previous.id]);
        }
      }
      await m.query(
        'UPDATE merchant_offers SET status=$2,decided_by=$3,decided_at=now() WHERE id=$1',
        [id, approve ? 'APPROVED' : 'REJECTED', user],
      );
      await this.loyalty.event(m, org, user, 'MERCHANT_OFFER_DECIDED', id, { approved: approve });
      return { id, approved: approve };
    });
  }

  async withdraw(org: string, user: string, id: string) {
    return this.db.transaction(async (m) => {
      const merchant = await this.owner(m, org, user, true);
      const rows = await m.query(
        "WITH changed AS (UPDATE merchant_offers SET status='WITHDRAWN' WHERE id=$1 AND merchant_id=$2 AND status IN ('PENDING','APPROVED') RETURNING id) SELECT * FROM changed",
        [id, merchant.id],
      );
      if (!rows.length) throw new ConflictException('This offer cannot be withdrawn');
      await this.loyalty.event(m, org, user, 'MERCHANT_OFFER_WITHDRAWN', id, {});
      return { id, status: 'WITHDRAWN' };
    });
  }

  async offers(org: string, user: string) {
    await this.loyalty.actor(this.db.manager, org, user);
    if (!(await this.loyalty.program(this.db.manager, org)).enabled) return [];
    return this.db.query(
      `SELECT o.id,o.title,o.description,o.terms,o.coins,o.starts_at,o.ends_at,m.name AS merchant_name,m.address,m.phone,
      o.redemption_limit-o.redeemed_count AS remaining FROM merchant_offers o JOIN organization_merchants m ON m.id=o.merchant_id
      JOIN users u ON u.id=m.owner_user_id JOIN organization_memberships om ON om.user_id=u.id AND om.organization_id=m.organization_id
      WHERE o.organization_id=$1 AND o.status='APPROVED' AND m.status='APPROVED' AND o.starts_at<=now() AND o.ends_at>now()
        AND o.redeemed_count<o.redemption_limit AND u.status='ACTIVE' AND om.status='APPROVED'
        AND EXISTS(SELECT 1 FROM membership_role_grants g WHERE g.membership_id=om.id AND g.role='MERCHANT' AND g.status='ACTIVE')
        AND NOT EXISTS(SELECT 1 FROM global_account_restrictions r WHERE r.user_id=u.id AND r.status='ACTIVE')
      ORDER BY o.ends_at,o.id LIMIT 100`,
      [org],
    );
  }

  private tokens(id: string) {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    const token = createHmac('sha256', secret).update(`loyalty-qr:${id}`).digest('base64url');
    const code = createHmac('sha256', secret)
      .update(`loyalty-code:${id}`)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();
    return { token, code };
  }

  async issue(org: string, user: string, dto: IssueRedemptionDto) {
    const result = await this.db.transaction(async (m) => {
      await m.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [user]);
      await this.loyalty.actor(m, org, user);
      // Serialize retries for this user before checking the operation key.
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `loyalty-issue:${org}:${user}`,
      ]);
      const [prior] = await m.query(
        'SELECT * FROM loyalty_redemptions WHERE organization_id=$1 AND user_id=$2 AND client_operation_id=$3',
        [org, user, dto.clientOperationId],
      );
      if (prior) {
        if (prior.offer_id !== dto.offerId)
          throw new ConflictException('This retry key was used for another offer');
        if (prior.status !== 'PENDING' || new Date(prior.expires_at) <= new Date())
          throw new ConflictException('Create a new redemption code');
        return prior;
      }
      const [pending] = await m.query(
        "SELECT count(*)::int AS count FROM loyalty_redemptions WHERE organization_id=$1 AND user_id=$2 AND status='PENDING' AND expires_at>now()",
        [org, user],
      );
      if (pending.count >= 5)
        throw new ConflictException('Cancel an unused code before creating another');
      const [offer] = await m.query(
        `SELECT o.*,m.owner_user_id,m.status AS merchant_status FROM merchant_offers o JOIN organization_merchants m ON m.id=o.merchant_id
        WHERE o.id=$1 AND o.organization_id=$2`,
        [dto.offerId, org],
      );
      if (!offer) throw new NotFoundException('Offer not found');
      if (
        offer.status !== 'APPROVED' ||
        offer.merchant_status !== 'APPROVED' ||
        new Date(offer.starts_at) > new Date() ||
        new Date(offer.ends_at) <= new Date() ||
        offer.redeemed_count >= offer.redemption_limit ||
        !(await this.loyalty.program(m, org)).enabled
      )
        throw new ConflictException('This offer is not available');
      if (offer.owner_user_id === user)
        throw new ForbiddenException('You cannot redeem your own business offer');
      await this.loyalty.releaseEligible(m, user, org);
      const wallet = await this.loyalty.lockWallet(m, org, user);
      if (!(await this.loyalty.usable(m, wallet)) || Number(wallet.balance_coins) < offer.coins)
        throw new ConflictException('Not enough available local coins');
      const id = randomUUID();
      const { token, code } = this.tokens(id);
      const [row] = await m.query(
        `INSERT INTO loyalty_redemptions(id,organization_id,user_id,wallet_id,merchant_id,offer_id,coins,token_hash,code_hash,client_operation_id,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()+interval '5 minutes') RETURNING *`,
        [
          id,
          org,
          user,
          wallet.id,
          offer.merchant_id,
          offer.id,
          offer.coins,
          hash(token),
          hash(code),
          dto.clientOperationId,
        ],
      );
      await this.loyalty.event(m, org, user, 'LOYALTY_REDEMPTION_ISSUED', row.id, {
        offerId: offer.id,
        coins: offer.coins,
      });
      return row;
    });
    const tokens = this.tokens(result.id);
    if (hash(tokens.token) !== result.token_hash)
      throw new ConflictException('This code predates a server key change; create a new one');
    return {
      id: result.id,
      coins: result.coins,
      expiresAt: result.expires_at,
      code: tokens.code,
      qrSvg: await QRCode.toString(`ktb-loyalty:${tokens.token}`, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 4,
      }),
    };
  }

  async consume(org: string, user: string, dto: ConsumeRedemptionDto) {
    return this.db.transaction(async (m) => {
      await m.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [user]);
      await this.loyalty.actor(m, org, user, [UserRole.MERCHANT]);
      const raw = dto.token.trim().replace(/^ktb-loyalty:/, '');
      const manual = raw.replace(/[ -]/g, '').toUpperCase();
      const [redemption] = await m.query(
        'SELECT * FROM loyalty_redemptions WHERE organization_id=$1 AND (token_hash=$2 OR code_hash=$3) FOR UPDATE',
        [org, hash(raw), hash(manual)],
      );
      if (!redemption) throw new NotFoundException('Redemption code not found');
      const [merchant] = await m.query(
        'SELECT * FROM organization_merchants WHERE id=$1 FOR UPDATE',
        [redemption.merchant_id],
      );
      if (merchant.owner_user_id !== user) throw new NotFoundException('Redemption code not found');
      if (redemption.status === 'REDEEMED')
        return {
          id: redemption.id,
          status: 'REDEEMED',
          coins: redemption.coins,
          redeemedAt: redemption.redeemed_at,
          replayed: true,
        };
      if (redemption.status !== 'PENDING' || new Date(redemption.expires_at) <= new Date())
        throw new ConflictException('This code has expired or was cancelled');
      const [offer] = await m.query('SELECT * FROM merchant_offers WHERE id=$1 FOR UPDATE', [
        redemption.offer_id,
      ]);
      if (
        merchant.status !== 'APPROVED' ||
        offer.status !== 'APPROVED' ||
        new Date(offer.starts_at) > new Date() ||
        new Date(offer.ends_at) <= new Date() ||
        offer.redeemed_count >= offer.redemption_limit ||
        !(await this.loyalty.program(m, org)).enabled
      )
        throw new ConflictException('This offer is no longer available');
      const wallet = await this.loyalty.lockWallet(m, org, redemption.user_id);
      if (!(await this.loyalty.usable(m, wallet)))
        throw new ConflictException('This member cannot redeem coins now');
      await this.loyalty.post(
        m,
        wallet,
        -redemption.coins,
        0,
        'REDEEMED',
        `redemption:${redemption.id}`,
        { redemption: redemption.id },
      );
      await m.query('UPDATE merchant_offers SET redeemed_count=redeemed_count+1 WHERE id=$1', [
        offer.id,
      ]);
      const [saved] = await m.query(
        "WITH changed AS (UPDATE loyalty_redemptions SET status='REDEEMED',redeemed_at=now(),redeemed_by=$2 WHERE id=$1 RETURNING redeemed_at) SELECT * FROM changed",
        [redemption.id, user],
      );
      await this.loyalty.event(m, org, user, 'LOYALTY_REDEEMED', redemption.id, {
        offerId: offer.id,
        coins: redemption.coins,
      });
      return {
        id: redemption.id,
        status: 'REDEEMED',
        coins: redemption.coins,
        redeemedAt: saved.redeemed_at,
        replayed: false,
      };
    });
  }

  async cancel(org: string, user: string, id: string) {
    return this.db.transaction(async (m) => {
      await this.loyalty.actor(m, org, user);
      const rows = await m.query(
        "WITH changed AS (UPDATE loyalty_redemptions SET status='CANCELLED' WHERE id=$1 AND organization_id=$2 AND user_id=$3 AND status='PENDING' RETURNING id) SELECT * FROM changed",
        [id, org, user],
      );
      if (!rows.length) throw new ConflictException('This code is no longer pending');
      await this.loyalty.event(m, org, user, 'LOYALTY_REDEMPTION_CANCELLED', id, {});
      return { id, status: 'CANCELLED' };
    });
  }

  async status(org: string, user: string, id: string) {
    await this.loyalty.actor(this.db.manager, org, user);
    const [row] = await this.db.query(
      'SELECT id,coins,status,expires_at,redeemed_at FROM loyalty_redemptions WHERE id=$1 AND organization_id=$2 AND user_id=$3',
      [id, org, user],
    );
    if (!row) throw new NotFoundException('Redemption not found');
    return {
      id: row.id,
      coins: row.coins,
      status:
        row.status === 'PENDING' && new Date(row.expires_at) <= new Date() ? 'EXPIRED' : row.status,
      expiresAt: row.expires_at,
      redeemedAt: row.redeemed_at,
    };
  }

  async campaigns(org: string, user: string) {
    await this.loyalty.actor(this.db.manager, org, user, [UserRole.MUNICIPALITY_ADMIN]);
    return this.db.query(
      'SELECT * FROM loyalty_campaigns WHERE organization_id=$1 ORDER BY starts_at DESC LIMIT 100',
      [org],
    );
  }

  async proposeCampaign(org: string, user: string, dto: LoyaltyCampaignDto) {
    this.dates(dto.startsAt, dto.endsAt);
    return this.db.transaction(async (m) => {
      await this.loyalty.actor(m, org, user, [UserRole.MUNICIPALITY_ADMIN]);
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `loyalty-campaign:${org}:${user}`,
      ]);
      const [prior] = await m.query(
        'SELECT * FROM loyalty_campaigns WHERE organization_id=$1 AND proposed_by=$2 AND client_operation_id=$3',
        [org, user, dto.clientOperationId],
      );
      if (prior) {
        if (
          prior.title !== dto.title.trim() ||
          prior.bonus_per_hour !== dto.bonusPerHour ||
          new Date(prior.starts_at).getTime() !== new Date(dto.startsAt).getTime() ||
          new Date(prior.ends_at).getTime() !== new Date(dto.endsAt).getTime()
        )
          throw new ConflictException('This retry key was used for another campaign');
        return prior;
      }
      const [row] = await m.query(
        'INSERT INTO loyalty_campaigns(organization_id,title,bonus_per_hour,starts_at,ends_at,proposed_by,client_operation_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [
          org,
          dto.title.trim(),
          dto.bonusPerHour,
          dto.startsAt,
          dto.endsAt,
          user,
          dto.clientOperationId,
        ],
      );
      await this.loyalty.event(m, org, user, 'LOYALTY_CAMPAIGN_PROPOSED', row.id, {});
      return row;
    });
  }

  async decideCampaign(org: string, user: string, id: string, approve: boolean) {
    return this.db.transaction(async (m) => {
      const context = await this.loyalty.actor(m, org, user);
      if (!context.isSuperAdmin)
        throw new ForbiddenException('Super Admin approval required for local campaigns');
      const [row] = await m.query(
        'SELECT * FROM loyalty_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',
        [id, org],
      );
      if (!row) throw new NotFoundException('Campaign not found');
      if (row.proposed_by === user)
        throw new ForbiddenException('Someone else must decide your campaign');
      if (row.status !== 'PENDING')
        throw new ConflictException('This campaign has already been decided');
      const policy = await this.loyalty.policy(m);
      if (
        approve &&
        (!policy?.enabled ||
          row.bonus_per_hour > policy.campaign_cap_per_hour ||
          new Date(row.ends_at) <= new Date())
      )
        throw new ConflictException('The campaign exceeds the active central policy or has ended');
      await m.query(
        'UPDATE loyalty_campaigns SET status=$2,decided_by=$3,decided_at=now() WHERE id=$1',
        [id, approve ? 'APPROVED' : 'REFUSED', user],
      );
      await this.loyalty.event(m, org, user, 'LOYALTY_CAMPAIGN_DECIDED', id, { approved: approve });
      return { id, approved: approve };
    });
  }
}
