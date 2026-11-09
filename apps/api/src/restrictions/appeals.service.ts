import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  AccountStatus,
  AppealKind,
  AppealOutcome,
  AppealStatus,
  ClosureEventType,
  ClosureKind,
  ClosureStatus,
  ComplaintEventType,
  ComplaintLevel,
  ComplaintOutcome,
  ComplaintStatus,
  GlobalRestrictionStatus,
  RestrictionCaseEventType,
  RestrictionCaseStatus,
  RestrictionScope,
} from '@ktb/shared-types';
import { AuditService } from '../audit/audit.service';
import { ClosuresService } from '../closures/closures.service';
import { AccountClosure } from '../closures/entities/account-closure.entity';
import { EvaluatedMembershipContext } from '../authorization/authorization.service';
import { ComplaintsService, levelsFor, nextComplaintLevel } from '../complaints/complaints.service';
import { Complaint } from '../complaints/entities/complaint.entity';
import { User } from '../identity/entities/user.entity';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { DecideAppealDto, FileAppealDto } from './dto/restriction.dto';
import { Appeal } from './entities/appeal.entity';
import { RestrictionCase } from './entities/restriction-case.entity';
import { APPEAL_WINDOW_DAYS, appealDeadline } from './appeal-window';
import { newRestrictionReference, RestrictionsService } from './restrictions.service';

const LIST_LIMIT = 100;

/**
 * Appeals (FR-SAFE-04, D#77, D#78). A restriction or a duplicate's closure goes to a Super Admin,
 * whose word is final, and a complaint's outcome goes one level up. One appeal per decision, within
 * 30 days, heard by someone who had no part in the decision.
 *
 * An overturned restriction restores access and the wallet at once (BR-11, D#85). A cancelled
 * request stays cancelled: the person books again.
 */
@Injectable()
export class AppealsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly restrictions: RestrictionsService,
    private readonly closures: ClosuresService,
    private readonly complaints: ComplaintsService,
    private readonly notifications: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  /** Works for someone who is blocked: it is one of the few routes their sign-in can reach. */
  async mine(userId: string, now = new Date()) {
    const manager = this.dataSource.manager;
    const [user, platform, cases, closures] = await Promise.all([
      manager.findOne(User, { where: { id: userId } }),
      manager.exists(GlobalAccountRestriction, {
        where: { userId, status: GlobalRestrictionStatus.ACTIVE },
      }),
      manager.find(RestrictionCase, {
        where: { subjectUserId: userId, status: RestrictionCaseStatus.ACTIVE },
        relations: ['organization'],
        order: { decidedAt: 'DESC' },
      }),
      manager.find(AccountClosure, {
        where: {
          subjectUserId: userId,
          kind: ClosureKind.DUPLICATE,
          status: ClosureStatus.CLOSED,
        },
      }),
    ]);
    const appeals = await manager.find(Appeal, {
      where: { restrictionCaseId: In(cases.map((found) => found.id)) },
    });
    const byCase = new Map(appeals.map((appeal) => [appeal.restrictionCaseId, appeal]));
    const closureAppeals = closures.length
      ? await manager.find(Appeal, { where: { closureId: In(closures.map((found) => found.id)) } })
      : [];
    const byClosure = new Map(closureAppeals.map((appeal) => [appeal.closureId, appeal]));
    const closedItems = closures.map((found) => {
      const appeal = byClosure.get(found.id);
      const deadline = appealDeadline(found.decidedAt);
      return {
        id: found.id,
        reference: found.reference,
        restrictionType: AccountStatus.DUPLICATE_CLOSED as string,
        scope: 'PLATFORM',
        communityName: null,
        // Only this: never the reason, or who reported it.
        memberMessage: found.memberMessage,
        since: found.decidedAt,
        appealDeadline: deadline,
        canAppeal: !appeal && deadline !== null && now <= deadline,
        appeal: appeal ? memberAppealView(appeal) : null,
      };
    });
    return {
      accountStatus: user?.status ?? null,
      restricted: platform || user?.status === AccountStatus.DUPLICATE_CLOSED,
      appealWindowDays: APPEAL_WINDOW_DAYS,
      items: [
        ...closedItems,
        ...cases.map((found) => {
          const appeal = byCase.get(found.id);
          const deadline = appealDeadline(found.decidedAt);
          return {
            id: found.id,
            reference: found.reference,
            restrictionType: found.restrictionType,
            scope: found.scope,
            communityName:
              found.scope === RestrictionScope.COMMUNITY
                ? (found.organization?.name ?? null)
                : null,
            // Only this: never the reason, who recommended it, or any complaint behind it.
            memberMessage: found.memberMessage,
            since: found.decidedAt,
            appealDeadline: deadline,
            canAppeal: !appeal && deadline !== null && now <= deadline,
            appeal: appeal ? memberAppealView(appeal) : null,
          };
        }),
      ],
    };
  }

  async fileMine(
    userId: string,
    caseId: string,
    dto: FileAppealDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const closure = await this.lockClosure(manager, caseId);
      if (closure?.subjectUserId === userId) {
        return memberAppealView(
          await this.fileOnClosure(manager, closure, userId, dto, ipAddress, now),
        );
      }
      const found = await this.lockCase(manager, caseId);
      if (!found || found.subjectUserId !== userId) throw new NotFoundException('Case not found');
      return memberAppealView(await this.fileOnCase(manager, found, userId, dto, ipAddress, now));
    });
  }

  /** For someone who does not use the app. The person stays the appellant. */
  async fileForMember(
    orgId: string,
    caseId: string,
    context: EvaluatedMembershipContext,
    dto: FileAppealDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const found = await this.lockCase(manager, caseId);
      if (!found || found.organizationId !== orgId) throw new NotFoundException('Case not found');
      this.restrictions.assertCanRead(found, context);
      return memberAppealView(
        await this.fileOnCase(manager, found, context.userId, dto, ipAddress, now),
      );
    });
  }

  /** For someone who does not use the app. The person stays the appellant. */
  async fileClosureForMember(
    orgId: string,
    closureId: string,
    context: EvaluatedMembershipContext,
    dto: FileAppealDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const closure = await this.lockClosure(manager, closureId);
      if (!closure || closure.organizationId !== orgId) {
        throw new NotFoundException('Closure not found');
      }
      this.closures.assertCanRead(closure, context);
      return memberAppealView(
        await this.fileOnClosure(manager, closure, context.userId, dto, ipAddress, now),
      );
    });
  }

  async fileOnComplaint(
    orgId: string,
    complaintId: string,
    userId: string,
    dto: FileAppealDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const complaint = await manager.findOne(Complaint, {
        where: { id: complaintId, organizationId: orgId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!complaint || complaint.raisedByUserId !== userId) {
        throw new NotFoundException('Complaint not found');
      }
      const earlier = await this.findRetry(manager, userId, dto);
      if (earlier) return memberAppealView(earlier);
      if (complaint.status !== ComplaintStatus.CLOSED) {
        throw new ConflictException('This complaint has not been decided yet');
      }
      const level = nextComplaintLevel(complaint.level);
      if (!level) throw new ConflictException('A Super Admin has made the final decision');
      this.assertInWindow(complaint.decidedAt, now);
      if (
        await manager.exists(Appeal, {
          where: { complaintId: complaint.id, status: AppealStatus.OPEN },
        })
      ) {
        throw new ConflictException('This decision has already been appealed');
      }

      const appeal = await manager.save(
        Appeal,
        manager.create(Appeal, {
          reference: newRestrictionReference('APL', now),
          kind: AppealKind.COMPLAINT,
          organizationId: orgId,
          complaintId: complaint.id,
          appellantUserId: userId,
          filedByUserId: userId,
          originalDeciderUserId: complaint.decidedByUserId ?? null,
          level,
          status: AppealStatus.OPEN,
          grounds: dto.grounds.trim(),
          clientOperationId: dto.clientOperationId ?? null,
        }),
      );
      // It leaves the hands of whoever decided it, with its history.
      complaint.level = level;
      await manager.save(Complaint, complaint);
      await this.complaints.addAppealEvent(
        manager,
        complaint.id,
        userId,
        ComplaintEventType.APPEALED,
      );
      await this.complaints.notifyHandlers(
        manager,
        complaint,
        {
          type: 'APPEAL_FILED',
          title: 'An appeal needs review',
          body: 'Open the admin panel.',
        },
        appeal.originalDeciderUserId ? [appeal.originalDeciderUserId] : [],
      );
      await this.audit(manager, 'APPEAL_FILED', userId, appeal, ipAddress, { kind: appeal.kind });
      return memberAppealView(appeal);
    });
  }

  async list(orgId: string | null, context: EvaluatedMembershipContext, open: boolean) {
    const levels = levelsFor(context);
    if (levels.length === 0) throw new ForbiddenException('Coordinator authority required');
    const appeals = await this.dataSource.getRepository(Appeal).find({
      where: {
        level: In(levels),
        ...(orgId ? { organizationId: orgId } : {}),
        ...(open ? { status: AppealStatus.OPEN } : {}),
      },
      relations: ['organization', 'restrictionCase', 'closure'],
      order: { createdAt: 'DESC' },
      take: LIST_LIMIT,
    });
    return appeals
      .filter(
        (appeal) =>
          appeal.appellantUserId !== context.userId && !this.isPartOf(appeal, context.userId),
      )
      .map(appealSummary);
  }

  async detail(orgId: string | null, appealId: string, context: EvaluatedMembershipContext) {
    const manager = this.dataSource.manager;
    const appeal = await manager.findOne(Appeal, {
      where: { id: appealId, ...(orgId ? { organizationId: orgId } : {}) },
      relations: [
        'organization',
        'appellant',
        'decidedBy',
        'restrictionCase',
        'restrictionCase.recommendedBy',
        'restrictionCase.decidedBy',
        'closure',
        'closure.subject',
        'closure.primary',
        'closure.reportedBy',
        'closure.decidedBy',
        'complaint',
        'complaint.raisedBy',
      ],
    });
    if (!appeal) throw new NotFoundException('Appeal not found');
    await this.assertCanHear(manager, appeal, context);
    const found = appeal.restrictionCase;
    const complaint = appeal.complaint;
    const closure = appeal.closure;
    return {
      ...appealSummary(appeal),
      grounds: appeal.grounds,
      appellantName: appeal.appellant?.fullName ?? null,
      appellantPhone: appeal.appellant?.phoneE164 ?? null,
      filedByStaff: appeal.filedByUserId !== appeal.appellantUserId,
      staffNotes: appeal.staffNotes ?? null,
      memberMessage: appeal.memberMessage ?? null,
      decidedByName: appeal.decidedBy?.fullName ?? null,
      restriction: found
        ? {
            id: found.id,
            reference: found.reference,
            restrictionType: found.restrictionType,
            scope: found.scope,
            reason: found.reason,
            memberMessage: found.memberMessage,
            recommendedByName: found.recommendedBy?.fullName ?? null,
            decidedByName: found.decidedBy?.fullName ?? null,
            decidedAt: found.decidedAt,
          }
        : null,
      closure: closure
        ? {
            id: closure.id,
            reference: closure.reference,
            kind: closure.kind,
            reason: closure.reason,
            memberMessage: closure.memberMessage ?? null,
            primaryName: closure.primary?.fullName ?? null,
            primaryPhone: closure.primary?.phoneE164 ?? null,
            reportedByName: closure.reportedBy?.fullName ?? null,
            decidedByName: closure.decidedBy?.fullName ?? null,
            decidedAt: closure.decidedAt ?? null,
          }
        : null,
      complaint: complaint
        ? {
            id: complaint.id,
            reference: complaint.reference,
            description: complaint.description,
            outcome: complaint.outcome,
            memberMessage: complaint.memberMessage,
            decidedAt: complaint.decidedAt,
          }
        : null,
    };
  }

  async decide(
    orgId: string | null,
    appealId: string,
    context: EvaluatedMembershipContext,
    dto: DecideAppealDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const appeal = await manager.findOne(Appeal, {
        where: { id: appealId, ...(orgId ? { organizationId: orgId } : {}) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!appeal) throw new NotFoundException('Appeal not found');
      await this.loadTargets(manager, appeal);
      await this.assertCanHear(manager, appeal, context);
      if (appeal.status !== AppealStatus.OPEN) {
        throw new ConflictException('This appeal has already been decided');
      }
      if (
        appeal.originalDeciderUserId === context.userId ||
        appeal.restrictionCase?.recommendedByUserId === context.userId ||
        appeal.closure?.reportedByUserId === context.userId
      ) {
        throw new ForbiddenException(
          'You had a part in this decision, so someone else must hear it',
        );
      }

      if (appeal.kind === AppealKind.RESTRICTION) {
        await this.decideOnCase(manager, appeal, context.userId, dto, ipAddress, now);
      } else if (appeal.kind === AppealKind.CLOSURE) {
        await this.decideOnClosure(manager, appeal, context.userId, dto, ipAddress, now);
      } else {
        await this.decideOnComplaint(manager, appeal, context.userId, dto, now);
      }

      appeal.status = AppealStatus.DECIDED;
      appeal.outcome = dto.outcome;
      appeal.staffNotes = dto.notes.trim();
      appeal.memberMessage = dto.memberMessage.trim();
      appeal.decidedByUserId = context.userId;
      appeal.decidedAt = now;
      await manager.save(Appeal, appeal);
      await this.notifications.notifyUsers(manager, [appeal.appellantUserId], {
        organizationId: appeal.organizationId ?? null,
        type: 'APPEAL_DECIDED',
        title: 'An update on your appeal',
        body: 'Open the app to read it.',
      });
      await this.audit(manager, 'APPEAL_DECIDED', context.userId, appeal, ipAddress, {
        kind: appeal.kind,
        outcome: dto.outcome,
        level: appeal.level,
      });
      return appealSummary(appeal);
    });
  }

  private async fileOnCase(
    manager: EntityManager,
    found: RestrictionCase,
    filedBy: string,
    dto: FileAppealDto,
    ipAddress: string | undefined,
    now: Date,
  ): Promise<Appeal> {
    const earlier = await this.findRetry(manager, filedBy, dto);
    if (earlier) return earlier;
    if (found.status !== RestrictionCaseStatus.ACTIVE) {
      throw new ConflictException('This restriction is not in force');
    }
    if (await manager.exists(Appeal, { where: { restrictionCaseId: found.id } })) {
      throw new ConflictException('This decision has already been appealed');
    }
    this.assertInWindow(found.decidedAt, now);
    const appeal = await manager.save(
      Appeal,
      manager.create(Appeal, {
        reference: newRestrictionReference('APL', now),
        kind: AppealKind.RESTRICTION,
        organizationId: found.organizationId ?? null,
        restrictionCaseId: found.id,
        appellantUserId: found.subjectUserId,
        filedByUserId: filedBy,
        originalDeciderUserId: found.decidedByUserId ?? null,
        level: ComplaintLevel.SUPER_ADMIN,
        status: AppealStatus.OPEN,
        grounds: dto.grounds.trim(),
        clientOperationId: dto.clientOperationId ?? null,
      }),
    );
    await this.restrictions.addEvent(manager, found.id, filedBy, RestrictionCaseEventType.APPEALED);
    await this.notifySuperAdmins(manager, {
      organizationId: found.organizationId ?? null,
      excluded: [found.subjectUserId, found.recommendedByUserId, found.decidedByUserId],
    });
    await this.audit(manager, 'APPEAL_FILED', filedBy, appeal, ipAddress, { kind: appeal.kind });
    return appeal;
  }

  private async decideOnCase(
    manager: EntityManager,
    appeal: Appeal,
    actorId: string,
    dto: DecideAppealDto,
    ipAddress: string | undefined,
    now: Date,
  ): Promise<void> {
    const found = await this.lockCase(manager, appeal.restrictionCaseId as string);
    if (!found) throw new NotFoundException('Case not found');
    if (dto.outcome === AppealOutcome.OVERTURNED) {
      if (found.status === RestrictionCaseStatus.ACTIVE) {
        await this.restrictions.endCase(
          manager,
          found,
          RestrictionCaseStatus.OVERTURNED,
          actorId,
          dto.notes,
          ipAddress,
          now,
        );
      }
      return;
    }
    await this.restrictions.addEvent(
      manager,
      found.id,
      actorId,
      RestrictionCaseEventType.APPEAL_STANDS,
      dto.notes,
    );
  }

  private async fileOnClosure(
    manager: EntityManager,
    found: AccountClosure,
    filedBy: string,
    dto: FileAppealDto,
    ipAddress: string | undefined,
    now: Date,
  ): Promise<Appeal> {
    const earlier = await this.findRetry(manager, filedBy, dto);
    if (earlier) return earlier;
    if (found.kind !== ClosureKind.DUPLICATE) {
      throw new ConflictException(
        'A Super Admin can reopen this account if it was closed by mistake',
      );
    }
    if (found.status !== ClosureStatus.CLOSED) {
      throw new ConflictException('This account is not closed');
    }
    if (await manager.exists(Appeal, { where: { closureId: found.id } })) {
      throw new ConflictException('This decision has already been appealed');
    }
    this.assertInWindow(found.decidedAt, now);
    const appeal = await manager.save(
      Appeal,
      manager.create(Appeal, {
        reference: newRestrictionReference('APL', now),
        kind: AppealKind.CLOSURE,
        organizationId: found.organizationId ?? null,
        closureId: found.id,
        appellantUserId: found.subjectUserId,
        filedByUserId: filedBy,
        originalDeciderUserId: found.decidedByUserId ?? null,
        level: ComplaintLevel.SUPER_ADMIN,
        status: AppealStatus.OPEN,
        grounds: dto.grounds.trim(),
        clientOperationId: dto.clientOperationId ?? null,
      }),
    );
    await this.closures.addEvent(manager, found.id, filedBy, ClosureEventType.APPEALED);
    await this.notifySuperAdmins(manager, {
      organizationId: found.organizationId ?? null,
      excluded: [found.subjectUserId, found.reportedByUserId, found.decidedByUserId],
    });
    await this.audit(manager, 'APPEAL_FILED', filedBy, appeal, ipAddress, { kind: appeal.kind });
    return appeal;
  }

  private async decideOnClosure(
    manager: EntityManager,
    appeal: Appeal,
    actorId: string,
    dto: DecideAppealDto,
    ipAddress: string | undefined,
    now: Date,
  ): Promise<void> {
    const found = await this.lockClosure(manager, appeal.closureId as string);
    if (!found) throw new NotFoundException('Closure not found');
    if (dto.outcome === AppealOutcome.OVERTURNED) {
      await this.closures.endClosure(
        manager,
        found,
        ClosureStatus.OVERTURNED,
        actorId,
        dto.notes,
        ipAddress,
        now,
      );
      return;
    }
    await this.closures.addEvent(
      manager,
      found.id,
      actorId,
      ClosureEventType.APPEAL_STANDS,
      dto.notes,
    );
  }

  /** The appeal's level becomes the complaint's. A Super Admin's decision is final. */
  private async decideOnComplaint(
    manager: EntityManager,
    appeal: Appeal,
    actorId: string,
    dto: DecideAppealDto,
    now: Date,
  ): Promise<void> {
    const complaint = await manager.findOne(Complaint, {
      where: { id: appeal.complaintId as string },
      lock: { mode: 'pessimistic_write' },
    });
    if (!complaint) throw new NotFoundException('Complaint not found');
    if (dto.outcome === AppealOutcome.OVERTURNED) {
      complaint.outcome =
        complaint.outcome === ComplaintOutcome.UPHELD
          ? ComplaintOutcome.NOT_UPHELD
          : ComplaintOutcome.UPHELD;
    }
    complaint.memberMessage = dto.memberMessage.trim();
    complaint.decidedAt = now;
    complaint.decidedByUserId = actorId;
    await manager.save(Complaint, complaint);
    await this.complaints.addAppealEvent(
      manager,
      complaint.id,
      actorId,
      ComplaintEventType.APPEAL_DECIDED,
      dto.notes,
    );
  }

  /** The same 404 as for an appeal that does not exist. */
  private async assertCanHear(
    manager: EntityManager,
    appeal: Appeal,
    context: EvaluatedMembershipContext,
  ): Promise<void> {
    await this.loadTargets(manager, appeal);
    const reachable =
      levelsFor(context).includes(appeal.level) &&
      appeal.appellantUserId !== context.userId &&
      (appeal.kind !== AppealKind.COMPLAINT ||
        (await this.complaints.canHandle(manager, appeal.complaintId as string, context)));
    if (!reachable) throw new NotFoundException('Appeal not found');
  }

  private async loadTargets(manager: EntityManager, appeal: Appeal): Promise<void> {
    if (appeal.restrictionCaseId && !appeal.restrictionCase) {
      appeal.restrictionCase = await manager.findOne(RestrictionCase, {
        where: { id: appeal.restrictionCaseId },
      });
    }
    if (appeal.closureId && !appeal.closure) {
      appeal.closure = await manager.findOne(AccountClosure, { where: { id: appeal.closureId } });
    }
  }

  private isPartOf(appeal: Appeal, userId: string): boolean {
    return (
      appeal.originalDeciderUserId === userId ||
      appeal.restrictionCase?.recommendedByUserId === userId ||
      appeal.closure?.reportedByUserId === userId
    );
  }

  private lockCase(manager: EntityManager, caseId: string): Promise<RestrictionCase | null> {
    return manager.findOne(RestrictionCase, {
      where: { id: caseId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private lockClosure(manager: EntityManager, closureId: string): Promise<AccountClosure | null> {
    return manager.findOne(AccountClosure, {
      where: { id: closureId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private findRetry(
    manager: EntityManager,
    filedBy: string,
    dto: FileAppealDto,
  ): Promise<Appeal | null> {
    if (!dto.clientOperationId) return Promise.resolve(null);
    return manager.findOne(Appeal, {
      where: { filedByUserId: filedBy, clientOperationId: dto.clientOperationId },
    });
  }

  private assertInWindow(decidedAt: Date | null | undefined, now: Date): void {
    const deadline = appealDeadline(decidedAt);
    if (!deadline || now > deadline) {
      throw new ConflictException(
        `An appeal must be made within ${APPEAL_WINDOW_DAYS} days of the decision`,
      );
    }
  }

  private async notifySuperAdmins(
    manager: EntityManager,
    about: { organizationId: string | null; excluded: (string | null | undefined)[] },
  ): Promise<void> {
    const central: { user_id: string }[] = await manager.query(
      `SELECT DISTINCT m.user_id FROM organization_memberships m
       JOIN membership_role_grants g ON g.membership_id = m.id
       WHERE m.status = 'APPROVED' AND g.status = 'ACTIVE' AND g.role = 'SUPER_ADMIN'`,
    );
    const excluded = new Set(about.excluded.filter(Boolean));
    await this.notifications.notifyUsers(
      manager,
      central.map((row) => row.user_id).filter((id) => !excluded.has(id)),
      {
        organizationId: about.organizationId,
        type: 'APPEAL_FILED',
        title: 'An appeal needs review',
        body: 'Open the admin panel.',
      },
    );
  }

  /** Never the grounds or the message: those stay on the appeal. */
  private async audit(
    manager: EntityManager,
    eventType: string,
    actorId: string,
    appeal: Appeal,
    ipAddress: string | undefined,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.logEvent(
      {
        eventType,
        actorId,
        targetId: appeal.id,
        targetType: 'appeals',
        organizationId: appeal.organizationId ?? null,
        payload: { appellantUserId: appeal.appellantUserId, ...payload },
        ipAddress: ipAddress ?? null,
      },
      manager,
    );
  }
}

function appealSummary(appeal: Appeal) {
  return {
    id: appeal.id,
    reference: appeal.reference,
    kind: appeal.kind,
    organizationId: appeal.organizationId ?? null,
    organizationName: appeal.organization?.name ?? null,
    level: appeal.level,
    status: appeal.status,
    outcome: appeal.outcome ?? null,
    createdAt: appeal.createdAt,
    decidedAt: appeal.decidedAt ?? null,
  };
}

/** Everything the appellant may know: never who heard it, or their notes. */
export function memberAppealView(appeal: Appeal) {
  return {
    id: appeal.id,
    reference: appeal.reference,
    status: appeal.status,
    outcome: appeal.outcome ?? null,
    grounds: appeal.grounds,
    memberMessage: appeal.memberMessage ?? null,
    createdAt: appeal.createdAt,
    decidedAt: appeal.decidedAt ?? null,
  };
}
