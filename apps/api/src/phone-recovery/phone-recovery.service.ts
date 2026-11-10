import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  AccountStatus,
  ClosureStatus,
  ComplaintLevel,
  PhoneRecoveryDocumentResult,
  PhoneRecoveryEventType,
  PhoneRecoveryStatus,
  UserRole,
} from '@ktb/shared-types';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { FirebaseTokenService } from '../auth/firebase-token.service';
import { normalizeToE164 } from '../auth/utils/phone.util';
import { EvaluatedMembershipContext } from '../authorization/authorization.service';
import { AccountClosure } from '../closures/entities/account-closure.entity';
import { levelsFor } from '../complaints/complaints.service';
import { User } from '../identity/entities/user.entity';
import { DocumentVerifiesAnotherAccount, PeopleService } from '../identity/people.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CaseNoteDto } from '../restrictions/dto/restriction.dto';
import { holdsSuperAdmin } from '../restrictions/platform-restriction';
import {
  levelForRoles,
  newRestrictionReference,
  RestrictionsService,
} from '../restrictions/restrictions.service';
import { ConfirmPhoneRecoveryDto, OpenPhoneRecoveryDto } from './dto/phone-recovery.dto';
import { PhoneRecoveryCase } from './entities/phone-recovery-case.entity';
import { PhoneRecoveryEvent } from './entities/phone-recovery-event.entity';
import { isNumberHeld, lockNumber, NUMBER_HOLD_DAYS } from './phone-history';

const LIST_LIMIT = 100;
const OPEN = [PhoneRecoveryStatus.OPENED, PhoneRecoveryStatus.CONFIRMED];
const DAY_MS = 24 * 60 * 60 * 1000;

/** The account, if any, already on a number someone wants to move to. */
export type NewNumberAccount = 'NONE' | 'EMPTY' | 'WAITING_APPLICATION' | 'IN_USE';

/**
 * Moving an account to a new phone number after a lost phone or SIM (FR-IDENT-05, D#43). A
 * coordinator checks the person's ID, the new number proves itself with a fresh code, and someone
 * above decides. Nothing about the account changes until then, so one wrong report cannot lock
 * anyone out. The account, wallet, memberships and history all stay, because only the number moves.
 *
 * Signing in with a new SIM makes an empty account by itself, so the new number usually has one
 * already. An empty one is retired by the move. Anything real is refused: one number, one account,
 * and nothing is ever merged (D#88).
 */
@Injectable()
export class PhoneRecoveryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly auditService: AuditService,
    private readonly restrictions: RestrictionsService,
    private readonly people: PeopleService,
    private readonly auth: AuthService,
    private readonly firebase: FirebaseTokenService,
  ) {}

  async open(
    orgId: string,
    context: EvaluatedMembershipContext,
    dto: OpenPhoneRecoveryDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    if (levelsFor(context).length === 0) {
      throw new ForbiddenException('Coordinator authority required');
    }
    const actorId = context.userId;
    const newPhone = cleanPhone(dto.newPhone);
    try {
      return await this.dataSource.transaction('READ COMMITTED', async (manager) => {
        if (dto.clientOperationId) {
          const earlier = await manager.findOne(PhoneRecoveryCase, {
            where: { openedByUserId: actorId, clientOperationId: dto.clientOperationId },
          });
          if (earlier) return summary(earlier);
        }
        const member = await this.restrictions.findMember(manager, orgId, dto.member);
        if (member.userId === actorId) {
          throw new ForbiddenException('Someone else must open a case for your own number');
        }
        await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
          `phone-recovery:${member.userId}`,
        ]);
        const user = await manager.findOne(User, { where: { id: member.userId } });
        if (!user) throw new NotFoundException('Person not found');
        const level = levelForRoles(await this.restrictions.activeRoles(manager, user.id));
        if (!levelsFor(context).includes(level)) {
          throw new ForbiddenException('Someone at a higher level must open this');
        }
        await this.assertAccountCanMove(manager, user);
        if (newPhone === user.phoneE164) {
          throw new BadRequestException('That is already the number on this account');
        }
        await this.assertNumberCanTakeAccount(manager, newPhone, now);
        if (
          await manager.exists(PhoneRecoveryCase, {
            where: [
              { subjectUserId: user.id, status: In(OPEN) },
              { newPhone, status: In(OPEN) },
            ],
          })
        ) {
          throw new ConflictException('A case for this person or this number is already open');
        }

        const document = await this.people.compareDocument(
          manager,
          user.id,
          dto.documentType,
          dto.documentNumber,
        );
        const communities: { count: string }[] = await manager.query(
          `SELECT count(*) FROM organization_memberships
           WHERE user_id = $1 AND status IN ('APPROVED', 'SUSPENDED')`,
          [user.id],
        );
        const created = await manager.save(
          PhoneRecoveryCase,
          manager.create(PhoneRecoveryCase, {
            reference: newRestrictionReference('PHN', now),
            organizationId: orgId,
            subjectUserId: user.id,
            subjectMembershipId: member.id,
            oldPhone: user.phoneE164,
            newPhone,
            level,
            needsSuperAdmin:
              Number(communities[0]?.count ?? 0) > 1 ||
              document.result !== PhoneRecoveryDocumentResult.MATCHED,
            status: PhoneRecoveryStatus.OPENED,
            documentType: document.documentType,
            documentLast4: document.last4,
            documentResult: document.result,
            reason: dto.reason.trim(),
            openedByUserId: actorId,
            clientOperationId: dto.clientOperationId ?? null,
          }),
        );
        await this.addEvent(manager, created.id, actorId, PhoneRecoveryEventType.OPENED);
        // To the old phones, in case this is not what the person wants. No number and no reason.
        await this.notifications.notifyUsers(manager, [user.id], {
          organizationId: orgId,
          type: 'PHONE_RECOVERY_OPENED',
          title: 'A request to change your phone number',
          body: 'If this was not you, call your community coordinator.',
        });
        await this.audit(manager, 'PHONE_RECOVERY_OPENED', actorId, created, ipAddress, {});
        return summary(created);
      });
    } catch (error) {
      if (error instanceof DocumentVerifiesAnotherAccount) {
        await this.auditService.logEvent({
          eventType: 'PHONE_RECOVERY_DOCUMENT_REFUSED',
          actorId,
          targetType: 'phone_recovery_cases',
          organizationId: orgId,
          ipAddress: ipAddress ?? null,
          payload: { documentType: dto.documentType },
        });
      }
      throw conflictOnDuplicate(error);
    }
  }

  async list(orgId: string | null, context: EvaluatedMembershipContext, open: boolean) {
    const levels = levelsFor(context);
    if (levels.length === 0) throw new ForbiddenException('Coordinator authority required');
    const found = await this.dataSource.getRepository(PhoneRecoveryCase).find({
      where: {
        level: In(levels),
        ...(orgId ? { organizationId: orgId } : {}),
        ...(open ? { status: In(OPEN) } : {}),
      },
      relations: ['organization', 'subject', 'subjectMembership'],
      order: { createdAt: 'DESC' },
      take: LIST_LIMIT,
    });
    return found.filter((item) => item.subjectUserId !== context.userId).map((item) => summary(item));
  }

  async detail(orgId: string | null, caseId: string, context: EvaluatedMembershipContext) {
    const manager = this.dataSource.manager;
    const found = await manager.findOne(PhoneRecoveryCase, {
      where: { id: caseId, ...(orgId ? { organizationId: orgId } : {}) },
      relations: ['organization', 'subject', 'subjectMembership', 'openedBy', 'decidedBy'],
    });
    if (!found) throw new NotFoundException('Case not found');
    this.assertCanRead(found, context);
    const [events, nominee] = await Promise.all([
      manager.find(PhoneRecoveryEvent, {
        where: { caseId: found.id },
        relations: ['actor'],
        order: { createdAt: 'ASC' },
      }),
      manager.query(
        `SELECT 1 FROM death_nominees WHERE user_id = $1 AND replaced_at IS NULL AND nominee_phone = $2`,
        [found.subjectUserId, found.newPhone],
      ) as Promise<unknown[]>,
    ]);
    const isOpen = OPEN.includes(found.status);
    return {
      ...summary(found),
      oldPhone: found.oldPhone,
      newPhone: found.newPhone,
      documentType: found.documentType,
      documentLast4: found.documentLast4,
      documentResult: found.documentResult,
      reason: found.reason,
      openedByName: found.openedBy?.fullName ?? null,
      decidedByName: found.decidedBy?.fullName ?? null,
      confirmedAt: found.confirmedAt ?? null,
      reversedAt: found.reversedAt ?? null,
      // What the decider needs to know, worked out now because it can change while a case waits.
      newNumberAccount: isOpen ? (await this.accountOnNumber(manager, found.newPhone)).kind : null,
      newNumberIsNominee: isOpen ? nominee.length > 0 : false,
      nomineeEnded: found.nomineeEnded,
      canReverse: this.reversible(found, new Date()),
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
    dto: CaseNoteDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    try {
      return await this.act(orgId, caseId, context, async (manager, found) => {
        if (found.status === PhoneRecoveryStatus.OPENED) {
          throw new ConflictException('The new number has not confirmed yet');
        }
        if (found.status !== PhoneRecoveryStatus.CONFIRMED) {
          throw new ConflictException('This case has already been decided');
        }
        this.assertCanDecide(found, context);
        if (
          found.openedByUserId === context.userId &&
          !(await this.noOtherSuperAdmin(manager, found, context.userId))
        ) {
          throw new ForbiddenException('You opened this, so someone else must decide it');
        }
        // Sign-in holds these while it looks a number up, so it sees either the old state or the
        // new one, never a session for the wrong account. Sorted, so two moves cannot deadlock.
        for (const phone of [found.oldPhone, found.newPhone].sort()) {
          await lockNumber(manager, phone);
        }
        const user = await manager.findOne(User, {
          where: { id: found.subjectUserId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) throw new NotFoundException('Person not found');
        await this.assertAccountCanMove(manager, user);
        if (user.phoneE164 !== found.oldPhone) {
          throw new ConflictException('The number on this account has changed since this case opened');
        }
        await this.assertNumberCanTakeAccount(manager, found.newPhone, now);
        const onNumber = await this.accountOnNumber(manager, found.newPhone);
        if (onNumber.userId) await this.retirePlaceholder(manager, onNumber.userId);

        const ended: { id: string }[][] = await manager.query(
          `UPDATE death_nominees SET replaced_at = now()
           WHERE user_id = $1 AND replaced_at IS NULL AND nominee_phone = $2 RETURNING id`,
          [user.id, found.newPhone],
        );
        const endedNominee = ended[0]?.[0]?.id ?? null;
        if (endedNominee) {
          await this.auditService.logEvent(
            {
              eventType: 'NOMINEE_REMOVED',
              actorId: context.userId,
              targetId: endedNominee,
              targetType: 'death_nominees',
              organizationId: null,
              payload: { because: 'PHONE_RECOVERY' },
              ipAddress: ipAddress ?? null,
            },
            manager,
          );
        }

        await manager.query(
          'UPDATE users SET phone_e164 = $2, updated_at = now() WHERE id = $1',
          [user.id, found.newPhone],
        );
        await this.stopAccess(manager, user.id);

        found.status = PhoneRecoveryStatus.COMPLETED;
        found.decidedByUserId = context.userId;
        found.decidedAt = now;
        found.retiredUserId = onNumber.userId;
        found.nomineeEnded = Boolean(endedNominee);
        await manager.save(PhoneRecoveryCase, found);
        await this.addEvent(manager, found.id, context.userId, PhoneRecoveryEventType.APPROVED, dto.notes);
        await this.tellOpener(manager, found);
        await this.audit(manager, 'PHONE_RECOVERY_COMPLETED', context.userId, found, ipAddress, {
          retiredEmptyAccount: Boolean(onNumber.userId),
          nomineeEnded: Boolean(endedNominee),
        });
        return summary(found);
      });
    } catch (error) {
      throw conflictOnDuplicate(error);
    }
  }

  async refuse(
    orgId: string | null,
    caseId: string,
    context: EvaluatedMembershipContext,
    dto: CaseNoteDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.act(orgId, caseId, context, async (manager, found) => {
      assertOpen(found);
      this.assertCanDecide(found, context);
      found.status = PhoneRecoveryStatus.REFUSED;
      found.decidedByUserId = context.userId;
      found.decidedAt = now;
      await manager.save(PhoneRecoveryCase, found);
      await this.addEvent(manager, found.id, context.userId, PhoneRecoveryEventType.REFUSED, dto.notes);
      await this.tellOpener(manager, found);
      await this.audit(manager, 'PHONE_RECOVERY_REFUSED', context.userId, found, ipAddress, {});
      return summary(found);
    });
  }

  /** Whoever opened it, or anyone who could decide it, can drop it: a typo, or a phone found again. */
  async withdraw(
    orgId: string | null,
    caseId: string,
    context: EvaluatedMembershipContext,
    dto: CaseNoteDto,
    ipAddress?: string,
  ) {
    return this.act(orgId, caseId, context, async (manager, found) => {
      assertOpen(found);
      if (found.openedByUserId !== context.userId) this.assertCanDecide(found, context);
      found.status = PhoneRecoveryStatus.WITHDRAWN;
      await manager.save(PhoneRecoveryCase, found);
      await this.addEvent(manager, found.id, context.userId, PhoneRecoveryEventType.WITHDRAWN, dto.notes);
      await this.audit(manager, 'PHONE_RECOVERY_WITHDRAWN', context.userId, found, ipAddress, {});
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
      await this.addEvent(manager, found.id, context.userId, PhoneRecoveryEventType.NOTE, dto.notes);
      await this.audit(manager, 'PHONE_RECOVERY_NOTE_ADDED', context.userId, found, ipAddress, {});
      return summary(found);
    });
  }

  /**
   * A move that was wrong, while the old number is still held for it. Credits spent in between are
   * corrected by hand with the existing credit tools, as with a closure. The empty account stays
   * retired: whoever holds that number gets a new one if they sign in.
   */
  async reverse(
    orgId: string | null,
    caseId: string,
    context: EvaluatedMembershipContext,
    dto: CaseNoteDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    if (!context.isSuperAdmin) throw new ForbiddenException('A Super Admin must undo a move');
    try {
      return await this.act(orgId, caseId, context, async (manager, found) => {
        if (!this.reversible(found, now)) {
          throw new ConflictException('This move can no longer be undone');
        }
        if (
          found.decidedByUserId === context.userId &&
          !(await this.noOtherSuperAdmin(manager, found, context.userId))
        ) {
          throw new ForbiddenException('You approved this, so someone else must undo it');
        }
        for (const phone of [found.oldPhone, found.newPhone].sort()) {
          await lockNumber(manager, phone);
        }
        const user = await manager.findOne(User, {
          where: { id: found.subjectUserId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user) throw new NotFoundException('Person not found');
        await this.assertAccountCanMove(manager, user);
        if (user.phoneE164 !== found.newPhone) {
          throw new ConflictException('This account has moved again. Undo the later move first.');
        }
        const taken = await manager.exists(User, { where: { phoneE164: found.oldPhone } });
        if (taken) throw new ConflictException('Another account now has the old number');

        await manager.query('UPDATE users SET phone_e164 = $2, updated_at = now() WHERE id = $1', [
          user.id,
          found.oldPhone,
        ]);
        await this.stopAccess(manager, user.id);
        found.status = PhoneRecoveryStatus.REVERSED;
        found.reversedByUserId = context.userId;
        found.reversedAt = now;
        await manager.save(PhoneRecoveryCase, found);
        await this.addEvent(manager, found.id, context.userId, PhoneRecoveryEventType.REVERSED, dto.notes);
        await this.tellOpener(manager, found);
        await this.audit(manager, 'PHONE_RECOVERY_REVERSED', context.userId, found, ipAddress, {});
        return summary(found);
      });
    } catch (error) {
      throw conflictOnDuplicate(error);
    }
  }

  // ─── The person holding the new number ─────────────────────────────────────

  /**
   * Shows nothing about the account being moved: a mistyped number could belong to a stranger. The
   * reference is what the coordinator reads out, so the right person knows it is their case.
   */
  async mine(userId: string) {
    const manager = this.dataSource.manager;
    const user = await manager.findOne(User, { where: { id: userId } });
    if (!user) throw new NotFoundException('Person not found');
    const pending = await manager.findOne(PhoneRecoveryCase, {
      where: { newPhone: user.phoneE164, status: In(OPEN) },
      relations: ['organization'],
    });
    const nomineeGone: unknown[] = await manager.query(
      `SELECT 1 FROM phone_recovery_cases c
       WHERE c.subject_user_id = $1 AND c.status = 'COMPLETED' AND c.nominee_ended
         AND NOT EXISTS (SELECT 1 FROM death_nominees n
           WHERE n.user_id = c.subject_user_id AND n.replaced_at IS NULL)
       LIMIT 1`,
      [userId],
    );
    return {
      pending: pending
        ? {
            id: pending.id,
            reference: pending.reference,
            communityName: pending.organization?.name ?? null,
            status: pending.status,
          }
        : null,
      nameNomineeAgain: nomineeGone.length > 0,
    };
  }

  async confirm(userId: string, caseId: string, dto: ConfirmPhoneRecoveryDto, ipAddress?: string, now = new Date()) {
    const user = await this.activeUser(userId);
    const waiting = await this.dataSource.manager.findOne(PhoneRecoveryCase, {
      where: { id: caseId, newPhone: user.phoneE164 },
    });
    if (!waiting || !OPEN.includes(waiting.status)) throw new NotFoundException('Case not found');
    if (waiting.status === PhoneRecoveryStatus.CONFIRMED) return { status: waiting.status };
    await this.confirmNewNumber(user, dto);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const found = await this.lockForHolder(manager, caseId, user);
      if (found.status === PhoneRecoveryStatus.CONFIRMED) return { status: found.status };
      found.status = PhoneRecoveryStatus.CONFIRMED;
      found.confirmedAt = now;
      await manager.save(PhoneRecoveryCase, found);
      await this.addEvent(manager, found.id, user.id, PhoneRecoveryEventType.CONFIRMED);
      await this.notifyDeciders(manager, found);
      await this.audit(manager, 'PHONE_RECOVERY_CONFIRMED', user.id, found, ipAddress, {});
      return { status: found.status };
    });
  }

  /** "This is not me". Ends the case, and tells whoever opened it. */
  async decline(userId: string, caseId: string, ipAddress?: string, now = new Date()) {
    const user = await this.activeUser(userId);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const found = await this.lockForHolder(manager, caseId, user);
      found.status = PhoneRecoveryStatus.REFUSED;
      found.decidedAt = now;
      await manager.save(PhoneRecoveryCase, found);
      await this.addEvent(manager, found.id, user.id, PhoneRecoveryEventType.DECLINED);
      await this.tellOpener(manager, found);
      await this.audit(manager, 'PHONE_RECOVERY_DECLINED', user.id, found, ipAddress, {});
      return { status: found.status };
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async activeUser(userId: string): Promise<User> {
    const user = await this.dataSource.manager.findOne(User, { where: { id: userId } });
    if (!user) throw new NotFoundException('Person not found');
    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('This account is restricted');
    }
    return user;
  }

  private async lockForHolder(
    manager: EntityManager,
    caseId: string,
    user: User,
  ): Promise<PhoneRecoveryCase> {
    const found = await manager.findOne(PhoneRecoveryCase, {
      where: { id: caseId, newPhone: user.phoneE164 },
      lock: { mode: 'pessimistic_write' },
    });
    if (!found || !OPEN.includes(found.status)) throw new NotFoundException('Case not found');
    return found;
  }

  /** A wrong code is a 400, not a 401: the app would treat a 401 as being signed out. */
  private async confirmNewNumber(user: User, proof: ConfirmPhoneRecoveryDto): Promise<void> {
    if (proof.idToken) {
      const phone = await this.firebase.verifyPhoneToken(proof.idToken);
      if (normalizeToE164(phone) !== user.phoneE164) {
        throw new ForbiddenException('Confirm with the new phone');
      }
      return;
    }
    if (!proof.code) throw new BadRequestException('Confirm with a code sent to this phone');
    if (!(await this.auth.confirmOwnPhoneCode(user.phoneE164, proof.code))) {
      throw new BadRequestException('That code is not right');
    }
  }

  /** The same 404 as for a case that does not exist. Nobody reads their own. */
  private assertCanRead(found: PhoneRecoveryCase, context: EvaluatedMembershipContext): void {
    if (!levelsFor(context).includes(found.level) || found.subjectUserId === context.userId) {
      throw new NotFoundException('Case not found');
    }
  }

  private assertCanDecide(found: PhoneRecoveryCase, context: EvaluatedMembershipContext): void {
    if (context.isSuperAdmin) return;
    if (found.needsSuperAdmin) throw new ForbiddenException('A Super Admin must decide this');
    if (
      found.level === ComplaintLevel.SUPER_ADMIN ||
      !context.roles.includes(UserRole.MUNICIPALITY_ADMIN)
    ) {
      throw new ForbiddenException('A Municipality Admin must decide this');
    }
  }

  /**
   * A Super Admin's own phone, with nobody else left to decide. Without this, losing a phone with
   * only two Super Admins could never be put right. The same record and audit follow.
   */
  private async noOtherSuperAdmin(
    manager: EntityManager,
    found: PhoneRecoveryCase,
    actorId: string,
  ): Promise<boolean> {
    if (!(await holdsSuperAdmin(manager, found.subjectUserId))) return false;
    const others: unknown[] = await manager.query(
      `SELECT 1 FROM organization_memberships m
       JOIN membership_role_grants g ON g.membership_id = m.id
       JOIN users u ON u.id = m.user_id
       WHERE m.status = 'APPROVED' AND g.status = 'ACTIVE' AND g.role = 'SUPER_ADMIN'
         AND u.status = 'ACTIVE' AND m.user_id <> ALL($1)
       LIMIT 1`,
      [[found.subjectUserId, actorId]],
    );
    return others.length === 0;
  }

  /** Closed accounts are refused; a restricted one moves and stays restricted. */
  private async assertAccountCanMove(manager: EntityManager, user: User): Promise<void> {
    if (
      ![AccountStatus.ACTIVE, AccountStatus.SUSPENDED, AccountStatus.PERMANENTLY_BANNED].includes(
        user.status,
      )
    ) {
      throw new ConflictException('This account is closed');
    }
    if (
      await manager.exists(AccountClosure, {
        where: { subjectUserId: user.id, status: ClosureStatus.REPORTED },
      })
    ) {
      throw new ConflictException('A closure has been reported for this account. Decide that first.');
    }
  }

  private async assertNumberCanTakeAccount(
    manager: EntityManager,
    phone: string,
    now: Date,
  ): Promise<void> {
    if (await isNumberHeld(manager, phone, now)) {
      throw new ConflictException(
        `An account moved off this number recently, so it is held for ${NUMBER_HOLD_DAYS} days. ` +
          'To move an account back, a Super Admin can undo that move.',
      );
    }
    const { kind } = await this.accountOnNumber(manager, phone);
    if (kind === 'WAITING_APPLICATION') {
      throw new ConflictException(
        'This number has a waiting membership application. Reject it first, then try again.',
      );
    }
    if (kind === 'IN_USE') {
      throw new ConflictException(
        'This number has its own account. One number can only hold one account. If both are the ' +
          'same person, decide which to keep under Account closures.',
      );
    }
  }

  /** Empty means nothing would be lost: no standing, no credits or coins, no history, no document. */
  private async accountOnNumber(
    manager: EntityManager,
    phone: string,
  ): Promise<{ kind: NewNumberAccount; userId: string | null }> {
    const [row]: {
      id: string;
      status: string;
      email: string | null;
      fingerprint: string | null;
      verification: string | null;
      balance: string | null;
      frozen: string | null;
      waiting: boolean;
      standing: boolean;
      history: boolean;
    }[] = await manager.query(
      `SELECT u.id, u.status, u.email, v.document_fingerprint AS fingerprint,
         v.verification_status AS verification,
         w.balance_credits AS balance, w.frozen_credits AS frozen,
         EXISTS (SELECT 1 FROM organization_memberships m
           WHERE m.user_id = u.id AND m.status IN ('APPLIED', 'PENDING_REVIEW')) AS waiting,
         EXISTS (SELECT 1 FROM organization_memberships m
           WHERE m.user_id = u.id AND m.status NOT IN ('APPLIED', 'PENDING_REVIEW', 'REJECTED')) AS standing,
         (EXISTS (SELECT 1 FROM time_credit_ledger l WHERE l.wallet_id = w.id)
           OR EXISTS (SELECT 1 FROM global_account_restrictions r WHERE r.user_id = u.id)
           OR EXISTS (SELECT 1 FROM death_nominees n WHERE n.user_id = u.id)
           OR EXISTS (SELECT 1 FROM phone_recovery_cases c WHERE c.subject_user_id = u.id)
           OR EXISTS (SELECT 1 FROM loyalty_wallets lw
             WHERE lw.user_id = u.id AND (lw.balance_coins <> 0 OR lw.frozen_coins <> 0))
           OR EXISTS (SELECT 1 FROM loyalty_ledger ll WHERE ll.user_id = u.id)
           OR EXISTS (SELECT 1 FROM loyalty_redemptions lr WHERE lr.user_id = u.id)
           OR EXISTS (SELECT 1 FROM loyalty_service_awards la WHERE la.user_id = u.id)
           OR EXISTS (SELECT 1 FROM loyalty_engagement_awards le WHERE le.user_id = u.id)
           OR EXISTS (SELECT 1 FROM organization_merchants om WHERE om.owner_user_id = u.id)
           OR EXISTS (SELECT 1 FROM account_closures a
             WHERE u.id IN (a.subject_user_id, a.primary_user_id, a.receiver_user_id))) AS history
       FROM users u
       LEFT JOIN universal_time_wallets w ON w.user_id = u.id
       LEFT JOIN verified_identities v ON v.user_id = u.id
       WHERE u.phone_e164 = $1`,
      [phone],
    );
    if (!row) return { kind: 'NONE', userId: null };
    const inUse =
      row.status !== AccountStatus.ACTIVE ||
      row.standing ||
      row.history ||
      Boolean(row.email) ||
      Boolean(row.fingerprint) ||
      row.verification === 'VERIFIED' ||
      Number(row.balance ?? 0) !== 0 ||
      Number(row.frozen ?? 0) !== 0;
    if (inUse) return { kind: 'IN_USE', userId: row.id };
    return row.waiting
      ? { kind: 'WAITING_APPLICATION', userId: row.id }
      : { kind: 'EMPTY', userId: row.id };
  }

  /** The row stays, so its history and foreign keys do. Same tombstone as a retired test account. */
  private async retirePlaceholder(manager: EntityManager, userId: string): Promise<void> {
    await this.stopAccess(manager, userId);
    await manager.query(
      `UPDATE universal_time_wallets SET status = 'CLOSED', updated_at = now() WHERE user_id = $1`,
      [userId],
    );
    await manager.query(
      `UPDATE loyalty_wallets SET status = 'CLOSED', leaderboard_opt_in = false, updated_at = now()
       WHERE user_id = $1`,
      [userId],
    );
    await manager.query(
      `UPDATE users SET status = $2, phone_e164 = 'retired-' || left(replace(id::text, '-', ''), 12),
         updated_at = now()
       WHERE id = $1`,
      [userId, AccountStatus.RECOVERY_PLACEHOLDER_RETIRED],
    );
  }

  /**
   * The phones signed in until now may be in someone else's hands. A merchant code waiting on one of
   * them could still be shown at a counter, so it is cancelled; no coins were taken for it yet.
   */
  private async stopAccess(manager: EntityManager, userId: string): Promise<void> {
    await manager.query(
      `UPDATE loyalty_redemptions SET status = 'CANCELLED' WHERE user_id = $1 AND status = 'PENDING'`,
      [userId],
    );
    await manager.query(
      `UPDATE authentication_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    await manager.query('DELETE FROM push_devices WHERE user_id = $1', [userId]);
    await manager.query(
      `UPDATE notification_outbox SET status = 'EXPIRED' WHERE user_id = $1 AND status = 'PENDING'`,
      [userId],
    );
  }

  private reversible(found: PhoneRecoveryCase, now: Date): boolean {
    return (
      found.status === PhoneRecoveryStatus.COMPLETED &&
      Boolean(found.decidedAt) &&
      now.getTime() - (found.decidedAt as Date).getTime() < NUMBER_HOLD_DAYS * DAY_MS
    );
  }

  private async act<T>(
    orgId: string | null,
    caseId: string,
    context: EvaluatedMembershipContext,
    work: (manager: EntityManager, found: PhoneRecoveryCase) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const found = await manager.findOne(PhoneRecoveryCase, {
        where: { id: caseId, ...(orgId ? { organizationId: orgId } : {}) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!found) throw new NotFoundException('Case not found');
      this.assertCanRead(found, context);
      return work(manager, found);
    });
  }

  private async addEvent(
    manager: EntityManager,
    caseId: string,
    actorUserId: string,
    type: PhoneRecoveryEventType,
    notes?: string,
  ): Promise<void> {
    await manager.insert(PhoneRecoveryEvent, {
      caseId,
      actorUserId,
      type,
      notes: notes?.trim() || null,
    });
  }

  /** Administrators here, less anyone involved. With nobody left, a Super Admin is told. */
  private async notifyDeciders(manager: EntityManager, found: PhoneRecoveryCase): Promise<void> {
    const excluded = new Set([found.subjectUserId, found.openedByUserId]);
    const local: { user_id: string }[] =
      found.level === ComplaintLevel.SUPER_ADMIN || found.needsSuperAdmin
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
      organizationId: found.organizationId,
      type: 'PHONE_RECOVERY_CONFIRMED',
      title: 'A phone number change needs your decision',
      body: 'Open the admin panel.',
    });
  }

  private async tellOpener(manager: EntityManager, found: PhoneRecoveryCase): Promise<void> {
    await this.notifications.notifyUsers(manager, [found.openedByUserId], {
      organizationId: found.organizationId,
      type: 'PHONE_RECOVERY_DECIDED',
      title: 'A phone number change you opened has moved on',
      body: 'Open the admin panel.',
    });
  }

  /** Last 4 digits only. Never the reason or anything about the document. */
  private async audit(
    manager: EntityManager,
    eventType: string,
    actorId: string,
    found: PhoneRecoveryCase,
    ipAddress: string | undefined,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.logEvent(
      {
        eventType,
        actorId,
        targetId: found.id,
        targetType: 'phone_recovery_cases',
        organizationId: found.organizationId,
        payload: {
          userId: found.subjectUserId,
          oldPhoneLast4: found.oldPhone.slice(-4),
          newPhoneLast4: found.newPhone.slice(-4),
          ...payload,
        },
        ipAddress: ipAddress ?? null,
      },
      manager,
    );
  }
}

function cleanPhone(raw: string): string {
  try {
    return normalizeToE164(raw);
  } catch {
    throw new BadRequestException('Enter the new mobile number in full');
  }
}

function assertOpen(found: PhoneRecoveryCase): void {
  if (!OPEN.includes(found.status)) {
    throw new ConflictException('This case has already been decided');
  }
}

/** Two people racing to the same number, caught by the database's unique indexes. */
function conflictOnDuplicate(error: unknown): unknown {
  if ((error as { code?: string }).code === '23505') {
    return new ConflictException('That number or person is already being moved');
  }
  return error;
}

function summary(found: PhoneRecoveryCase) {
  return {
    id: found.id,
    reference: found.reference,
    organizationId: found.organizationId,
    organizationName: found.organization?.name ?? null,
    subjectName: found.subject?.fullName ?? null,
    subjectMemberNumber: found.subjectMembership?.membershipNumber ?? null,
    oldPhoneLast4: found.oldPhone.slice(-4),
    newPhoneLast4: found.newPhone.slice(-4),
    level: found.level,
    needsSuperAdmin: found.needsSuperAdmin,
    status: found.status,
    documentResult: found.documentResult,
    createdAt: found.createdAt,
    decidedAt: found.decidedAt ?? null,
  };
}
