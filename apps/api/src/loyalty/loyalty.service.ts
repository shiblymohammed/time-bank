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
import { AuthorizationService } from '../authorization/authorization.service';
import {
  EngagementAwardDto,
  LoyaltyMilestoneDto,
  LoyaltyPolicyDto,
  LoyaltyPreferenceDto,
  LoyaltyProgramDto,
} from './dto/loyalty.dto';
import { renderReport } from '../reports/report-files';
import { normalizeToE164 } from '../auth/utils/phone.util';

export interface CoinWallet {
  id: string;
  organization_id: string;
  user_id: string;
  balance_coins: string | number;
  frozen_coins: string | number;
  verified_minutes: string | number;
  status: string;
  leaderboard_opt_in: boolean;
  display_name: string | null;
}
export interface Policy {
  id: string;
  version: string;
  enabled: boolean;
  coins_per_hour: number;
  engagement_cap: number;
  campaign_cap_per_hour: number;
  milestones: LoyaltyMilestoneDto[];
}
export const serviceCoins = (minutes: number, hourlyRate: number) =>
  Math.floor((minutes * hourlyRate) / 60);

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly db: DataSource,
    private readonly audit: AuditService,
    private readonly authz: AuthorizationService,
  ) {}

  async actor(m: EntityManager, org: string, user: string, roles: UserRole[] = []) {
    const context = await this.authz.evaluateOrganizationAccess(user, org, m);
    if (
      roles.length &&
      !context.isSuperAdmin &&
      !context.roles.some((role) => roles.includes(role))
    ) {
      throw new ForbiddenException('This action needs the appropriate community role');
    }
    return context;
  }

  async policy(m: EntityManager): Promise<Policy | null> {
    return (
      (
        await m.query(
          'SELECT id,version,enabled,coins_per_hour,engagement_cap,campaign_cap_per_hour,milestones FROM loyalty_policies ORDER BY version DESC LIMIT 1',
        )
      )[0] ?? null
    );
  }

  async policies(user: string) {
    const authority = await this.authz.evaluateGlobalAccess(user);
    if (!authority.isSuperAdmin) throw new ForbiddenException('Super Admin authority required');
    return this.db.query('SELECT * FROM loyalty_policies ORDER BY version DESC LIMIT 20');
  }

  async setPolicy(user: string, dto: LoyaltyPolicyDto) {
    const milestones = dto.milestones
      .map((item) => ({ ...item, name: item.name.trim() }))
      .sort((a, b) => a.minutes - b.minutes);
    if (
      milestones.some((item) => !item.name) ||
      new Set(milestones.map((item) => item.minutes)).size !== milestones.length
    ) {
      throw new BadRequestException('Give each milestone a name and a different minute threshold');
    }
    return this.db.transaction(async (m) => {
      if (!(await this.authz.evaluateGlobalAccess(user, m)).isSuperAdmin)
        throw new ForbiddenException('Super Admin authority required');
      const [row] = await m.query(
        `INSERT INTO loyalty_policies(enabled,coins_per_hour,engagement_cap,campaign_cap_per_hour,milestones,created_by)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          dto.enabled,
          dto.coinsPerHour,
          dto.engagementCap,
          dto.campaignCapPerHour,
          JSON.stringify(milestones),
          user,
        ],
      );
      await this.event(m, null, user, 'LOYALTY_POLICY_CREATED', row.id, { version: row.version });
      return row;
    });
  }

  async program(m: EntityManager, org: string) {
    return (
      (
        await m.query(
          'SELECT enabled,leaderboard_enabled FROM loyalty_programs WHERE organization_id=$1',
          [org],
        )
      )[0] ?? { enabled: false, leaderboard_enabled: false }
    );
  }

  async settings(org: string, user: string) {
    return this.db.transaction(async (m) => {
      await this.actor(m, org, user);
      return { program: await this.program(m, org), policy: await this.policy(m) };
    });
  }

  async setProgram(org: string, user: string, dto: LoyaltyProgramDto) {
    return this.db.transaction(async (m) => {
      await this.actor(m, org, user, [UserRole.MUNICIPALITY_ADMIN]);
      await m.query(
        `INSERT INTO loyalty_programs(organization_id,enabled,leaderboard_enabled,updated_by)
        VALUES($1,$2,$3,$4) ON CONFLICT(organization_id) DO UPDATE SET enabled=$2,leaderboard_enabled=$3,updated_by=$4,updated_at=now()`,
        [org, dto.enabled, dto.leaderboardEnabled, user],
      );
      await this.event(m, org, user, 'LOYALTY_PROGRAM_UPDATED', org, dto);
      return this.program(m, org);
    });
  }

  async state(m: EntityManager, org: string, user: string) {
    const [row] = await m.query(
      `SELECT u.status, o.status AS org_status, om.status AS membership_status,
      EXISTS(SELECT 1 FROM global_account_restrictions r WHERE r.user_id=u.id AND r.status='ACTIVE') AS restricted
      FROM users u CROSS JOIN organizations o
      LEFT JOIN organization_memberships om ON om.user_id=u.id AND om.organization_id=o.id
      WHERE u.id=$1 AND o.id=$2`,
      [user, org],
    );
    return row;
  }

  async usable(m: EntityManager, wallet: CoinWallet): Promise<boolean> {
    const state = await this.state(m, wallet.organization_id, wallet.user_id);
    return (
      wallet.status === 'ACTIVE' &&
      state?.status === 'ACTIVE' &&
      state.org_status === 'ACTIVE' &&
      state.membership_status === 'APPROVED' &&
      !state.restricted
    );
  }

  async lockWallet(m: EntityManager, org: string, user: string): Promise<CoinWallet> {
    await m.query(
      'INSERT INTO loyalty_wallets(organization_id,user_id) VALUES($1,$2) ON CONFLICT(organization_id,user_id) DO NOTHING',
      [org, user],
    );
    return (
      await m.query(
        'SELECT * FROM loyalty_wallets WHERE organization_id=$1 AND user_id=$2 FOR UPDATE',
        [org, user],
      )
    )[0];
  }

  async post(
    m: EntityManager,
    wallet: CoinWallet,
    available: number,
    frozen: number,
    type: string,
    key: string,
    source: {
      policy?: string | null;
      assignment?: string | null;
      closure?: string | null;
      redemption?: string | null;
      details?: unknown;
    } = {},
  ) {
    const balance = Number(wallet.balance_coins) + available;
    const held = Number(wallet.frozen_coins) + frozen;
    if (
      ![balance, held].every(
        (value) => Number.isSafeInteger(value) && value >= 0 && value < 100000000000000,
      )
    ) {
      throw new ConflictException(
        'This coin movement exceeds the available balance or wallet limit',
      );
    }
    await m.query(
      'UPDATE loyalty_wallets SET balance_coins=$2,frozen_coins=$3,updated_at=now() WHERE id=$1',
      [wallet.id, balance, held],
    );
    const [entry] = await m.query(
      `INSERT INTO loyalty_ledger(wallet_id,organization_id,user_id,amount,frozen_delta,balance_after,frozen_after,
      tx_type,event_key,policy_id,assignment_id,closure_id,redemption_id,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [
        wallet.id,
        wallet.organization_id,
        wallet.user_id,
        available,
        frozen,
        balance,
        held,
        type,
        key,
        source.policy ?? null,
        source.assignment ?? null,
        source.closure ?? null,
        source.redemption ?? null,
        JSON.stringify(source.details ?? {}),
      ],
    );
    wallet.balance_coins = balance;
    wallet.frozen_coins = held;
    return entry.id as string;
  }

  /** Called only inside the authoritative confirmation transaction, independently of the time-credit rate. */
  async awardVerifiedService(m: EntityManager, assignment: string) {
    const [visit] = await m.query(
      `SELECT a.id,a.confirmed_minutes,a.service_request_id,r.organization_id,om.user_id
      FROM volunteer_assignments a JOIN service_requests r ON r.id=a.service_request_id
      JOIN organization_memberships om ON om.id=a.volunteer_membership_id
      WHERE a.id=$1 AND a.status='COMPLETED' AND a.confirmed_at IS NOT NULL AND a.confirmed_minutes>0 FOR UPDATE OF a`,
      [assignment],
    );
    if (!visit)
      throw new ConflictException('Only confirmed, completed volunteering earns loyalty coins');
    if (
      (await m.query('SELECT 1 FROM loyalty_service_awards WHERE assignment_id=$1', [assignment]))
        .length
    )
      return;
    const wallet = await this.lockWallet(m, visit.organization_id, visit.user_id);
    const policy = await this.policy(m);
    const program = await this.program(m, visit.organization_id);
    const enabled = policy?.enabled && program.enabled;
    const [bonus] = await m.query(
      `SELECT COALESCE(sum(bonus_per_hour),0) AS rate FROM loyalty_campaigns
      WHERE organization_id=$1 AND status='APPROVED' AND starts_at<=now() AND ends_at>now()`,
      [visit.organization_id],
    );
    const bonusRate = Math.min(Number(bonus?.rate ?? 0), policy?.campaign_cap_per_hour ?? 0);
    const coins = enabled
      ? serviceCoins(visit.confirmed_minutes, policy!.coins_per_hour + bonusRate)
      : 0;
    const held = !(await this.usable(m, wallet));
    await m.query(
      `INSERT INTO loyalty_service_awards(assignment_id,request_id,organization_id,user_id,policy_id,confirmed_minutes,coins,held)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        assignment,
        visit.service_request_id,
        visit.organization_id,
        visit.user_id,
        policy?.id ?? null,
        visit.confirmed_minutes,
        coins,
        held,
      ],
    );
    // Disabled programs do not accumulate qualifying minutes for later retroactive awards.
    if (enabled) {
      wallet.verified_minutes = Number(wallet.verified_minutes) + visit.confirmed_minutes;
      await m.query('UPDATE loyalty_wallets SET verified_minutes=$2 WHERE id=$1', [
        wallet.id,
        wallet.verified_minutes,
      ]);
      if (coins)
        await this.post(
          m,
          wallet,
          held ? 0 : coins,
          held ? coins : 0,
          'SERVICE_EARNED',
          `service:${assignment}`,
          { policy: policy!.id, assignment },
        );
      for (const milestone of policy!.milestones) {
        if (Number(wallet.verified_minutes) < milestone.minutes) continue;
        const key = `milestone:${milestone.minutes}`;
        if (
          (
            await m.query('SELECT 1 FROM loyalty_ledger WHERE wallet_id=$1 AND event_key=$2', [
              wallet.id,
              key,
            ])
          ).length
        )
          continue;
        await this.post(
          m,
          wallet,
          held ? 0 : milestone.coins,
          held ? milestone.coins : 0,
          'MILESTONE_EARNED',
          key,
          { policy: policy!.id, assignment, details: milestone },
        );
      }
      const state = await this.state(m, visit.organization_id, visit.user_id);
      if (state?.status === 'DECEASED_CLOSED')
        await this.retire(m, wallet, await this.currentClosure(m, visit.user_id), assignment);
      else if (state?.status === 'DUPLICATE_CLOSED' && wallet.status !== 'CLOSED') {
        wallet.status = 'CLOSED';
        await m.query("UPDATE loyalty_wallets SET status='CLOSED' WHERE id=$1", [wallet.id]);
      }
    }
    await this.event(m, visit.organization_id, null, 'LOYALTY_SERVICE_VERIFIED', assignment, {
      coins,
      held,
      policyId: policy?.id ?? null,
    });
  }

  private async currentClosure(m: EntityManager, user: string): Promise<string> {
    const [row] = await m.query(
      "SELECT id FROM account_closures WHERE subject_user_id=$1 AND status='CLOSED' ORDER BY decided_at DESC LIMIT 1",
      [user],
    );
    if (!row) throw new ConflictException('The closed account has no closure record');
    return row.id;
  }

  private async retire(m: EntityManager, wallet: CoinWallet, closure: string, suffix = 'close') {
    if (Number(wallet.balance_coins) || Number(wallet.frozen_coins)) {
      await this.post(
        m,
        wallet,
        -Number(wallet.balance_coins),
        -Number(wallet.frozen_coins),
        'RETIRED',
        `retire:${closure}:${suffix}`,
        { closure },
      );
    }
    wallet.status = 'RETIRED';
    await m.query(
      "UPDATE loyalty_wallets SET status='RETIRED',leaderboard_opt_in=false WHERE id=$1",
      [wallet.id],
    );
  }

  async closeAccount(m: EntityManager, user: string, closure: string, deceased: boolean) {
    // Redemption consumes lock its token before its wallet; keep the same order.
    await m.query(
      "UPDATE loyalty_redemptions SET status='CANCELLED' WHERE user_id=$1 AND status='PENDING'",
      [user],
    );
    const wallets: CoinWallet[] = await m.query(
      'SELECT * FROM loyalty_wallets WHERE user_id=$1 ORDER BY id FOR UPDATE',
      [user],
    );
    for (const wallet of wallets) {
      if (deceased) await this.retire(m, wallet, closure);
      else
        await m.query(
          "UPDATE loyalty_wallets SET status='CLOSED',leaderboard_opt_in=false WHERE id=$1",
          [wallet.id],
        );
    }
  }

  async reopenAccount(m: EntityManager, user: string, closure: string) {
    const wallets: CoinWallet[] = await m.query(
      'SELECT * FROM loyalty_wallets WHERE user_id=$1 ORDER BY id FOR UPDATE',
      [user],
    );
    for (const wallet of wallets) {
      const [retired] = await m.query(
        "SELECT COALESCE(sum(-amount),0) AS available,COALESCE(sum(-frozen_delta),0) AS frozen FROM loyalty_ledger WHERE wallet_id=$1 AND closure_id=$2 AND tx_type='RETIRED'",
        [wallet.id, closure],
      );
      const available = Number(retired.available),
        frozen = Number(retired.frozen);
      if (available || frozen)
        await this.post(m, wallet, available, frozen, 'RESTORED', `restore:${closure}`, {
          closure,
        });
      await m.query("UPDATE loyalty_wallets SET status='ACTIVE' WHERE id=$1", [wallet.id]);
    }
    await this.releaseEligible(m, user);
  }

  async releaseEligible(m: EntityManager, user: string, org?: string) {
    const wallets: CoinWallet[] = await m.query(
      'SELECT * FROM loyalty_wallets WHERE user_id=$1 AND ($2::uuid IS NULL OR organization_id=$2) ORDER BY id FOR UPDATE',
      [user, org ?? null],
    );
    for (const wallet of wallets) {
      if (!Number(wallet.frozen_coins) || !(await this.usable(m, wallet))) continue;
      const [last] = await m.query(
        'SELECT id FROM loyalty_ledger WHERE wallet_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',
        [wallet.id],
      );
      const coins = Number(wallet.frozen_coins);
      await this.post(
        m,
        wallet,
        coins,
        -coins,
        'FROZEN_RELEASED',
        `release:${last?.id ?? 'initial'}`,
      );
      await this.event(m, wallet.organization_id, null, 'LOYALTY_COINS_RELEASED', wallet.id, {
        coins,
      });
    }
  }

  async wallet(org: string, user: string) {
    return this.db.transaction(async (m) => {
      await this.actor(m, org, user);
      const [wallet]: CoinWallet[] = await m.query(
        'SELECT * FROM loyalty_wallets WHERE organization_id=$1 AND user_id=$2',
        [org, user],
      );
      const program = await this.program(m, org);
      const entries = wallet
        ? await m.query(
            'SELECT id,amount,frozen_delta,tx_type,details,created_at FROM loyalty_ledger WHERE wallet_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',
            [wallet.id],
          )
        : [];
      return {
        balanceCoins: Number(wallet?.balance_coins ?? 0),
        frozenCoins: Number(wallet?.frozen_coins ?? 0),
        verifiedMinutes: Number(wallet?.verified_minutes ?? 0),
        status: wallet?.status ?? 'ACTIVE',
        optIn: wallet?.leaderboard_opt_in ?? false,
        displayName: wallet?.display_name ?? '',
        programEnabled: program.enabled,
        leaderboardEnabled: program.leaderboard_enabled,
        data: entries,
        achievements: wallet
          ? await m.query(
              "SELECT id,details,created_at FROM loyalty_ledger WHERE wallet_id=$1 AND tx_type='MILESTONE_EARNED' ORDER BY created_at,id",
              [wallet.id],
            )
          : [],
      };
    });
  }

  async refresh(org: string, user: string) {
    await this.db.transaction(async (m) => {
      await this.actor(m, org, user);
      await this.releaseEligible(m, user, org);
    });
    return this.wallet(org, user);
  }

  async preference(org: string, user: string, dto: LoyaltyPreferenceDto) {
    const name = dto.displayName?.trim() ?? '';
    if (dto.optIn && !name)
      throw new BadRequestException('Choose the name shown on the leaderboard');
    return this.db.transaction(async (m) => {
      await this.actor(m, org, user);
      await this.lockWallet(m, org, user);
      await m.query(
        'UPDATE loyalty_wallets SET leaderboard_opt_in=$3,display_name=$4 WHERE organization_id=$1 AND user_id=$2',
        [org, user, dto.optIn, name || null],
      );
      await this.event(m, org, user, 'LOYALTY_VISIBILITY_CHANGED', user, { optIn: dto.optIn });
      return { optIn: dto.optIn, displayName: name };
    });
  }

  async leaderboard(org: string, user: string) {
    await this.actor(this.db.manager, org, user);
    if (!(await this.program(this.db.manager, org)).leaderboard_enabled) return [];
    return this.db.query(
      `SELECT w.display_name AS name,w.verified_minutes AS minutes FROM loyalty_wallets w
      JOIN users u ON u.id=w.user_id JOIN organization_memberships om ON om.user_id=w.user_id AND om.organization_id=w.organization_id
      WHERE w.organization_id=$1 AND w.leaderboard_opt_in AND w.status='ACTIVE' AND u.status='ACTIVE' AND om.status='APPROVED'
        AND NOT EXISTS(SELECT 1 FROM global_account_restrictions r WHERE r.user_id=w.user_id AND r.status='ACTIVE')
      ORDER BY w.verified_minutes DESC,w.id LIMIT 20`,
      [org],
    );
  }

  async certificate(org: string, user: string, entry: string) {
    await this.actor(this.db.manager, org, user);
    const [award] = await this.db.query(
      `SELECT l.details,l.created_at,u.full_name,o.name FROM loyalty_ledger l
      JOIN users u ON u.id=l.user_id JOIN organizations o ON o.id=l.organization_id
      WHERE l.id=$1 AND l.user_id=$2 AND l.organization_id=$3 AND l.tx_type='MILESTONE_EARNED'`,
      [entry, user, org],
    );
    if (!award) throw new NotFoundException('Achievement not found');
    const file = await renderReport(
      {
        title: 'Certificate of volunteer recognition',
        stem: `loyalty-certificate-${entry}`,
        details: [
          ['Community', award.name],
          ['Volunteer', award.full_name || 'Community volunteer'],
          ['Achievement', award.details.name],
          ['Verified hours', Number(award.details.minutes) / 60],
        ],
        sections: [],
        notes: [
          'Awarded for independently verified volunteering. No beneficiary information is included.',
        ],
      },
      'pdf',
    );
    await this.event(this.db.manager, org, user, 'LOYALTY_CERTIFICATE_DOWNLOADED', entry, {});
    return file;
  }

  async proposeEngagement(org: string, user: string, dto: EngagementAwardDto) {
    return this.db.transaction(async (m) => {
      await this.actor(m, org, user, [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN]);
      if (Boolean(dto.userId) === Boolean(dto.member?.trim()))
        throw new BadRequestException('Enter one member phone or membership number');
      let target = dto.userId;
      if (dto.member?.trim()) {
        const value = dto.member.trim();
        let phone: string | null = null;
        try {
          phone = normalizeToE164(value);
        } catch {
          /* A membership number is also accepted. */
        }
        const matches = await m.query(
          `SELECT om.user_id FROM organization_memberships om JOIN users u ON u.id=om.user_id
           WHERE om.organization_id=$1 AND (u.phone_e164=$2 OR upper(om.membership_number)=upper($3)) LIMIT 2`,
          [org, phone, value],
        );
        if (matches.length !== 1) throw new NotFoundException('Member not found or ambiguous');
        target = matches[0].user_id;
      }
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `loyalty-engagement:${org}:${user}`,
      ]);
      if (!target) throw new NotFoundException('Member not found');
      if (target === user) throw new ForbiddenException('Someone else must propose your award');
      const policy = await this.policy(m);
      if (
        !policy?.enabled ||
        !(await this.program(m, org)).enabled ||
        dto.coins > policy.engagement_cap
      )
        throw new ConflictException('This award exceeds the active central policy');
      if (!(await this.state(m, org, target))?.membership_status)
        throw new NotFoundException('Member not found');
      const [prior] = await m.query(
        'SELECT * FROM loyalty_engagement_awards WHERE organization_id=$1 AND proposed_by=$2 AND client_operation_id=$3',
        [org, user, dto.clientOperationId],
      );
      if (prior) {
        if (
          prior.user_id !== target ||
          prior.coins !== dto.coins ||
          prior.reason !== dto.reason.trim()
        )
          throw new ConflictException('This retry key was used for another award');
        return prior;
      }
      const [row] = await m.query(
        'INSERT INTO loyalty_engagement_awards(organization_id,user_id,coins,reason,proposed_by,client_operation_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
        [org, target, dto.coins, dto.reason.trim(), user, dto.clientOperationId],
      );
      await this.event(m, org, user, 'LOYALTY_ENGAGEMENT_PROPOSED', row.id, { coins: dto.coins });
      return row;
    });
  }

  async engagement(org: string, user: string) {
    await this.actor(this.db.manager, org, user, [
      UserRole.COORDINATOR,
      UserRole.MUNICIPALITY_ADMIN,
    ]);
    return this.db.query(
      `SELECT a.*,u.full_name AS member_name,u.phone_e164 AS member_phone,om.membership_number
       FROM loyalty_engagement_awards a JOIN users u ON u.id=a.user_id
       JOIN organization_memberships om ON om.user_id=a.user_id AND om.organization_id=a.organization_id
       WHERE a.organization_id=$1 ORDER BY a.created_at DESC,a.id DESC LIMIT 100`,
      [org],
    );
  }

  async decideEngagement(org: string, user: string, id: string, approve: boolean) {
    return this.db.transaction(async (m) => {
      await this.actor(m, org, user, [UserRole.MUNICIPALITY_ADMIN]);
      const [row] = await m.query(
        'SELECT * FROM loyalty_engagement_awards WHERE id=$1 AND organization_id=$2 FOR UPDATE',
        [id, org],
      );
      if (!row) throw new NotFoundException('Award not found');
      if (row.status !== 'PENDING')
        throw new ConflictException('This award has already been decided');
      if ([row.proposed_by, row.user_id].includes(user))
        throw new ForbiddenException('A different administrator must decide this award');
      const policy = await this.policy(m);
      if (approve) {
        if (
          !policy?.enabled ||
          row.coins > policy.engagement_cap ||
          !(await this.program(m, org)).enabled
        )
          throw new ConflictException('This award exceeds the current central policy');
        const wallet = await this.lockWallet(m, org, row.user_id);
        if (!(await this.usable(m, wallet)))
          throw new ConflictException('This member cannot receive coins now');
        await this.post(m, wallet, row.coins, 0, 'ENGAGEMENT_EARNED', `engagement:${id}`, {
          policy: policy.id,
        });
      }
      await m.query(
        'UPDATE loyalty_engagement_awards SET status=$2,decided_by=$3,decided_at=now() WHERE id=$1',
        [id, approve ? 'APPROVED' : 'REFUSED', user],
      );
      await this.event(m, org, user, 'LOYALTY_ENGAGEMENT_DECIDED', id, { approved: approve });
      return { id, approved: approve };
    });
  }

  async event(
    m: EntityManager,
    org: string | null,
    actor: string | null,
    type: string,
    target: string,
    payload: object,
  ) {
    await this.audit.logEvent(
      {
        eventType: type,
        actorId: actor,
        targetId: target,
        targetType: 'loyalty',
        organizationId: org,
        payload: { ...payload },
      },
      m,
    );
  }
}
