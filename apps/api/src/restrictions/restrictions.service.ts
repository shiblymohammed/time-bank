import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DataSource, EntityManager, In, IsNull, LessThanOrEqual } from 'typeorm';
import {
  ComplaintLevel,
  GlobalRestrictionStatus,
  GlobalRestrictionType,
  MembershipStatus,
  RestrictionCaseEventType,
  RestrictionCaseStatus,
  RestrictionScope,
  UserRole,
} from '@ktb/shared-types';
import { AuditService } from '../audit/audit.service';
import { normalizeToE164 } from '../auth/utils/phone.util';
import { EvaluatedMembershipContext } from '../authorization/authorization.service';
import { Complaint } from '../complaints/entities/complaint.entity';
import { ComplaintsService, levelsFor } from '../complaints/complaints.service';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { User } from '../identity/entities/user.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { RequestsService } from '../requests/requests.service';
import { CreditControlsService } from '../time-ledger/credit-controls.service';
import { ApproveRestrictionDto, CaseNoteDto, RecommendRestrictionDto } from './dto/restriction.dto';
import { Appeal } from './entities/appeal.entity';
import { RestrictionCaseEvent } from './entities/restriction-case-event.entity';
import { RestrictionCase } from './entities/restriction-case.entity';
import {
  applyPlatformRestriction,
  assertSuperAdminRemains,
  holdsSuperAdmin,
  liftPlatformRestriction,
} from './platform-restriction';

const LIST_LIMIT = 100;
const REVIEW_BATCH = 50;
const DEFAULT_MEMBER_MESSAGE =
  'Your account has been restricted. Contact your community coordinator for details.';

/** What people with money or access held by these types get back when they are lifted. */
const RELEASES_HELD_CREDITS = [
  GlobalRestrictionType.TEMPORARY_SUSPENSION,
  GlobalRestrictionType.PERMANENT_BAN,
];

export function newRestrictionReference(prefix: string, now: Date): string {
  const month = now.toISOString().slice(0, 7).replace('-', '');
  return `${prefix}-${month}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

/** A coordinator cannot touch a fellow coordinator's case, nor an administrator an administrator's. */
export function levelForRoles(roles: string[]): ComplaintLevel {
  if (roles.includes(UserRole.SUPER_ADMIN) || roles.includes(UserRole.MUNICIPALITY_ADMIN)) {
    return ComplaintLevel.SUPER_ADMIN;
  }
  if (roles.includes(UserRole.COORDINATOR)) return ComplaintLevel.MUNICIPALITY_ADMIN;
  return ComplaintLevel.COORDINATOR;
}

/**
 * Suspensions and bans (FR-SAFE-05/06, D#80-85). A coordinator recommends and a Municipality Admin
 * decides; a community without one falls to a Super Admin, who can also act directly in an
 * emergency. Nobody acts on their own case, and whoever recommended cannot also decide.
 *
 * What the person sees is memberMessage alone. The reason, the recommender and any complaint stay
 * with staff, and push text and the audit trail carry none of it.
 *
 * A person's offers and upcoming visits are released by the matching worker's existing sweep.
 */
@Injectable()
export class RestrictionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly auditService: AuditService,
    private readonly requests: RequestsService,
    private readonly credits: CreditControlsService,
    private readonly complaints: ComplaintsService,
  ) {}

  async recommend(
    orgId: string,
    context: EvaluatedMembershipContext,
    dto: RecommendRestrictionDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    if (levelsFor(context).length === 0) {
      throw new ForbiddenException('Coordinator authority required');
    }
    const actorId = context.userId;
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      if (dto.clientOperationId) {
        const earlier = await manager.findOne(RestrictionCase, {
          where: { recommendedByUserId: actorId, clientOperationId: dto.clientOperationId },
        });
        if (earlier) return summary(earlier);
      }
      const member = await this.findMember(manager, orgId, dto.member);
      if (member.userId === actorId) {
        throw new ForbiddenException('You cannot recommend a restriction on yourself');
      }
      // One at a time per person, so two coordinators cannot both add a case.
      await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `restriction:${member.userId}`,
      ]);
      const level = levelForRoles(await this.activeRoles(manager, member.userId));
      if (!levelsFor(context).includes(level)) {
        throw new ForbiddenException('Someone at a higher level must recommend this');
      }
      if (
        await manager.exists(RestrictionCase, {
          where: {
            subjectUserId: member.userId,
            organizationId: orgId,
            status: RestrictionCaseStatus.RECOMMENDED,
          },
        })
      ) {
        throw new ConflictException('A recommendation for this person is already waiting');
      }
      const complaintId = dto.complaintReference
        ? await this.linkComplaint(manager, orgId, dto.complaintReference, context)
        : null;

      const created = await manager.save(
        RestrictionCase,
        manager.create(RestrictionCase, {
          reference: newRestrictionReference('RST', now),
          organizationId: orgId,
          subjectUserId: member.userId,
          subjectMembershipId: member.id,
          restrictionType: dto.restrictionType,
          level,
          status: RestrictionCaseStatus.RECOMMENDED,
          reason: dto.reason.trim(),
          complaintId,
          recommendedByUserId: actorId,
          clientOperationId: dto.clientOperationId ?? null,
        }),
      );
      await this.addEvent(manager, created.id, actorId, RestrictionCaseEventType.RECOMMENDED);
      await this.notifyDeciders(manager, created, {
        type: 'RESTRICTION_RECOMMENDED',
        title: 'A recommendation needs your decision',
        body: 'Open the admin panel.',
      });
      await this.audit(manager, 'RESTRICTION_RECOMMENDED', actorId, created, ipAddress, {
        restrictionType: created.restrictionType,
        level,
      });
      return summary(created);
    });
  }

  async list(orgId: string | null, context: EvaluatedMembershipContext, open: boolean) {
    const levels = levelsFor(context);
    if (levels.length === 0) throw new ForbiddenException('Coordinator authority required');
    const cases = await this.dataSource.getRepository(RestrictionCase).find({
      where: {
        level: In(levels),
        ...(orgId ? { organizationId: orgId } : {}),
        ...(open
          ? { status: In([RestrictionCaseStatus.RECOMMENDED, RestrictionCaseStatus.ACTIVE]) }
          : {}),
      },
      relations: ['organization', 'subject', 'subjectMembership'],
      order: { createdAt: 'DESC' },
      take: LIST_LIMIT,
    });
    const visible = cases.filter((item) => item.subjectUserId !== context.userId);
    const waiting = await this.dataSource.getRepository(Appeal).find({
      where: { restrictionCaseId: In(visible.map((item) => item.id)) },
    });
    const appealed = new Map(waiting.map((appeal) => [appeal.restrictionCaseId, appeal]));
    return visible.map((item) => summary(item, appealed.get(item.id)));
  }

  async detail(orgId: string | null, caseId: string, context: EvaluatedMembershipContext) {
    const manager = this.dataSource.manager;
    const found = await manager.findOne(RestrictionCase, {
      where: { id: caseId, ...(orgId ? { organizationId: orgId } : {}) },
      relations: [
        'organization',
        'subject',
        'subjectMembership',
        'recommendedBy',
        'decidedBy',
        'complaint',
      ],
    });
    if (!found) throw new NotFoundException('Case not found');
    this.assertCanRead(found, context);
    const [events, appeal] = await Promise.all([
      manager.find(RestrictionCaseEvent, {
        where: { caseId: found.id },
        relations: ['actor'],
        order: { createdAt: 'ASC' },
      }),
      manager.findOne(Appeal, { where: { restrictionCaseId: found.id } }),
    ]);
    return {
      ...summary(found, appeal),
      reason: found.reason,
      memberMessage: found.memberMessage ?? null,
      complaintReference: found.complaint?.reference ?? null,
      recommendedByName: found.recommendedBy?.fullName ?? null,
      decidedByName: found.decidedBy?.fullName ?? null,
      appeal: appeal
        ? {
            id: appeal.id,
            reference: appeal.reference,
            status: appeal.status,
            outcome: appeal.outcome ?? null,
            createdAt: appeal.createdAt,
          }
        : null,
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        notes: event.notes ?? null,
        actorName: event.actor?.fullName ?? null,
        createdAt: event.createdAt,
      })),
    };
  }

  async approve(
    orgId: string | null,
    caseId: string,
    context: EvaluatedMembershipContext,
    dto: ApproveRestrictionDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.act(orgId, caseId, context, async (manager, found) => {
      if (found.status !== RestrictionCaseStatus.RECOMMENDED) {
        throw new ConflictException('This recommendation has already been decided');
      }
      await this.assertCanDecide(manager, found, context);
      const isBan = found.restrictionType === GlobalRestrictionType.PERMANENT_BAN;
      if (isBan && dto.scope !== RestrictionScope.PLATFORM) {
        throw new BadRequestException('A ban covers every community');
      }
      const reviewOn = dto.reviewOn ? new Date(dto.reviewOn) : null;
      if (isBan && reviewOn) throw new BadRequestException('A ban has no review date');
      if (reviewOn && reviewOn <= now) {
        throw new BadRequestException('The review date must be in the future');
      }

      if (dto.scope === RestrictionScope.PLATFORM) {
        const user = await manager.findOne(User, {
          where: { id: found.subjectUserId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) throw new NotFoundException('Person not found');
        const existing = await manager.exists(GlobalAccountRestriction, {
          where: {
            userId: user.id,
            restrictionType: found.restrictionType,
            status: GlobalRestrictionStatus.ACTIVE,
          },
        });
        if (existing) throw new ConflictException('This restriction is already in force');
        const restriction = await applyPlatformRestriction(manager, this.auditService, {
          user,
          restrictionType: found.restrictionType,
          reasonCode: found.reference,
          actorId: context.userId,
          ipAddress,
        });
        found.restrictionId = restriction.id;
      } else {
        await this.suspendInCommunity(manager, found);
      }

      found.scope = dto.scope;
      found.status = RestrictionCaseStatus.ACTIVE;
      found.memberMessage = dto.memberMessage.trim();
      found.decidedByUserId = context.userId;
      found.decidedAt = now;
      found.reviewOn = reviewOn;
      await manager.save(RestrictionCase, found);
      await this.addEvent(
        manager,
        found.id,
        context.userId,
        RestrictionCaseEventType.APPROVED,
        dto.notes,
      );
      await this.stopBookings(manager, found, context.userId, ipAddress);
      await this.notifySubject(manager, found);
      await this.audit(manager, 'RESTRICTION_APPROVED', context.userId, found, ipAddress, {
        restrictionType: found.restrictionType,
        scope: found.scope,
      });
      return summary(found);
    });
  }

  async refuse(
    orgId: string | null,
    caseId: string,
    context: EvaluatedMembershipContext,
    dto: CaseNoteDto,
    ipAddress?: string,
  ) {
    return this.act(orgId, caseId, context, async (manager, found) => {
      if (found.status !== RestrictionCaseStatus.RECOMMENDED) {
        throw new ConflictException('This recommendation has already been decided');
      }
      await this.assertCanDecide(manager, found, context);
      found.status = RestrictionCaseStatus.REFUSED;
      found.decidedByUserId = context.userId;
      found.decidedAt = new Date();
      await manager.save(RestrictionCase, found);
      await this.addEvent(
        manager,
        found.id,
        context.userId,
        RestrictionCaseEventType.REFUSED,
        dto.notes,
      );
      await this.notifications.notifyUsers(manager, [found.recommendedByUserId], {
        organizationId: found.organizationId ?? null,
        type: 'RESTRICTION_REFUSED',
        title: 'A recommendation was decided',
        body: 'Open the admin panel.',
      });
      await this.audit(manager, 'RESTRICTION_REFUSED', context.userId, found, ipAddress, {});
      return summary(found);
    });
  }

  async addNote(
    orgId: string | null,
    caseId: string,
    context: EvaluatedMembershipContext,
    dto: CaseNoteDto,
    ipAddress?: string,
  ) {
    return this.act(orgId, caseId, context, async (manager, found) => {
      await this.addEvent(
        manager,
        found.id,
        context.userId,
        RestrictionCaseEventType.NOTE,
        dto.notes,
      );
      await this.audit(manager, 'RESTRICTION_NOTE_ADDED', context.userId, found, ipAddress, {});
      return summary(found);
    });
  }

  /** D#81: a coordinator recommends and an administrator approves. Time alone never does it. */
  async recommendReinstatement(
    orgId: string | null,
    caseId: string,
    context: EvaluatedMembershipContext,
    dto: CaseNoteDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.act(orgId, caseId, context, async (manager, found) => {
      if (found.status !== RestrictionCaseStatus.ACTIVE) {
        throw new ConflictException('This restriction is not in force');
      }
      if (found.restrictionType === GlobalRestrictionType.PERMANENT_BAN) {
        throw new ConflictException('A ban ends on appeal, or by a Super Admin');
      }
      if (found.reinstatementRecommendedByUserId) {
        throw new ConflictException('A reinstatement is already waiting for a decision');
      }
      found.reinstatementRecommendedByUserId = context.userId;
      found.reinstatementRecommendedAt = now;
      await manager.save(RestrictionCase, found);
      await this.addEvent(
        manager,
        found.id,
        context.userId,
        RestrictionCaseEventType.REINSTATEMENT_RECOMMENDED,
        dto.notes,
      );
      await this.notifyDeciders(
        manager,
        found,
        {
          type: 'REINSTATEMENT_RECOMMENDED',
          title: 'A reinstatement needs your decision',
          body: 'Open the admin panel.',
        },
        [context.userId],
      );
      await this.audit(manager, 'REINSTATEMENT_RECOMMENDED', context.userId, found, ipAddress, {});
      return summary(found);
    });
  }

  async refuseReinstatement(
    orgId: string | null,
    caseId: string,
    context: EvaluatedMembershipContext,
    dto: CaseNoteDto,
    ipAddress?: string,
  ) {
    return this.act(orgId, caseId, context, async (manager, found) => {
      if (!found.reinstatementRecommendedByUserId) {
        throw new ConflictException('No reinstatement is waiting');
      }
      await this.assertCanDecideReinstatement(found, context);
      found.reinstatementRecommendedByUserId = null;
      found.reinstatementRecommendedAt = null;
      await manager.save(RestrictionCase, found);
      await this.addEvent(
        manager,
        found.id,
        context.userId,
        RestrictionCaseEventType.REINSTATEMENT_REFUSED,
        dto.notes,
      );
      await this.audit(manager, 'REINSTATEMENT_REFUSED', context.userId, found, ipAddress, {});
      return summary(found);
    });
  }

  async reinstate(
    orgId: string | null,
    caseId: string,
    context: EvaluatedMembershipContext,
    dto: CaseNoteDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.act(orgId, caseId, context, async (manager, found) => {
      if (found.status !== RestrictionCaseStatus.ACTIVE) {
        throw new ConflictException('This restriction is not in force');
      }
      await this.assertCanDecideReinstatement(found, context);
      await this.endCase(
        manager,
        found,
        RestrictionCaseStatus.REINSTATED,
        context.userId,
        dto.notes,
        ipAddress,
        now,
      );
      return summary(found);
    });
  }

  // ─── Called from the Super Admin's direct routes (AdminService) ────────────

  /** Records a direct restriction as a case, so it can be appealed like any other. */
  async afterDirectRestriction(
    manager: EntityManager,
    restriction: GlobalAccountRestriction,
    user: User,
    details: { notes?: string; memberMessage?: string; reviewOn?: string },
    actorId: string,
    ipAddress?: string,
    now = new Date(),
  ): Promise<void> {
    const [member]: { id: string; organization_id: string }[] = await manager.query(
      `SELECT om.id, om.organization_id FROM organization_memberships om
       WHERE om.user_id = $1
       ORDER BY (om.organization_id = $2) DESC NULLS LAST, om.applied_at ASC LIMIT 1`,
      [user.id, user.primaryOrgId ?? null],
    );
    const created = await manager.save(
      RestrictionCase,
      manager.create(RestrictionCase, {
        reference: newRestrictionReference('RST', now),
        organizationId: member?.organization_id ?? null,
        subjectUserId: user.id,
        subjectMembershipId: member?.id ?? null,
        restrictionType: restriction.restrictionType,
        scope: RestrictionScope.PLATFORM,
        level: ComplaintLevel.SUPER_ADMIN,
        status: RestrictionCaseStatus.ACTIVE,
        reason: details.notes?.trim() || `Reason code: ${restriction.reasonCode}`,
        recommendedByUserId: actorId,
        memberMessage: details.memberMessage?.trim() || DEFAULT_MEMBER_MESSAGE,
        decidedByUserId: actorId,
        decidedAt: now,
        restrictionId: restriction.id,
        reviewOn: details.reviewOn ? new Date(details.reviewOn) : null,
      }),
    );
    await this.addEvent(manager, created.id, actorId, RestrictionCaseEventType.IMPOSED_DIRECTLY);
    await this.stopBookings(manager, created, actorId, ipAddress);
    await this.audit(manager, 'RESTRICTION_IMPOSED_DIRECTLY', actorId, created, ipAddress, {
      restrictionType: created.restrictionType,
    });
  }

  /** Keeps the case in step when a Super Admin ends a restriction directly. */
  async afterDirectLift(
    manager: EntityManager,
    restriction: GlobalAccountRestriction,
    accessRestored: boolean,
    actorId: string,
    notes: string,
    ipAddress?: string,
    now = new Date(),
  ): Promise<void> {
    const found = await manager.findOne(RestrictionCase, {
      where: { restrictionId: restriction.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (found?.status === RestrictionCaseStatus.ACTIVE) {
      await this.closeCase(
        manager,
        found,
        RestrictionCaseStatus.REINSTATED,
        actorId,
        notes,
        ipAddress,
        now,
      );
    }
    if (accessRestored) await this.releaseHeldCredits(manager, restriction, found, actorId);
  }

  /** Ends a restriction in force: on reinstatement, or on an appeal that succeeds. */
  async endCase(
    manager: EntityManager,
    found: RestrictionCase,
    status: RestrictionCaseStatus.REINSTATED | RestrictionCaseStatus.OVERTURNED,
    actorId: string,
    notes: string,
    ipAddress?: string,
    now = new Date(),
  ): Promise<void> {
    if (found.scope === RestrictionScope.PLATFORM && found.restrictionId) {
      const restriction = await manager.findOne(GlobalAccountRestriction, {
        where: { id: found.restrictionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (restriction?.status === GlobalRestrictionStatus.ACTIVE) {
        const { accessRestored } = await liftPlatformRestriction(manager, this.auditService, {
          restriction,
          status:
            status === RestrictionCaseStatus.OVERTURNED
              ? GlobalRestrictionStatus.OVERTURNED_ON_APPEAL
              : GlobalRestrictionStatus.RESOLVED,
          actorId,
          notes,
          ipAddress,
        });
        if (accessRestored) await this.releaseHeldCredits(manager, restriction, found, actorId);
      }
    } else if (found.subjectMembershipId) {
      await manager.update(
        OrganizationMembership,
        { id: found.subjectMembershipId, status: MembershipStatus.SUSPENDED },
        { status: MembershipStatus.APPROVED },
      );
    }
    await this.closeCase(manager, found, status, actorId, notes, ipAddress, now);
  }

  /** Staff are reminded once. Nothing about the person's access changes. */
  async sendDueReviewReminders(now = new Date()): Promise<number> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const due = await manager.find(RestrictionCase, {
        where: {
          status: RestrictionCaseStatus.ACTIVE,
          reviewOn: LessThanOrEqual(now),
          reviewNotifiedAt: IsNull(),
        },
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
        take: REVIEW_BATCH,
      });
      for (const found of due) {
        found.reviewNotifiedAt = now;
        await manager.save(RestrictionCase, found);
        await this.notifyDeciders(manager, found, {
          type: 'RESTRICTION_REVIEW_DUE',
          title: 'A suspension is due for review',
          body: 'Open the admin panel.',
        });
      }
      return due.length;
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** The same 404 as for a case that does not exist. */
  assertCanRead(found: RestrictionCase, context: EvaluatedMembershipContext): void {
    if (!levelsFor(context).includes(found.level) || found.subjectUserId === context.userId) {
      throw new NotFoundException('Case not found');
    }
  }

  private async act<T>(
    orgId: string | null,
    caseId: string,
    context: EvaluatedMembershipContext,
    work: (manager: EntityManager, found: RestrictionCase) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const found = await manager.findOne(RestrictionCase, {
        where: { id: caseId, ...(orgId ? { organizationId: orgId } : {}) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!found) throw new NotFoundException('Case not found');
      this.assertCanRead(found, context);
      return work(manager, found);
    });
  }

  private hasDecidingRole(found: RestrictionCase, context: EvaluatedMembershipContext): boolean {
    if (context.isSuperAdmin) return true;
    return (
      found.level !== ComplaintLevel.SUPER_ADMIN &&
      context.roles.includes(UserRole.MUNICIPALITY_ADMIN)
    );
  }

  private async assertCanDecide(
    manager: EntityManager,
    found: RestrictionCase,
    context: EvaluatedMembershipContext,
  ): Promise<void> {
    if (!this.hasDecidingRole(found, context)) {
      throw new ForbiddenException('A Municipality Admin must decide this');
    }
    if (found.recommendedByUserId === context.userId) {
      throw new ForbiddenException('You recommended this, so someone else must decide it');
    }
    if (found.complaintId) {
      const clear = await this.complaints.canHandle(manager, found.complaintId, context);
      if (!clear) {
        throw new ForbiddenException(
          'You are part of the complaint behind this. A Super Admin must decide.',
        );
      }
    }
  }

  private async assertCanDecideReinstatement(
    found: RestrictionCase,
    context: EvaluatedMembershipContext,
  ): Promise<void> {
    if (!this.hasDecidingRole(found, context)) {
      throw new ForbiddenException('A Municipality Admin must decide this');
    }
    if (found.reinstatementRecommendedByUserId === context.userId) {
      throw new ForbiddenException('You recommended this, so someone else must decide it');
    }
    // A Super Admin may end a restriction directly. Anyone else needs a recommendation.
    if (!found.reinstatementRecommendedByUserId && !context.isSuperAdmin) {
      throw new ConflictException('A coordinator must recommend reinstatement first');
    }
    if (found.restrictionType === GlobalRestrictionType.PERMANENT_BAN && !context.isSuperAdmin) {
      throw new ForbiddenException('A ban ends on appeal, or by a Super Admin');
    }
  }

  private async closeCase(
    manager: EntityManager,
    found: RestrictionCase,
    status: RestrictionCaseStatus.REINSTATED | RestrictionCaseStatus.OVERTURNED,
    actorId: string,
    notes: string,
    ipAddress: string | undefined,
    now: Date,
  ): Promise<void> {
    found.status = status;
    found.endedByUserId = actorId;
    found.endedAt = now;
    await manager.save(RestrictionCase, found);
    await this.addEvent(
      manager,
      found.id,
      actorId,
      status === RestrictionCaseStatus.OVERTURNED
        ? RestrictionCaseEventType.OVERTURNED
        : RestrictionCaseEventType.REINSTATED,
      notes,
    );
    await this.notifySubject(manager, found);
    await this.audit(
      manager,
      status === RestrictionCaseStatus.OVERTURNED ? 'RESTRICTION_OVERTURNED' : 'RESTRICTION_ENDED',
      actorId,
      found,
      ipAddress,
      { restrictionType: found.restrictionType, scope: found.scope },
    );
  }

  /** What they earned while restricted. A separately frozen wallet or a review keeps its hold. */
  private async releaseHeldCredits(
    manager: EntityManager,
    restriction: GlobalAccountRestriction,
    found: RestrictionCase | null,
    actorId: string,
  ): Promise<void> {
    if (!RELEASES_HELD_CREDITS.includes(restriction.restrictionType)) return;
    await this.credits.releaseRestrictionHolds(
      manager,
      restriction.userId,
      restriction.createdAt,
      actorId,
      found?.reference ?? restriction.id,
    );
  }

  private async suspendInCommunity(manager: EntityManager, found: RestrictionCase): Promise<void> {
    if (!found.subjectMembershipId || !found.organizationId) {
      throw new ConflictException('This person has no membership in this community');
    }
    const membership = await manager.findOne(OrganizationMembership, {
      where: { id: found.subjectMembershipId },
      lock: { mode: 'pessimistic_write' },
    });
    if (membership?.status !== MembershipStatus.APPROVED) {
      throw new ConflictException('This membership is not active');
    }
    const grants: unknown[] = await manager.query(
      `SELECT 1 FROM membership_role_grants WHERE membership_id = $1 AND role = $2 AND status = 'ACTIVE'`,
      [membership.id, UserRole.SUPER_ADMIN],
    );
    if (grants.length > 0 && (await holdsSuperAdmin(manager, found.subjectUserId))) {
      await assertSuperAdminRemains(manager, { userId: found.subjectUserId });
    }
    membership.status = MembershipStatus.SUSPENDED;
    await manager.save(OrganizationMembership, membership);
    await manager.query('DELETE FROM push_devices WHERE user_id = $1 AND organization_id = $2', [
      found.subjectUserId,
      found.organizationId,
    ]);
  }

  /**
   * Requests for this person that have not started are cancelled, and the matching worker releases
   * their offers and upcoming visits. A visit under way is the coordinator's to decide.
   */
  private async stopBookings(
    manager: EntityManager,
    found: RestrictionCase,
    actorId: string,
    ipAddress?: string,
  ): Promise<void> {
    const members: { id: string }[] =
      found.scope === RestrictionScope.COMMUNITY
        ? [{ id: found.subjectMembershipId as string }]
        : await manager.query('SELECT id FROM organization_memberships WHERE user_id = $1', [
            found.subjectUserId,
          ]);
    await this.stopBookingsFor(
      manager,
      members.map((member) => member.id),
      found.subjectUserId,
      actorId,
      ipAddress,
    );
  }

  /** Also used when an account closes. */
  async stopBookingsFor(
    manager: EntityManager,
    membershipIds: string[],
    subjectUserId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<void> {
    if (membershipIds.length === 0) return;
    const { underWay } = await this.requests.cancelForRestriction(
      manager,
      membershipIds,
      actorId,
      ipAddress,
    );
    const helping: { organization_id: string }[] = await manager.query(
      `SELECT DISTINCT r.organization_id FROM volunteer_assignments a
       JOIN service_requests r ON r.id = a.service_request_id
       WHERE a.volunteer_membership_id = ANY($1) AND a.status = 'IN_PROGRESS'`,
      [membershipIds],
    );
    const communities = new Set([
      ...underWay.map((visit) => visit.organizationId),
      ...helping.map((row) => row.organization_id),
    ]);
    for (const organizationId of communities) {
      await this.notifications.notifyCoordinators(
        manager,
        {
          organizationId,
          type: 'RESTRICTION_VISIT_UNDER_WAY',
          title: 'A visit under way needs you',
          body: 'Someone on it can no longer take part. Open the admin panel.',
        },
        [subjectUserId],
      );
    }
  }

  /** Administrators here, less anyone involved. With nobody left, a Super Admin is told. */
  async notifyDeciders(
    manager: EntityManager,
    found: RestrictionCase,
    notice: { type: string; title: string; body: string },
    exceptUserIds: string[] = [],
  ): Promise<void> {
    const excluded = new Set([found.subjectUserId, found.recommendedByUserId, ...exceptUserIds]);
    const local: { user_id: string }[] =
      found.level === ComplaintLevel.SUPER_ADMIN || !found.organizationId
        ? []
        : await manager.query(
            `SELECT DISTINCT m.user_id FROM organization_memberships m
             JOIN membership_role_grants g ON g.membership_id = m.id
             WHERE m.organization_id = $1 AND m.status = 'APPROVED' AND g.status = 'ACTIVE'
               AND g.role = 'MUNICIPALITY_ADMIN'`,
            [found.organizationId],
          );
    let recipients = local.map((row) => row.user_id).filter((id) => !excluded.has(id));
    if (recipients.length === 0) {
      const central: { user_id: string }[] = await manager.query(
        `SELECT DISTINCT m.user_id FROM organization_memberships m
         JOIN membership_role_grants g ON g.membership_id = m.id
         WHERE m.status = 'APPROVED' AND g.status = 'ACTIVE' AND g.role = 'SUPER_ADMIN'`,
      );
      recipients = central.map((row) => row.user_id).filter((id) => !excluded.has(id));
    }
    await this.notifications.notifyUsers(manager, recipients, {
      organizationId: found.organizationId ?? null,
      ...notice,
    });
  }

  private async notifySubject(manager: EntityManager, found: RestrictionCase): Promise<void> {
    await this.notifications.notifyUsers(manager, [found.subjectUserId], {
      organizationId: found.organizationId ?? null,
      type: 'RESTRICTION_UPDATE',
      title: 'An update on your account',
      body: 'Open the app to read it.',
    });
  }

  /** Member number or phone, within this community. */
  async findMember(
    manager: EntityManager,
    orgId: string,
    member: string,
  ): Promise<OrganizationMembership> {
    const value = member.trim();
    let phone: string | null = null;
    try {
      phone = normalizeToE164(value);
    } catch {
      // Not a phone number, so it can only be a member number.
    }
    const [row]: { id: string }[] = await manager.query(
      `SELECT m.id FROM organization_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1
         AND m.status IN ('APPROVED', 'SUSPENDED')
         AND (upper(m.membership_number) = upper($2) OR u.phone_e164 = $3)
       LIMIT 1`,
      [orgId, value, phone],
    );
    const found = row && (await manager.findOne(OrganizationMembership, { where: { id: row.id } }));
    if (!found) throw new NotFoundException('No member of this community has that number');
    return found;
  }

  async activeRoles(manager: EntityManager, userId: string): Promise<string[]> {
    const rows: { role: string }[] = await manager.query(
      `SELECT DISTINCT g.role FROM membership_role_grants g
       JOIN organization_memberships m ON m.id = g.membership_id
       WHERE m.user_id = $1 AND g.status = 'ACTIVE'`,
      [userId],
    );
    return rows.map((row) => row.role);
  }

  /** The same 404 for a complaint that does not exist and one this person cannot reach. */
  private async linkComplaint(
    manager: EntityManager,
    orgId: string,
    reference: string,
    context: EvaluatedMembershipContext,
  ): Promise<string> {
    const complaint = await manager.findOne(Complaint, {
      where: { reference: reference.trim().toUpperCase(), organizationId: orgId },
    });
    if (!complaint || !(await this.complaints.canHandle(manager, complaint.id, context))) {
      throw new NotFoundException('Complaint not found');
    }
    return complaint.id;
  }

  async addEvent(
    manager: EntityManager,
    caseId: string,
    actorUserId: string,
    type: RestrictionCaseEventType,
    notes?: string,
  ): Promise<void> {
    await manager.insert(RestrictionCaseEvent, {
      caseId,
      actorUserId,
      type,
      notes: notes?.trim() || null,
    });
  }

  /** Never the reason or the message. Those stay on the case, behind its level rules. */
  private async audit(
    manager: EntityManager,
    eventType: string,
    actorId: string,
    found: RestrictionCase,
    ipAddress: string | undefined,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.logEvent(
      {
        eventType,
        actorId,
        targetId: found.id,
        targetType: 'restriction_cases',
        organizationId: found.organizationId ?? null,
        payload: { userId: found.subjectUserId, ...payload },
        ipAddress: ipAddress ?? null,
      },
      manager,
    );
  }
}

function summary(found: RestrictionCase, appeal?: Appeal | null) {
  return {
    id: found.id,
    reference: found.reference,
    organizationId: found.organizationId ?? null,
    organizationName: found.organization?.name ?? null,
    subjectName: found.subject?.fullName ?? null,
    subjectMemberNumber: found.subjectMembership?.membershipNumber ?? null,
    subjectPhone: found.subject?.phoneE164 ?? null,
    restrictionType: found.restrictionType,
    scope: found.scope ?? null,
    level: found.level,
    status: found.status,
    reinstatementRecommended: Boolean(found.reinstatementRecommendedByUserId),
    reviewOn: found.reviewOn ?? null,
    reviewDue: Boolean(
      found.status === RestrictionCaseStatus.ACTIVE &&
      found.reviewOn &&
      found.reviewOn <= new Date(),
    ),
    appealStatus: appeal?.status ?? null,
    createdAt: found.createdAt,
    decidedAt: found.decidedAt ?? null,
  };
}
