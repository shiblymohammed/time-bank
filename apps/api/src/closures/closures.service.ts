import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import {
  AccountStatus,
  ClosureEventType,
  ClosureKind,
  ClosureStatus,
  ComplaintLevel,
  GlobalRestrictionStatus,
  IdentityVerificationStatus,
  GlobalRestrictionType,
  MembershipStatus,
  RestrictionScope,
  RestrictionCaseEventType,
  RestrictionCaseStatus,
  UserRole,
} from '@ktb/shared-types';
import { AuditService } from '../audit/audit.service';
import { normalizeToE164 } from '../auth/utils/phone.util';
import { EvaluatedMembershipContext } from '../authorization/authorization.service';
import { levelsFor } from '../complaints/complaints.service';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { User } from '../identity/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Appeal } from '../restrictions/entities/appeal.entity';
import { RestrictionCase } from '../restrictions/entities/restriction-case.entity';
import { assertSuperAdminRemains, holdsSuperAdmin } from '../restrictions/platform-restriction';
import {
  levelForRoles,
  newRestrictionReference,
  RestrictionsService,
} from '../restrictions/restrictions.service';
import { CaseNoteDto } from '../restrictions/dto/restriction.dto';
import { CreditControlsService } from '../time-ledger/credit-controls.service';
import { ApproveClosureDto, RecommendTransferDto, ReportClosureDto } from './dto/closure.dto';
import { AccountClosureEvent } from './entities/account-closure-event.entity';
import { AccountClosure, ClosureRestoreState } from './entities/account-closure.entity';
import { DeathNominee } from './entities/death-nominee.entity';
import { LoyaltyService } from '../loyalty/loyalty.service';

const LIST_LIMIT = 100;
/** A nominee named this close to a death, or after it, gets a second look (D#45). */
const NOMINEE_REVIEW_DAYS = 30;
const STAFF_ROLES = [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN];

/**
 * Closing an account because its owner has died, or because it is a duplicate (FR-IDENT-07/08,
 * D#46, D#87-90). A coordinator reports and a Municipality Admin decides; a person in several
 * communities goes to a Super Admin. Nobody acts on their own case, and whoever reported it cannot
 * also decide. Access stops only at the decision, so one wrong report cannot lock someone out.
 *
 * Nothing is merged or deleted. A closed wallet keeps its credits and can no longer be used: a
 * duplicate's stay there for good (D#89), and a deceased member's can pass to a verified nominee.
 */
@Injectable()
export class ClosuresService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly auditService: AuditService,
    private readonly restrictions: RestrictionsService,
    private readonly credits: CreditControlsService,
    private readonly loyalty: LoyaltyService,
  ) {}

  async report(
    orgId: string,
    context: EvaluatedMembershipContext,
    dto: ReportClosureDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    if (levelsFor(context).length === 0) {
      throw new ForbiddenException('Coordinator authority required');
    }
    this.assertReportComplete(dto, now);
    const actorId = context.userId;
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      if (dto.clientOperationId) {
        const earlier = await manager.findOne(AccountClosure, {
          where: { reportedByUserId: actorId, clientOperationId: dto.clientOperationId },
        });
        if (earlier) return summary(earlier);
      }
      const member = await this.restrictions.findMember(manager, orgId, dto.member);
      if (member.userId === actorId) {
        throw new ForbiddenException('You cannot report your own account');
      }
      await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `closure:${member.userId}`,
      ]);
      const level = levelForRoles(await this.restrictions.activeRoles(manager, member.userId));
      if (!levelsFor(context).includes(level)) {
        throw new ForbiddenException('Someone at a higher level must report this');
      }
      if (
        await manager.exists(AccountClosure, {
          where: {
            subjectUserId: member.userId,
            status: In([ClosureStatus.REPORTED, ClosureStatus.CLOSED]),
          },
        })
      ) {
        throw new ConflictException('This account has already been reported');
      }
      const primaryUserId =
        dto.kind === ClosureKind.DUPLICATE
          ? await this.findPrimary(manager, orgId, dto.primaryMember as string, member.userId)
          : null;
      const communities: { count: string }[] = await manager.query(
        `SELECT count(*) FROM organization_memberships
         WHERE user_id = $1 AND status IN ('APPROVED', 'SUSPENDED')`,
        [member.userId],
      );

      const created = await manager.save(
        AccountClosure,
        manager.create(AccountClosure, {
          reference: newRestrictionReference('CLS', now),
          kind: dto.kind,
          organizationId: orgId,
          subjectUserId: member.userId,
          subjectMembershipId: member.id,
          primaryUserId,
          level,
          needsSuperAdmin: Number(communities[0]?.count ?? 0) > 1,
          status: ClosureStatus.REPORTED,
          reason: dto.reason.trim(),
          dateOfDeath:
            dto.kind === ClosureKind.DECEASED ? (dto.dateOfDeath as string).slice(0, 10) : null,
          evidenceType: dto.kind === ClosureKind.DECEASED ? (dto.evidenceType ?? null) : null,
          evidenceLast4:
            dto.kind === ClosureKind.DECEASED ? (dto.evidenceLast4?.toUpperCase() ?? null) : null,
          reportedByUserId: actorId,
          clientOperationId: dto.clientOperationId ?? null,
        }),
      );
      await this.addEvent(manager, created.id, actorId, ClosureEventType.REPORTED);
      await this.notifyDeciders(manager, created, {
        type: 'CLOSURE_REPORTED',
        title: 'An account closure needs your decision',
        body: 'Open the admin panel.',
      });
      await this.audit(manager, 'CLOSURE_REPORTED', actorId, created, ipAddress, {
        kind: created.kind,
        level,
      });
      return summary(created);
    });
  }

  async list(orgId: string | null, context: EvaluatedMembershipContext, open: boolean) {
    const levels = levelsFor(context);
    if (levels.length === 0) throw new ForbiddenException('Coordinator authority required');
    const found = await this.dataSource.getRepository(AccountClosure).find({
      where: {
        level: In(levels),
        ...(orgId ? { organizationId: orgId } : {}),
        ...(open ? { status: In([ClosureStatus.REPORTED, ClosureStatus.CLOSED]) } : {}),
      },
      relations: ['organization', 'subject', 'subjectMembership'],
      order: { createdAt: 'DESC' },
      take: LIST_LIMIT,
    });
    const visible = found.filter((item) => item.subjectUserId !== context.userId);
    const appeals = await this.dataSource.getRepository(Appeal).find({
      where: { closureId: In(visible.map((item) => item.id)) },
    });
    const appealed = new Map(appeals.map((appeal) => [appeal.closureId, appeal]));
    return visible.map((item) => summary(item, appealed.get(item.id)));
  }

  async detail(orgId: string | null, closureId: string, context: EvaluatedMembershipContext) {
    const manager = this.dataSource.manager;
    const found = await manager.findOne(AccountClosure, {
      where: { id: closureId, ...(orgId ? { organizationId: orgId } : {}) },
      relations: [
        'organization',
        'subject',
        'subjectMembership',
        'primary',
        'receiver',
        'reportedBy',
        'decidedBy',
      ],
    });
    if (!found) throw new NotFoundException('Closure not found');
    this.assertCanRead(found, context);
    const [events, appeal, nominees] = await Promise.all([
      manager.find(AccountClosureEvent, {
        where: { closureId: found.id },
        relations: ['actor'],
        order: { createdAt: 'ASC' },
      }),
      manager.findOne(Appeal, { where: { closureId: found.id } }),
      found.kind === ClosureKind.DECEASED
        ? manager.find(DeathNominee, {
            where: { userId: found.subjectUserId },
            order: { createdAt: 'DESC' },
          })
        : Promise.resolve([] as DeathNominee[]),
    ]);
    const current = nominees.find((nominee) => !nominee.replacedAt);
    return {
      ...summary(found, appeal),
      reason: found.reason,
      dateOfDeath: found.dateOfDeath ?? null,
      evidenceType: found.evidenceType ?? null,
      evidenceLast4: found.evidenceLast4 ?? null,
      memberMessage: found.memberMessage ?? null,
      reportedByName: found.reportedBy?.fullName ?? null,
      decidedByName: found.decidedBy?.fullName ?? null,
      primary: found.primary
        ? { name: found.primary.fullName ?? null, phone: found.primary.phoneE164 }
        : null,
      nominee: current
        ? { name: current.nomineeName, phone: current.nomineePhone, since: current.createdAt }
        : null,
      earlierNominees: nominees
        .filter((nominee) => nominee.replacedAt)
        .map((nominee) => ({
          name: nominee.nomineeName,
          phone: nominee.nomineePhone,
          since: nominee.createdAt,
          replacedAt: nominee.replacedAt,
        })),
      transfer: {
        available: await this.credits.estateAvailable(manager, found.subjectUserId),
        receiverName: found.receiver?.fullName ?? null,
        receiverPhone: found.receiver?.phoneE164 ?? null,
        receiverMatchesNominee: found.receiver
          ? found.receiver.phoneE164 === current?.nomineePhone
          : null,
        transferred: found.transferredCredits,
        lastTransferredAt: found.lastTransferredAt ?? null,
      },
      accounts: await Promise.all([
        this.accountReview(manager, 'This account', found.subjectUserId),
        ...(found.primaryUserId
          ? [this.accountReview(manager, 'The account that stays', found.primaryUserId)]
          : []),
      ]),
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
    closureId: string,
    context: EvaluatedMembershipContext,
    dto: ApproveClosureDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.act(orgId, closureId, context, async (manager, found) => {
      if (found.status !== ClosureStatus.REPORTED) {
        throw new ConflictException('This report has already been decided');
      }
      this.assertCanDecide(found, context);
      if (found.reportedByUserId === context.userId) {
        throw new ForbiddenException('You reported this, so someone else must decide it');
      }
      if (found.kind === ClosureKind.DUPLICATE && !dto.memberMessage?.trim()) {
        throw new BadRequestException('Write what the person is told when they sign in');
      }
      // A duplicate's surviving account must stay open through this decision.
      // Lock both people in a stable order so reciprocal closures cannot close both.
      const people = await manager.find(User, {
        where: {
          id: In([found.subjectUserId, ...(found.primaryUserId ? [found.primaryUserId] : [])]),
        },
        order: { id: 'ASC' },
        lock: { mode: 'for_no_key_update' },
      });
      const user = people.find((person) => person.id === found.subjectUserId);
      if (!user) throw new NotFoundException('Person not found');
      // Memberships and staff roles can change while the report waits for a decision.
      const level = levelForRoles(await this.restrictions.activeRoles(manager, user.id));
      const [communities]: { count: string }[] = await manager.query(
        `SELECT count(*) FROM organization_memberships
         WHERE user_id = $1 AND status IN ('APPROVED', 'SUSPENDED')`,
        [user.id],
      );
      if (Number(communities?.count ?? 0) > 1) found.needsSuperAdmin = true;
      if (level === ComplaintLevel.SUPER_ADMIN) found.level = level;
      this.assertCanDecide(found, context);
      if (found.primaryUserId) await this.assertPrimaryOpen(manager, found.primaryUserId);
      if (await holdsSuperAdmin(manager, user.id)) {
        await assertSuperAdminRemains(manager, { userId: user.id });
      }

      found.restoreState = await this.closeEverything(
        manager,
        found,
        user,
        context.userId,
        ipAddress,
      );
      found.status = ClosureStatus.CLOSED;
      found.memberMessage = dto.memberMessage?.trim() || null;
      found.decidedByUserId = context.userId;
      found.decidedAt = now;
      found.nomineeUnderReview =
        found.kind === ClosureKind.DECEASED && (await this.nomineeNamedLate(manager, found));
      await manager.save(AccountClosure, found);
      await this.addEvent(manager, found.id, context.userId, ClosureEventType.APPROVED, dto.notes);
      await this.loyalty.closeAccount(
        manager,
        user.id,
        found.id,
        found.kind === ClosureKind.DECEASED,
      );
      await this.tellReporter(manager, found);
      await this.audit(manager, 'CLOSURE_APPROVED', context.userId, found, ipAddress, {
        kind: found.kind,
      });
      return summary(found);
    });
  }

  async refuse(
    orgId: string | null,
    closureId: string,
    context: EvaluatedMembershipContext,
    dto: CaseNoteDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.act(orgId, closureId, context, async (manager, found) => {
      if (found.status !== ClosureStatus.REPORTED) {
        throw new ConflictException('This report has already been decided');
      }
      this.assertCanDecide(found, context);
      found.status = ClosureStatus.REFUSED;
      found.decidedByUserId = context.userId;
      found.decidedAt = now;
      await manager.save(AccountClosure, found);
      await this.addEvent(manager, found.id, context.userId, ClosureEventType.REFUSED, dto.notes);
      await this.tellReporter(manager, found);
      await this.audit(manager, 'CLOSURE_REFUSED', context.userId, found, ipAddress, {});
      return summary(found);
    });
  }

  async addNote(
    orgId: string | null,
    closureId: string,
    context: EvaluatedMembershipContext,
    dto: CaseNoteDto,
    ipAddress?: string,
  ) {
    return this.act(orgId, closureId, context, async (manager, found) => {
      await this.addEvent(manager, found.id, context.userId, ClosureEventType.NOTE, dto.notes);
      await this.audit(manager, 'CLOSURE_NOTE_ADDED', context.userId, found, ipAddress, {});
      return summary(found);
    });
  }

  /** D#45: someone questions the nominee. No credits move until a coordinator has looked. */
  async dispute(
    orgId: string | null,
    closureId: string,
    context: EvaluatedMembershipContext,
    dto: CaseNoteDto,
    ipAddress?: string,
  ) {
    return this.act(orgId, closureId, context, async (manager, found) => {
      this.assertDeceasedAndClosed(found);
      found.nomineeUnderReview = true;
      clearRecommendation(found);
      await manager.save(AccountClosure, found);
      await this.addEvent(manager, found.id, context.userId, ClosureEventType.DISPUTED, dto.notes);
      await this.audit(manager, 'NOMINEE_DISPUTED', context.userId, found, ipAddress, {});
      return summary(found);
    });
  }

  async resolveDispute(
    orgId: string | null,
    closureId: string,
    context: EvaluatedMembershipContext,
    dto: CaseNoteDto,
    ipAddress?: string,
  ) {
    return this.act(orgId, closureId, context, async (manager, found) => {
      this.assertDeceasedAndClosed(found);
      if (!found.nomineeUnderReview) throw new ConflictException('Nothing is under review');
      found.nomineeUnderReview = false;
      await manager.save(AccountClosure, found);
      await this.addEvent(
        manager,
        found.id,
        context.userId,
        ClosureEventType.DISPUTE_RESOLVED,
        dto.notes,
      );
      await this.audit(manager, 'NOMINEE_REVIEWED', context.userId, found, ipAddress, {});
      return summary(found);
    });
  }

  async recommendTransfer(
    orgId: string | null,
    closureId: string,
    context: EvaluatedMembershipContext,
    dto: RecommendTransferDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.act(orgId, closureId, context, async (manager, found) => {
      this.assertDeceasedAndClosed(found);
      if (found.transferRecommendedByUserId) {
        throw new ConflictException('A transfer is already waiting for a decision');
      }
      this.assertNomineeClear(found);
      const nominee = await this.currentNominee(manager, found);
      if (!nominee) throw new ConflictException('This member named nobody');
      if ((await this.credits.estateAvailable(manager, found.subjectUserId)) <= 0) {
        throw new ConflictException('This account has no credits to pass on');
      }
      const receiver = await this.findReceiver(manager, found, dto.receiver);
      await this.assertReceiver(manager, found, receiver, context.userId);
      found.receiverUserId = receiver.id;
      found.transferRecommendedByUserId = context.userId;
      found.transferRecommendedAt = now;
      await manager.save(AccountClosure, found);
      await this.addEvent(
        manager,
        found.id,
        context.userId,
        ClosureEventType.TRANSFER_RECOMMENDED,
        dto.notes,
      );
      await this.notifyDeciders(
        manager,
        found,
        {
          type: 'CLOSURE_TRANSFER_RECOMMENDED',
          title: 'A credit transfer needs your decision',
          body: 'Open the admin panel.',
        },
        [context.userId],
      );
      await this.audit(
        manager,
        'CLOSURE_TRANSFER_RECOMMENDED',
        context.userId,
        found,
        ipAddress,
        {},
      );
      return summary(found);
    });
  }

  async refuseTransfer(
    orgId: string | null,
    closureId: string,
    context: EvaluatedMembershipContext,
    dto: CaseNoteDto,
    ipAddress?: string,
  ) {
    return this.act(orgId, closureId, context, async (manager, found) => {
      if (!found.transferRecommendedByUserId) {
        throw new ConflictException('No transfer is waiting');
      }
      this.assertCanDecide(found, context);
      clearRecommendation(found);
      await manager.save(AccountClosure, found);
      await this.addEvent(
        manager,
        found.id,
        context.userId,
        ClosureEventType.TRANSFER_REFUSED,
        dto.notes,
      );
      await this.audit(manager, 'CLOSURE_TRANSFER_REFUSED', context.userId, found, ipAddress, {});
      return summary(found);
    });
  }

  async approveTransfer(
    orgId: string | null,
    closureId: string,
    context: EvaluatedMembershipContext,
    dto: CaseNoteDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.act(orgId, closureId, context, async (manager, found) => {
      this.assertDeceasedAndClosed(found);
      if (!found.transferRecommendedByUserId || !found.receiverUserId) {
        throw new ConflictException('No transfer is waiting');
      }
      this.assertCanDecide(found, context);
      if (found.transferRecommendedByUserId === context.userId) {
        throw new ForbiddenException('You recommended this, so someone else must decide it');
      }
      this.assertNomineeClear(found);
      const nominee = await this.currentNominee(manager, found);
      if (!nominee) throw new ConflictException('This member named nobody');
      const receiver = await manager.findOne(User, { where: { id: found.receiverUserId } });
      if (!receiver) throw new NotFoundException('Person not found');
      await this.assertReceiver(manager, found, receiver, context.userId);
      if (receiver.phoneE164 !== nominee.nomineePhone && !context.isSuperAdmin) {
        throw new ForbiddenException(
          'That account’s phone is not the one the member named. A Super Admin must decide.',
        );
      }
      const amount = await this.credits.transferEstate(manager, {
        closureId: found.id,
        reference: found.reference,
        organizationId: found.organizationId ?? null,
        fromUserId: found.subjectUserId,
        toUserId: receiver.id,
        actor: context.userId,
      });
      found.transferredCredits =
        Math.round((Number(found.transferredCredits) + amount) * 100) / 100;
      found.lastTransferredAt = now;
      clearRecommendation(found);
      await manager.save(AccountClosure, found);
      await this.addEvent(
        manager,
        found.id,
        context.userId,
        ClosureEventType.TRANSFERRED,
        dto.notes,
      );
      await this.notifications.notifyUsers(manager, [receiver.id], {
        organizationId: found.organizationId ?? null,
        type: 'CLOSURE_CREDITS_RECEIVED',
        title: 'Time credits were added to your wallet',
        body: 'Open the app to see them.',
      });
      await this.audit(manager, 'CLOSURE_CREDITS_TRANSFERRED', context.userId, found, ipAddress, {
        amount,
        receiverUserId: receiver.id,
      });
      return { ...summary(found), amount };
    });
  }

  /** A closure that was wrong. Staff roles do not come back: someone must grant them again. */
  async reopen(
    orgId: string | null,
    closureId: string,
    context: EvaluatedMembershipContext,
    dto: CaseNoteDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    if (!context.isSuperAdmin) throw new ForbiddenException('A Super Admin must reopen an account');
    return this.act(orgId, closureId, context, async (manager, found) => {
      await this.endClosure(
        manager,
        found,
        ClosureStatus.REOPENED,
        context.userId,
        dto.notes,
        ipAddress,
        now,
      );
      return summary(found);
    });
  }

  /** Puts back what approval changed: on reopening, or on an appeal that succeeds. */
  async endClosure(
    manager: EntityManager,
    found: AccountClosure,
    status: ClosureStatus.REOPENED | ClosureStatus.OVERTURNED,
    actorId: string,
    notes: string,
    ipAddress?: string,
    now = new Date(),
  ): Promise<void> {
    if (found.status !== ClosureStatus.CLOSED || !found.restoreState) {
      throw new ConflictException('This account is not closed');
    }
    const state = found.restoreState;
    const user = await manager.findOne(User, {
      where: { id: found.subjectUserId },
      lock: { mode: 'for_no_key_update' },
    });
    if (!user) throw new NotFoundException('Person not found');
    // A restriction may have ended while the account was closed. Restore its current
    // effect, rather than bringing a resolved suspension back from the closure snapshot.
    const restrictions = await manager.find(GlobalAccountRestriction, {
      where: { userId: user.id },
    });
    const active = restrictions.filter((item) => item.status === GlobalRestrictionStatus.ACTIVE);
    const wasRestricted = restrictions.some(
      (item) =>
        [GlobalRestrictionType.TEMPORARY_SUSPENSION, GlobalRestrictionType.PERMANENT_BAN].includes(
          item.restrictionType,
        ) &&
        found.decidedAt &&
        item.createdAt <= found.decidedAt &&
        (!item.resolvedAt || item.resolvedAt >= found.decidedAt),
    );
    const priorBlocked = [AccountStatus.SUSPENDED, AccountStatus.PERMANENTLY_BANNED].includes(
      state.userStatus as AccountStatus,
    );
    user.status = active.some(
      (item) => item.restrictionType === GlobalRestrictionType.PERMANENT_BAN,
    )
      ? AccountStatus.PERMANENTLY_BANNED
      : active.some((item) => item.restrictionType === GlobalRestrictionType.TEMPORARY_SUSPENSION)
        ? AccountStatus.SUSPENDED
        : priorBlocked && wasRestricted
          ? AccountStatus.ACTIVE
          : (state.userStatus as AccountStatus);
    await manager.save(User, user);
    await manager.query(
      'UPDATE universal_time_wallets SET status = $2, updated_at = now() WHERE user_id = $1',
      [user.id, state.walletStatus ?? 'ACTIVE'],
    );
    const communityCases = await manager.find(RestrictionCase, {
      where: { subjectUserId: user.id, scope: RestrictionScope.COMMUNITY },
    });
    for (const membership of state.memberships) {
      const cases = communityCases.filter((item) => item.subjectMembershipId === membership.id);
      const wasSuspended = cases.some(
        (item) =>
          found.decidedAt &&
          item.decidedAt &&
          item.decidedAt <= found.decidedAt &&
          (!item.endedAt || item.endedAt >= found.decidedAt),
      );
      const stillSuspended = cases.some((item) => item.status === RestrictionCaseStatus.ACTIVE);
      const restoredStatus = stillSuspended
        ? MembershipStatus.SUSPENDED
        : membership.status === MembershipStatus.SUSPENDED && wasSuspended
          ? MembershipStatus.APPROVED
          : membership.status;
      await manager.query(
        `UPDATE organization_memberships SET status = $2, updated_at = now()
         WHERE id = $1 AND status = 'REVOKED'`,
        [membership.id, restoredStatus],
      );
    }
    await this.restoreDocument(manager, user.id, state);

    found.status = status;
    found.endedByUserId = actorId;
    found.endedAt = now;
    clearRecommendation(found);
    await manager.save(AccountClosure, found);
    await this.addEvent(
      manager,
      found.id,
      actorId,
      status === ClosureStatus.OVERTURNED ? ClosureEventType.OVERTURNED : ClosureEventType.REOPENED,
      notes,
    );
    await this.releaseHeldCredits(manager, found, user, actorId);
    await this.loyalty.reopenAccount(manager, user.id, found.id);
    await this.audit(
      manager,
      status === ClosureStatus.OVERTURNED ? 'CLOSURE_OVERTURNED' : 'CLOSURE_REOPENED',
      actorId,
      found,
      ipAddress,
      { kind: found.kind, creditsAlreadyPassedOn: Number(found.transferredCredits) },
    );
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** The same 404 as for a closure that does not exist. */
  assertCanRead(found: AccountClosure, context: EvaluatedMembershipContext): void {
    if (!levelsFor(context).includes(found.level) || found.subjectUserId === context.userId) {
      throw new NotFoundException('Closure not found');
    }
  }

  async addEvent(
    manager: EntityManager,
    closureId: string,
    actorUserId: string,
    type: ClosureEventType,
    notes?: string,
  ): Promise<void> {
    await manager.insert(AccountClosureEvent, {
      closureId,
      actorUserId,
      type,
      notes: notes?.trim() || null,
    });
  }

  private async act<T>(
    orgId: string | null,
    closureId: string,
    context: EvaluatedMembershipContext,
    work: (manager: EntityManager, found: AccountClosure) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const found = await manager.findOne(AccountClosure, {
        where: { id: closureId, ...(orgId ? { organizationId: orgId } : {}) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!found) throw new NotFoundException('Closure not found');
      this.assertCanRead(found, context);
      return work(manager, found);
    });
  }

  private assertReportComplete(dto: ReportClosureDto, now: Date): void {
    if (dto.kind === ClosureKind.DECEASED) {
      if (!dto.dateOfDeath || !dto.evidenceType || !dto.evidenceLast4) {
        throw new BadRequestException('Give the date of death and the record you saw');
      }
      if (new Date(dto.dateOfDeath) > now) {
        throw new BadRequestException('The date of death cannot be in the future');
      }
    } else if (!dto.primaryMember) {
      throw new BadRequestException('Give the phone or member number of the account that stays');
    }
  }

  private assertCanDecide(found: AccountClosure, context: EvaluatedMembershipContext): void {
    if (context.isSuperAdmin) return;
    if (found.needsSuperAdmin) {
      throw new ForbiddenException(
        'This person belongs to several communities. A Super Admin must decide.',
      );
    }
    if (
      found.level === ComplaintLevel.SUPER_ADMIN ||
      !context.roles.includes(UserRole.MUNICIPALITY_ADMIN)
    ) {
      throw new ForbiddenException('A Municipality Admin must decide this');
    }
  }

  private assertDeceasedAndClosed(found: AccountClosure): void {
    if (found.kind !== ClosureKind.DECEASED) {
      throw new ConflictException('A duplicate keeps its credits: nothing is passed on');
    }
    if (found.status !== ClosureStatus.CLOSED)
      throw new ConflictException('This account is not closed');
  }

  private assertNomineeClear(found: AccountClosure): void {
    if (found.nomineeUnderReview) {
      throw new ConflictException('The nominee is under review. A coordinator must look first.');
    }
  }

  /** What approval changes, and what would have to come back if it was wrong. */
  private async closeEverything(
    manager: EntityManager,
    found: AccountClosure,
    user: User,
    actorId: string,
    ipAddress?: string,
  ): Promise<ClosureRestoreState> {
    const memberships: { id: string; status: string }[] = await manager.query(
      `SELECT id, status FROM organization_memberships WHERE user_id = $1 AND status <> 'REVOKED'`,
      [user.id],
    );
    const membershipIds = memberships.map((membership) => membership.id);
    await this.restrictions.stopBookingsFor(manager, membershipIds, user.id, actorId, ipAddress);
    await this.endOpenRecommendations(manager, user.id, actorId);

    if (membershipIds.length > 0) {
      await manager.query(
        `UPDATE membership_role_grants SET status = 'REVOKED', revoked_at = now(), revoked_by = $2,
           revocation_reason = 'Account closed'
         WHERE membership_id = ANY($1) AND role = ANY($3) AND status <> 'REVOKED'`,
        [membershipIds, actorId, STAFF_ROLES],
      );
      await manager.query(
        `UPDATE organization_memberships SET status = 'REVOKED', updated_at = now()
         WHERE id = ANY($1)`,
        [membershipIds],
      );
    }
    const [wallet]: { status: string }[] = await manager.query(
      'SELECT status FROM universal_time_wallets WHERE user_id = $1 FOR UPDATE',
      [user.id],
    );
    await manager.query(
      `UPDATE universal_time_wallets SET status = 'CLOSED', updated_at = now() WHERE user_id = $1`,
      [user.id],
    );
    await manager.query(
      `UPDATE authentication_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [user.id],
    );
    await manager.query('DELETE FROM push_devices WHERE user_id = $1', [user.id]);
    await manager.query(
      `UPDATE notification_outbox SET status = 'EXPIRED' WHERE user_id = $1 AND status = 'PENDING'`,
      [user.id],
    );

    // The document can now verify the account that stays. A death keeps it, so nobody can reuse it.
    let documentFingerprint: string | null = null;
    if (found.kind === ClosureKind.DUPLICATE) {
      const [identity]: { document_fingerprint: string | null }[] = await manager.query(
        'SELECT document_fingerprint FROM verified_identities WHERE user_id = $1',
        [user.id],
      );
      documentFingerprint = identity?.document_fingerprint ?? null;
      await manager.query(
        `UPDATE verified_identities SET document_fingerprint = NULL, updated_at = now() WHERE user_id = $1`,
        [user.id],
      );
    }

    const previous = user.status;
    user.status =
      found.kind === ClosureKind.DECEASED
        ? AccountStatus.DECEASED_CLOSED
        : AccountStatus.DUPLICATE_CLOSED;
    await manager.save(User, user);
    return {
      userStatus: previous,
      walletStatus: wallet?.status ?? null,
      memberships,
      documentFingerprint,
    };
  }

  /** Nothing further can be decided about someone whose account has closed. */
  private async endOpenRecommendations(
    manager: EntityManager,
    userId: string,
    actorId: string,
  ): Promise<void> {
    const open = await manager.find(RestrictionCase, {
      where: { subjectUserId: userId, status: RestrictionCaseStatus.RECOMMENDED },
      lock: { mode: 'pessimistic_write' },
    });
    for (const item of open) {
      item.status = RestrictionCaseStatus.REFUSED;
      item.decidedByUserId = actorId;
      item.decidedAt = new Date();
      await manager.save(RestrictionCase, item);
      await this.restrictions.addEvent(
        manager,
        item.id,
        actorId,
        RestrictionCaseEventType.REFUSED,
        'The account has closed',
      );
    }
  }

  /** If someone else has used the document since, this account must be checked again. */
  private async restoreDocument(
    manager: EntityManager,
    userId: string,
    state: ClosureRestoreState,
  ): Promise<void> {
    if (!state.documentFingerprint) return;
    const taken: unknown[] = await manager.query(
      'SELECT 1 FROM verified_identities WHERE document_fingerprint = $1 AND user_id <> $2',
      [state.documentFingerprint, userId],
    );
    if (taken.length > 0) {
      await manager.query(
        `UPDATE verified_identities SET verification_status = $2, verified_at = NULL, updated_at = now()
         WHERE user_id = $1`,
        [userId, IdentityVerificationStatus.UNVERIFIED],
      );
    } else {
      await manager.query(
        `UPDATE verified_identities SET document_fingerprint = $2, updated_at = now() WHERE user_id = $1`,
        [userId, state.documentFingerprint],
      );
    }
  }

  private async releaseHeldCredits(
    manager: EntityManager,
    found: AccountClosure,
    user: User,
    actorId: string,
  ): Promise<void> {
    if (user.status !== AccountStatus.ACTIVE || !found.decidedAt) return;
    const restricted = await manager.exists(GlobalAccountRestriction, {
      where: { userId: user.id, status: GlobalRestrictionStatus.ACTIVE },
    });
    if (restricted) return;
    await this.credits.releaseRestrictionHolds(
      manager,
      user.id,
      found.decidedAt,
      actorId,
      found.reference,
    );
  }

  private currentNominee(
    manager: EntityManager,
    found: AccountClosure,
  ): Promise<DeathNominee | null> {
    return manager.findOne(DeathNominee, {
      where: { userId: found.subjectUserId, replacedAt: IsNull() },
    });
  }

  private async nomineeNamedLate(manager: EntityManager, found: AccountClosure): Promise<boolean> {
    const nominee = await this.currentNominee(manager, found);
    if (!nominee || !found.dateOfDeath) return false;
    const since = new Date(found.dateOfDeath);
    since.setUTCDate(since.getUTCDate() - NOMINEE_REVIEW_DAYS);
    return nominee.createdAt >= since;
  }

  private async findPrimary(
    manager: EntityManager,
    orgId: string,
    value: string,
    subjectUserId: string,
  ): Promise<string> {
    const userId = await this.findUserId(manager, orgId, value);
    if (!userId) throw new NotFoundException('No account has that number');
    if (userId === subjectUserId) {
      throw new BadRequestException('The account that stays must be a different one');
    }
    await this.assertPrimaryOpen(manager, userId);
    return userId;
  }

  private async assertPrimaryOpen(manager: EntityManager, userId: string): Promise<void> {
    const [row]: { status: string }[] = await manager.query(
      'SELECT status FROM users WHERE id = $1',
      [userId],
    );
    if (
      row?.status === AccountStatus.DECEASED_CLOSED ||
      row?.status === AccountStatus.DUPLICATE_CLOSED ||
      row?.status === AccountStatus.TEST_ACCOUNT_RETIRED
    ) {
      throw new ConflictException('The account that stays has itself been closed');
    }
  }

  private async findReceiver(
    manager: EntityManager,
    found: AccountClosure,
    value: string,
  ): Promise<User> {
    const userId = await this.findUserId(manager, found.organizationId ?? null, value);
    const receiver = userId && (await manager.findOne(User, { where: { id: userId } }));
    if (!receiver)
      throw new NotFoundException('No account has that number. They need to join first.');
    return receiver;
  }

  /** A phone number reaches anyone. A member number means someone in this community. */
  private async findUserId(
    manager: EntityManager,
    orgId: string | null,
    raw: string,
  ): Promise<string | null> {
    const value = raw.trim();
    let phone: string | null = null;
    try {
      phone = normalizeToE164(value);
    } catch {
      // Not a phone number, so it can only be a member number.
    }
    const [row]: { id: string }[] = await manager.query(
      `SELECT u.id FROM users u
       WHERE u.phone_e164 = $1
          OR EXISTS (SELECT 1 FROM organization_memberships m
            WHERE m.user_id = u.id AND m.organization_id = $2
              AND upper(m.membership_number) = upper($3))
       LIMIT 1`,
      [phone, orgId, value],
    );
    return row?.id ?? null;
  }

  private async assertReceiver(
    manager: EntityManager,
    found: AccountClosure,
    receiver: User,
    actorId: string,
  ): Promise<void> {
    if (receiver.id === found.subjectUserId) {
      throw new BadRequestException('Credits cannot go back to this account');
    }
    if (receiver.id === actorId) {
      throw new ForbiddenException('You cannot act on credits coming to you');
    }
    if (receiver.status !== AccountStatus.ACTIVE) {
      throw new ConflictException('That account is not active');
    }
    const [identity]: { verification_status: string }[] = await manager.query(
      'SELECT verification_status FROM verified_identities WHERE user_id = $1',
      [receiver.id],
    );
    if (identity?.verification_status !== IdentityVerificationStatus.VERIFIED) {
      throw new ConflictException('Check their ID first: the nominee must be verified');
    }
  }

  /** Counts and balances only, so staff can compare two accounts without reading anyone's visits. */
  private async accountReview(manager: EntityManager, label: string, userId: string) {
    const [row]: Record<string, string | null>[] = await manager.query(
      `SELECT u.status, u.full_name, u.phone_e164, w.balance_credits, w.frozen_credits,
         w.status AS wallet_status, v.verification_status, u.created_at,
         (SELECT count(*) FROM organization_memberships m WHERE m.user_id = u.id) AS memberships,
         (SELECT count(*) FROM time_credit_ledger l WHERE l.wallet_id = w.id) AS credit_entries,
         (SELECT count(*) FROM volunteer_assignments a
            JOIN organization_memberships m ON m.id = a.volunteer_membership_id
            WHERE m.user_id = u.id AND a.status = 'COMPLETED') AS visits_given,
         (SELECT count(*) FROM service_requests r
            JOIN organization_memberships m ON m.id = r.beneficiary_membership_id
            WHERE m.user_id = u.id) AS requests_made,
         (SELECT count(*) FROM service_requests r
            JOIN organization_memberships m ON m.id = r.beneficiary_membership_id
            WHERE m.user_id = u.id
              AND r.status NOT IN ('COMPLETED', 'CANCELLED', 'EXPIRED_UNMATCHED')) AS open_requests
       FROM users u
       LEFT JOIN universal_time_wallets w ON w.user_id = u.id
       LEFT JOIN verified_identities v ON v.user_id = u.id
       WHERE u.id = $1`,
      [userId],
    );
    return {
      label,
      name: row?.['full_name'] ?? null,
      phone: row?.['phone_e164'] ?? null,
      status: row?.['status'] ?? null,
      joined: row?.['created_at'] ?? null,
      verification: row?.['verification_status'] ?? null,
      balance: Number(row?.['balance_credits'] ?? 0),
      frozen: Number(row?.['frozen_credits'] ?? 0),
      walletStatus: row?.['wallet_status'] ?? null,
      memberships: Number(row?.['memberships'] ?? 0),
      creditEntries: Number(row?.['credit_entries'] ?? 0),
      visitsGiven: Number(row?.['visits_given'] ?? 0),
      requestsMade: Number(row?.['requests_made'] ?? 0),
      openRequests: Number(row?.['open_requests'] ?? 0),
    };
  }

  /** Administrators here, less anyone involved. With nobody left, a Super Admin is told. */
  private async notifyDeciders(
    manager: EntityManager,
    found: AccountClosure,
    notice: { type: string; title: string; body: string },
    exceptUserIds: string[] = [],
  ): Promise<void> {
    const excluded = new Set([found.subjectUserId, found.reportedByUserId, ...exceptUserIds]);
    const local: { user_id: string }[] =
      found.level === ComplaintLevel.SUPER_ADMIN || found.needsSuperAdmin || !found.organizationId
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

  private async tellReporter(manager: EntityManager, found: AccountClosure): Promise<void> {
    await this.notifications.notifyUsers(manager, [found.reportedByUserId], {
      organizationId: found.organizationId ?? null,
      type: 'CLOSURE_DECIDED',
      title: 'A report you made was decided',
      body: 'Open the admin panel.',
    });
  }

  /** Never the reason, the evidence, or a nominee's name or phone. */
  private async audit(
    manager: EntityManager,
    eventType: string,
    actorId: string,
    found: AccountClosure,
    ipAddress: string | undefined,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.logEvent(
      {
        eventType,
        actorId,
        targetId: found.id,
        targetType: 'account_closures',
        organizationId: found.organizationId ?? null,
        payload: { userId: found.subjectUserId, ...payload },
        ipAddress: ipAddress ?? null,
      },
      manager,
    );
  }
}

function clearRecommendation(found: AccountClosure): void {
  found.receiverUserId = null;
  found.receiver = null;
  found.transferRecommendedByUserId = null;
  found.transferRecommendedAt = null;
}

function summary(found: AccountClosure, appeal?: Appeal | null) {
  return {
    id: found.id,
    reference: found.reference,
    kind: found.kind,
    organizationId: found.organizationId ?? null,
    organizationName: found.organization?.name ?? null,
    subjectName: found.subject?.fullName ?? null,
    subjectMemberNumber: found.subjectMembership?.membershipNumber ?? null,
    subjectPhone: found.subject?.phoneE164 ?? null,
    level: found.level,
    needsSuperAdmin: found.needsSuperAdmin,
    status: found.status,
    nomineeUnderReview: found.nomineeUnderReview,
    transferWaiting: Boolean(found.transferRecommendedByUserId),
    transferredCredits: Number(found.transferredCredits ?? 0),
    appealStatus: appeal?.status ?? null,
    createdAt: found.createdAt,
    decidedAt: found.decidedAt ?? null,
  };
}
