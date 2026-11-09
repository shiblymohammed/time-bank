import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DataSource, EntityManager, In, IsNull, MoreThan, Not } from 'typeorm';
import {
  AppealStatus,
  ComplaintEventType,
  ComplaintLevel,
  ComplaintStatus,
  ComplaintSubject,
  MembershipStatus,
  UserRole,
} from '@ktb/shared-types';
import { AuditService } from '../audit/audit.service';
import { EvaluatedMembershipContext } from '../authorization/authorization.service';
import { VolunteerAssignment } from '../matching/entities/volunteer-assignment.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ServiceRequest } from '../requests/entities/service-request.entity';
import { appealDeadline } from '../restrictions/appeal-window';
import { Appeal } from '../restrictions/entities/appeal.entity';
import { DecideComplaintDto, RaiseComplaintDto } from './dto/complaint.dto';
import { ComplaintEvent } from './entities/complaint-event.entity';
import { Complaint } from './entities/complaint.entity';

const LIST_LIMIT = 100;
const MEMBER_LIST_LIMIT = 50;
export const DAILY_COMPLAINT_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const LEVEL_FOR_SUBJECT: Record<ComplaintSubject, ComplaintLevel> = {
  [ComplaintSubject.SERVICE_OR_MEMBER]: ComplaintLevel.COORDINATOR,
  [ComplaintSubject.COORDINATOR]: ComplaintLevel.MUNICIPALITY_ADMIN,
  [ComplaintSubject.MUNICIPALITY_ADMIN]: ComplaintLevel.SUPER_ADMIN,
};

const NEXT_LEVEL: Partial<Record<ComplaintLevel, ComplaintLevel>> = {
  [ComplaintLevel.COORDINATOR]: ComplaintLevel.MUNICIPALITY_ADMIN,
  [ComplaintLevel.MUNICIPALITY_ADMIN]: ComplaintLevel.SUPER_ADMIN,
};

/** Who hears an appeal against a decision at this level. A Super Admin's is final. */
export function nextComplaintLevel(level: ComplaintLevel): ComplaintLevel | undefined {
  return NEXT_LEVEL[level];
}

/** Levels this person can read and act on. Each level sees those below it, never above. */
export function levelsFor(context: EvaluatedMembershipContext): ComplaintLevel[] {
  if (context.isSuperAdmin) return Object.values(ComplaintLevel);
  if (context.roles.includes(UserRole.MUNICIPALITY_ADMIN)) {
    return [ComplaintLevel.COORDINATOR, ComplaintLevel.MUNICIPALITY_ADMIN];
  }
  if (context.roles.includes(UserRole.COORDINATOR)) return [ComplaintLevel.COORDINATOR];
  return [];
}

/**
 * Confidential complaints (FR-SAFE-03, D#28, D#75, D#76). The subject decides the level, so the
 * accused's whole tier is out of reach without anyone being named. Nobody handles a complaint they
 * raised, or one about a visit they were part of.
 *
 * Anyone who cannot read a complaint gets the same 404 as for one that does not exist. Lists carry
 * no words or names, and push text stays generic because it shows on locked screens.
 */
@Injectable()
export class ComplaintsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly auditService: AuditService,
  ) {}

  async raise(
    orgId: string,
    context: EvaluatedMembershipContext,
    dto: RaiseComplaintDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    const userId = context.userId;
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // One at a time per person, so the daily limit and a retry cannot race.
      await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `complaints:${userId}`,
      ]);
      if (dto.clientOperationId) {
        const earlier = await manager.findOne(Complaint, {
          where: { raisedByUserId: userId, clientOperationId: dto.clientOperationId },
        });
        if (earlier) return memberView(earlier, []);
      }
      // A Super Admin passes the access check everywhere, but only members complain.
      const member = await manager.findOne(OrganizationMembership, {
        where: { organizationId: orgId, userId, status: MembershipStatus.APPROVED },
      });
      if (!member) throw new ForbiddenException('Only a member of this community can complain');

      const recent = await manager.count(Complaint, {
        where: { raisedByUserId: userId, createdAt: MoreThan(new Date(now.getTime() - DAY_MS)) },
      });
      if (recent >= DAILY_COMPLAINT_LIMIT) {
        throw new HttpException(
          'You have made several complaints today. Please call your coordinator, or try again tomorrow.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (dto.serviceRequestId) {
        await this.assertOnVisit(manager, orgId, dto.serviceRequestId, member.id, userId);
      }

      const complaint = await manager.save(
        Complaint,
        manager.create(Complaint, {
          organizationId: orgId,
          reference: newReference(now),
          raisedByUserId: userId,
          subject: dto.subject,
          level: LEVEL_FOR_SUBJECT[dto.subject],
          status: ComplaintStatus.OPEN,
          description: dto.description.trim(),
          serviceRequestId: dto.serviceRequestId ?? null,
          clientOperationId: dto.clientOperationId ?? null,
        }),
      );
      await this.addEvent(manager, complaint, userId, ComplaintEventType.RAISED);
      await this.notifyHandlers(manager, complaint);
      await this.audit(manager, 'COMPLAINT_RAISED', userId, complaint, ipAddress, {
        subject: complaint.subject,
        level: complaint.level,
      });
      return memberView(complaint, []);
    });
  }

  async listMine(orgId: string, userId: string, now = new Date()) {
    const complaints = await this.dataSource.getRepository(Complaint).find({
      where: { organizationId: orgId, raisedByUserId: userId },
      relations: ['serviceRequest'],
      order: { createdAt: 'DESC' },
      take: MEMBER_LIST_LIMIT,
    });
    const appeals = await this.dataSource.getRepository(Appeal).find({
      where: { complaintId: In(complaints.map((complaint) => complaint.id)) },
      order: { createdAt: 'ASC' },
    });
    return complaints.map((complaint) =>
      memberView(
        complaint,
        appeals.filter((appeal) => appeal.complaintId === complaint.id),
        now,
      ),
    );
  }

  /** Whether this person could handle the complaint: at its level, and not part of it. */
  async canHandle(
    manager: EntityManager,
    complaintId: string,
    context: EvaluatedMembershipContext,
  ): Promise<boolean> {
    const complaint = await manager.findOne(Complaint, { where: { id: complaintId } });
    if (!complaint) return false;
    try {
      await this.assertHandler(manager, complaint, context);
      return true;
    } catch (error) {
      if (error instanceof NotFoundException) return false;
      throw error;
    }
  }

  async addAppealEvent(
    manager: EntityManager,
    complaintId: string,
    actorUserId: string,
    type: ComplaintEventType.APPEALED | ComplaintEventType.APPEAL_DECIDED,
    notes?: string,
  ): Promise<void> {
    await manager.insert(ComplaintEvent, {
      complaintId,
      actorUserId,
      type,
      notes: notes?.trim() || null,
    });
  }

  async listForStaff(orgId: string, context: EvaluatedMembershipContext, open: boolean) {
    const levels = levelsFor(context);
    if (levels.length === 0) throw new ForbiddenException('Coordinator authority required');
    return this.summaries(context.userId, levels, open, orgId);
  }

  /** A Super Admin's view across every community. The route is limited to Super Admins. */
  async listEverywhere(userId: string, open: boolean) {
    return this.summaries(userId, Object.values(ComplaintLevel), open);
  }

  async detail(
    orgId: string,
    complaintId: string,
    context: EvaluatedMembershipContext,
    ipAddress?: string,
  ) {
    const manager = this.dataSource.manager;
    const complaint = await manager.findOne(Complaint, {
      where: { id: complaintId, organizationId: orgId },
      relations: ['raisedBy', 'handledBy'],
    });
    if (!complaint) throw new NotFoundException('Complaint not found');
    await this.assertHandler(manager, complaint, context);

    // Reading one a level below is allowed, and leaves a trace (D#78).
    if (context.isSuperAdmin && complaint.level !== ComplaintLevel.SUPER_ADMIN) {
      await this.audit(manager, 'COMPLAINT_READ_CENTRALLY', context.userId, complaint, ipAddress, {
        level: complaint.level,
      });
    }
    const [events, [member], visit] = await Promise.all([
      manager.find(ComplaintEvent, {
        where: { complaintId: complaint.id },
        relations: ['actor'],
        order: { createdAt: 'ASC' },
      }),
      manager.find(OrganizationMembership, {
        where: { organizationId: orgId, userId: complaint.raisedByUserId },
        take: 1,
      }),
      this.visitSummary(manager, complaint.serviceRequestId),
    ]);
    return {
      ...summary(complaint),
      description: complaint.description,
      raisedByName: complaint.raisedBy?.fullName ?? null,
      raisedByPhone: complaint.raisedBy?.phoneE164 ?? null,
      raisedByMemberNumber: member?.membershipNumber ?? null,
      handledByName: complaint.handledBy?.fullName ?? null,
      memberMessage: complaint.memberMessage ?? null,
      visit,
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        notes: event.notes ?? null,
        actorName: event.actor?.fullName ?? null,
        createdAt: event.createdAt,
      })),
    };
  }

  /** "I am handling this". Other staff can see that someone has it. */
  async take(
    orgId: string,
    complaintId: string,
    context: EvaluatedMembershipContext,
    ipAddress?: string,
  ) {
    return this.act(orgId, complaintId, context, async (manager, complaint) => {
      complaint.status = ComplaintStatus.IN_REVIEW;
      complaint.handledByUserId = context.userId;
      await manager.save(Complaint, complaint);
      await this.addEvent(manager, complaint, context.userId, ComplaintEventType.TAKEN);
      await this.audit(manager, 'COMPLAINT_TAKEN', context.userId, complaint, ipAddress, {});
      return summary(complaint);
    });
  }

  async addNote(
    orgId: string,
    complaintId: string,
    context: EvaluatedMembershipContext,
    notes: string,
    ipAddress?: string,
  ) {
    return this.act(orgId, complaintId, context, async (manager, complaint) => {
      await this.addEvent(manager, complaint, context.userId, ComplaintEventType.NOTE, notes);
      await this.audit(manager, 'COMPLAINT_NOTE_ADDED', context.userId, complaint, ipAddress, {});
      return summary(complaint);
    });
  }

  /** For a conflict of interest or a serious case. The next level gets the full history (D#77). */
  async passUp(
    orgId: string,
    complaintId: string,
    context: EvaluatedMembershipContext,
    notes: string,
    ipAddress?: string,
  ) {
    return this.act(orgId, complaintId, context, async (manager, complaint) => {
      const next = NEXT_LEVEL[complaint.level];
      if (!next) throw new ConflictException('A Super Admin is the final authority');
      const from = complaint.level;
      complaint.level = next;
      complaint.status = ComplaintStatus.OPEN;
      complaint.handledByUserId = null;
      await manager.save(Complaint, complaint);
      await this.addEvent(manager, complaint, context.userId, ComplaintEventType.PASSED_UP, notes);
      await this.notifyHandlers(manager, complaint);
      await this.audit(manager, 'COMPLAINT_PASSED_UP', context.userId, complaint, ipAddress, {
        from,
        to: next,
      });
      return summary(complaint);
    });
  }

  async decide(
    orgId: string,
    complaintId: string,
    context: EvaluatedMembershipContext,
    dto: DecideComplaintDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.act(orgId, complaintId, context, async (manager, complaint) => {
      complaint.status = ComplaintStatus.CLOSED;
      complaint.outcome = dto.outcome;
      complaint.memberMessage = dto.memberMessage.trim();
      complaint.decidedAt = now;
      complaint.decidedByUserId = context.userId;
      complaint.handledByUserId = context.userId;
      await manager.save(Complaint, complaint);
      await this.addEvent(
        manager,
        complaint,
        context.userId,
        ComplaintEventType.DECIDED,
        dto.notes,
      );
      await this.notifications.notifyUsers(manager, [complaint.raisedByUserId], {
        organizationId: complaint.organizationId,
        type: 'COMPLAINT_DECIDED',
        title: 'An update on your complaint',
        body: 'Open the app to read it.',
      });
      await this.audit(manager, 'COMPLAINT_DECIDED', context.userId, complaint, ipAddress, {
        outcome: dto.outcome,
        level: complaint.level,
      });
      return summary(complaint);
    });
  }

  private async act<T>(
    orgId: string,
    complaintId: string,
    context: EvaluatedMembershipContext,
    work: (manager: EntityManager, complaint: Complaint) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const complaint = await manager.findOne(Complaint, {
        where: { id: complaintId, organizationId: orgId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!complaint) throw new NotFoundException('Complaint not found');
      await this.assertHandler(manager, complaint, context);
      if (complaint.status === ComplaintStatus.CLOSED) {
        throw new ConflictException('This complaint is already closed');
      }
      return work(manager, complaint);
    });
  }

  private async assertHandler(
    manager: EntityManager,
    complaint: Complaint,
    context: EvaluatedMembershipContext,
  ): Promise<void> {
    const reachable = levelsFor(context).includes(complaint.level);
    const involved =
      complaint.raisedByUserId === context.userId ||
      (complaint.serviceRequestId &&
        (await this.visitsInvolving(manager, context.userId, [complaint.serviceRequestId])).has(
          complaint.serviceRequestId,
        ));
    if (!reachable || involved) throw new NotFoundException('Complaint not found');
  }

  private async summaries(userId: string, levels: ComplaintLevel[], open: boolean, orgId?: string) {
    const complaints = await this.dataSource.getRepository(Complaint).find({
      where: {
        level: In(levels),
        ...(orgId ? { organizationId: orgId } : {}),
        ...(open ? { status: Not(ComplaintStatus.CLOSED) } : {}),
      },
      relations: ['organization'],
      order: { createdAt: 'DESC' },
      take: LIST_LIMIT,
    });
    const involved = await this.visitsInvolving(
      this.dataSource.manager,
      userId,
      complaints.flatMap((complaint) => complaint.serviceRequestId ?? []),
    );
    return complaints
      .filter(
        (complaint) =>
          complaint.raisedByUserId !== userId &&
          !(complaint.serviceRequestId && involved.has(complaint.serviceRequestId)),
      )
      .map(summary);
  }

  /** Which of these requests this person asked for, or agreed to help with. */
  private async visitsInvolving(
    manager: EntityManager,
    userId: string,
    requestIds: string[],
  ): Promise<Set<string>> {
    if (requestIds.length === 0) return new Set();
    const rows: { id: string }[] = await manager.query(
      `SELECT r.id FROM service_requests r
       JOIN organization_memberships b ON b.id = r.beneficiary_membership_id
       WHERE r.id = ANY($1) AND (b.user_id = $2 OR r.created_by_user_id = $2)
       UNION
       SELECT a.service_request_id FROM volunteer_assignments a
       JOIN organization_memberships v ON v.id = a.volunteer_membership_id
       WHERE a.service_request_id = ANY($1) AND v.user_id = $2 AND a.accepted_at IS NOT NULL`,
      [requestIds, userId],
    );
    return new Set(rows.map((row) => row.id));
  }

  /** The same 404 for a visit that does not exist and one this member was not part of. */
  private async assertOnVisit(
    manager: EntityManager,
    orgId: string,
    requestId: string,
    membershipId: string,
    userId: string,
  ): Promise<void> {
    const request = await manager.findOne(ServiceRequest, {
      where: { id: requestId, organizationId: orgId },
    });
    const part =
      request &&
      (request.beneficiaryMembershipId === membershipId ||
        request.createdByUserId === userId ||
        (await manager.exists(VolunteerAssignment, {
          where: {
            serviceRequestId: requestId,
            volunteerMembershipId: membershipId,
            // An offer that was never accepted, even one since closed, is not being part of it.
            acceptedAt: Not(IsNull()),
          },
        })));
    if (!part) throw new NotFoundException('Visit not found');
  }

  private async visitSummary(manager: EntityManager, requestId?: string | null) {
    if (!requestId) return null;
    const request = await manager.findOne(ServiceRequest, {
      where: { id: requestId },
      relations: [
        'serviceCatalog',
        'serviceCatalog.globalService',
        'beneficiaryMembership',
        'beneficiaryMembership.user',
      ],
    });
    if (!request) return null;
    const helpers = await manager.find(VolunteerAssignment, {
      where: { serviceRequestId: requestId, acceptedAt: Not(IsNull()) },
      relations: ['volunteerMembership', 'volunteerMembership.user'],
    });
    return {
      id: request.id,
      requestNumber: request.requestNumber,
      serviceName:
        request.serviceCatalog?.customLabelEn ||
        request.serviceCatalog?.globalService?.nameEn ||
        'Service',
      scheduledStartTime: request.scheduledStartTime,
      beneficiaryName: request.beneficiaryMembership?.user?.fullName ?? null,
      volunteerNames: [
        ...new Set(
          helpers.map((helper) => helper.volunteerMembership?.user?.fullName ?? 'No name'),
        ),
      ],
    };
  }

  /**
   * Everyone who can act at this level, less anyone involved. If that leaves nobody, a Super Admin
   * is told, so a complaint cannot sit unseen in a community with no administrator.
   */
  async notifyHandlers(
    manager: EntityManager,
    complaint: Complaint,
    notice: { type: string; title: string; body: string } = {
      type: 'COMPLAINT_RAISED',
      title: 'A complaint needs review',
      body: 'Open the admin panel.',
    },
    exceptUserIds: string[] = [],
  ): Promise<void> {
    const roles =
      complaint.level === ComplaintLevel.COORDINATOR
        ? [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN]
        : [UserRole.MUNICIPALITY_ADMIN];
    const local: { user_id: string }[] =
      complaint.level === ComplaintLevel.SUPER_ADMIN
        ? []
        : await manager.query(
            `SELECT DISTINCT m.user_id FROM organization_memberships m
             JOIN membership_role_grants g ON g.membership_id = m.id
             WHERE m.organization_id = $1 AND m.status = 'APPROVED' AND g.status = 'ACTIVE'
               AND g.role = ANY($2)`,
            [complaint.organizationId, roles],
          );
    const allowed = await this.withoutInvolved(
      manager,
      complaint,
      local.map((row) => row.user_id).filter((id) => !exceptUserIds.includes(id)),
    );
    let recipients = allowed;
    if (recipients.length === 0) {
      const central: { user_id: string }[] = await manager.query(
        `SELECT DISTINCT m.user_id FROM organization_memberships m
         JOIN membership_role_grants g ON g.membership_id = m.id
         WHERE m.status = 'APPROVED' AND g.status = 'ACTIVE' AND g.role = 'SUPER_ADMIN'`,
      );
      recipients = await this.withoutInvolved(
        manager,
        complaint,
        central.map((row) => row.user_id).filter((id) => !exceptUserIds.includes(id)),
      );
    }
    await this.notifications.notifyUsers(manager, recipients, {
      organizationId: complaint.organizationId,
      ...notice,
    });
  }

  private async withoutInvolved(
    manager: EntityManager,
    complaint: Complaint,
    userIds: string[],
  ): Promise<string[]> {
    const others = userIds.filter((id) => id !== complaint.raisedByUserId);
    if (!complaint.serviceRequestId) return others;
    const kept: string[] = [];
    for (const id of others) {
      const involved = await this.visitsInvolving(manager, id, [complaint.serviceRequestId]);
      if (!involved.has(complaint.serviceRequestId)) kept.push(id);
    }
    return kept;
  }

  private async addEvent(
    manager: EntityManager,
    complaint: Complaint,
    actorUserId: string,
    type: ComplaintEventType,
    notes?: string,
  ): Promise<void> {
    await manager.insert(ComplaintEvent, {
      complaintId: complaint.id,
      actorUserId,
      type,
      notes: notes?.trim() || null,
    });
  }

  /** Never the words: those stay on the complaint, where the level rules protect them. */
  private async audit(
    manager: EntityManager,
    eventType: string,
    actorId: string,
    complaint: Complaint,
    ipAddress: string | undefined,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.logEvent(
      {
        eventType,
        actorId,
        targetId: complaint.id,
        targetType: 'complaints',
        organizationId: complaint.organizationId,
        payload,
        ipAddress: ipAddress ?? null,
      },
      manager,
    );
  }
}

function newReference(now: Date): string {
  const month = now.toISOString().slice(0, 7).replace('-', '');
  return `CMP-${month}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

/** No words, and no names, so a list reveals nothing about who said what. */
function summary(complaint: Complaint) {
  return {
    id: complaint.id,
    organizationId: complaint.organizationId,
    organizationName: complaint.organization?.name ?? null,
    reference: complaint.reference,
    subject: complaint.subject,
    level: complaint.level,
    status: complaint.status,
    outcome: complaint.outcome ?? null,
    hasVisit: Boolean(complaint.serviceRequestId),
    beingHandled: Boolean(complaint.handledByUserId),
    createdAt: complaint.createdAt,
    decidedAt: complaint.decidedAt ?? null,
  };
}

/** Everything the member may know. Never who handled it, its level or the staff's notes. */
function memberView(complaint: Complaint, appeals: Appeal[], now = new Date()) {
  const latest = appeals[appeals.length - 1];
  const deadline = appealDeadline(complaint.decidedAt);
  const canAppeal =
    complaint.status === ComplaintStatus.CLOSED &&
    Boolean(NEXT_LEVEL[complaint.level]) &&
    latest?.status !== AppealStatus.OPEN &&
    deadline !== null &&
    now <= deadline;
  return {
    id: complaint.id,
    reference: complaint.reference,
    subject: complaint.subject,
    status: complaint.status,
    description: complaint.description,
    outcome: complaint.outcome ?? null,
    memberMessage: complaint.memberMessage ?? null,
    requestNumber: complaint.serviceRequest?.requestNumber ?? null,
    createdAt: complaint.createdAt,
    decidedAt: complaint.decidedAt ?? null,
    canAppeal,
    appealDeadline: canAppeal ? deadline : null,
    appealStatus: latest?.status ?? null,
    appealOutcome: latest?.outcome ?? null,
  };
}
