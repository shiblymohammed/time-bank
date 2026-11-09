import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull, Not } from 'typeorm';
import {
  AssignmentReviewReason,
  SafetyAlertAction,
  SafetyAlertOutcome,
  SafetyAlertRaiserRole,
  SafetyAlertStatus,
  UserRole,
  VolunteerAssignmentStatus,
} from '@ktb/shared-types';
import { AuditService } from '../audit/audit.service';
import { EvaluatedMembershipContext } from '../authorization/authorization.service';
import { BeneficiariesService } from '../beneficiaries/beneficiaries.service';
import { VolunteerAssignment } from '../matching/entities/volunteer-assignment.entity';
import { pausedSecondsAt, workedMinutes } from '../matching/booking-recovery';
import { MAX_SERVICE_MINUTES } from '../matching/matching.service';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ServiceRequest } from '../requests/entities/service-request.entity';
import { RaiseSafetyAlertDto } from './dto/safety.dto';
import { SafetyAlert } from './entities/safety-alert.entity';

const ALERT_LIST_LIMIT = 100;

/**
 * Safety alerts during a visit (FR-SAFE-01, FR-SAFE-02, BR-10). An alert pauses every volunteer
 * on the request. Each volunteer then restarts or leaves for themselves. Only the person being
 * helped, their caregiver or staff can end the visit for the whole team.
 *
 * Messages to the two people on a visit are the same and never say who raised the alert or why,
 * and push text stays generic because it shows on locked screens.
 */
@Injectable()
export class SafetyService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly auditService: AuditService,
    private readonly beneficiaries: BeneficiariesService,
  ) {}

  async raiseAlert(
    orgId: string,
    requestId: string,
    userId: string,
    context: EvaluatedMembershipContext,
    dto: RaiseSafetyAlertDto,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const request = await this.lockRequest(manager, orgId, requestId);
      if (dto.clientOperationId) {
        const earlier = await manager.findOne(SafetyAlert, {
          where: { raisedByUserId: userId, clientOperationId: dto.clientOperationId },
        });
        if (earlier) return memberReceipt(earlier);
      }
      const visits = await this.lockActiveVisits(manager, request.id);
      const role = await this.partyRole(orgId, request, visits, context);
      if (visits.length === 0) {
        throw new ConflictException('A safety alert can be raised only while a visit is under way');
      }

      const alert = await manager.save(
        SafetyAlert,
        manager.create(SafetyAlert, {
          organizationId: orgId,
          serviceRequestId: request.id,
          raisedByUserId: userId,
          raisedByRole: role,
          action: dto.action,
          notes: dto.notes?.trim() || null,
          clientOperationId: dto.clientOperationId ?? null,
          status: SafetyAlertStatus.OPEN,
        }),
      );

      const ending =
        dto.action !== SafetyAlertAction.END
          ? []
          : role === SafetyAlertRaiserRole.VOLUNTEER
            ? visits.filter((visit) => visit.volunteerMembershipId === context.membershipId)
            : visits;
      const pausing = visits.filter((visit) => !ending.includes(visit));
      await this.endVisits(manager, ending, userId, now);
      for (const visit of pausing) {
        visit.pausedAt = visit.pausedAt ?? now;
        // A new alert takes back any earlier permission to restart.
        visit.restartAllowedAt = null;
        await manager.save(VolunteerAssignment, visit);
      }
      await this.noteStaffingAfterDeparture(manager, request, pausing, now);

      await this.notifyStaff(manager, request, visits, userId);
      await this.notifyParties(
        manager,
        request,
        visits,
        pausing.length > 0 ? PAUSED_MESSAGE : ENDED_MESSAGE,
      );
      await this.audit(manager, 'SAFETY_ALERT_RAISED', userId, alert, ipAddress, {
        action: dto.action,
        raisedByRole: role,
      });
      return memberReceipt(alert);
    });
  }

  /**
   * A volunteer restarts their own visit once a coordinator allows it, or leaves. The person being
   * helped, or their caregiver, can end it for the whole team.
   */
  async respondToRestart(
    orgId: string,
    requestId: string,
    userId: string,
    context: EvaluatedMembershipContext,
    restart: boolean,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const request = await this.lockRequest(manager, orgId, requestId);
      const visits = await this.lockActiveVisits(manager, request.id);
      const role = await this.partyRole(orgId, request, visits, context);
      const paused = visits.filter((visit) => visit.pausedAt);
      if (paused.length === 0) throw new ConflictException('This visit is not paused');
      const alerts = await this.lockUnresolvedAlerts(manager, request.id);

      const own = visits.filter((visit) => visit.volunteerMembershipId === context.membershipId);

      if (!restart) {
        const ending = role === SafetyAlertRaiserRole.VOLUNTEER ? own : visits;
        const remaining = visits.filter((visit) => !ending.includes(visit));
        await this.endVisits(manager, ending, userId, now);
        await this.noteStaffingAfterDeparture(manager, request, remaining, now);
        await this.notifyStaff(manager, request, visits, userId);
        await this.notifyParties(
          manager,
          request,
          visits,
          remaining.length > 0 ? VOLUNTEER_LEFT_MESSAGE : ENDED_MESSAGE,
        );
        for (const alert of alerts) {
          await this.audit(manager, 'SAFETY_RESTART_DECLINED', userId, alert, ipAddress, { role });
        }
        await this.resolveIfEveryoneRestarted(manager, remaining, alerts, userId, now);
        return { status: 'ENDED' };
      }

      if (role !== SafetyAlertRaiserRole.VOLUNTEER) {
        throw new ForbiddenException('The volunteer restarts the visit');
      }
      const mine = own[0];
      if (!mine?.pausedAt) throw new ConflictException('Your visit is not paused');
      if (!mine.restartAllowedAt) {
        throw new ConflictException('A coordinator must allow this visit to restart first');
      }
      mine.pausedSeconds = pausedSecondsAt(mine, now);
      mine.pausedAt = null;
      mine.restartAllowedAt = null;
      await manager.save(VolunteerAssignment, mine);
      for (const alert of alerts) {
        await this.audit(manager, 'SAFETY_VISIT_RESTARTED', userId, alert, ipAddress, {});
      }
      if (await this.resolveIfEveryoneRestarted(manager, visits, alerts, userId, now)) {
        await this.notifyParties(manager, request, visits, RESTARTED_MESSAGE, userId);
      }
      return { status: 'RESTARTED' };
    });
  }

  async listAlerts(orgId: string, context: EvaluatedMembershipContext, open: boolean) {
    this.assertStaff(context);
    const alerts = await this.dataSource.getRepository(SafetyAlert).find({
      where: {
        organizationId: orgId,
        ...(open ? { status: Not(SafetyAlertStatus.RESOLVED) } : {}),
      },
      relations: [
        'raisedBy',
        'serviceRequest',
        'serviceRequest.serviceCatalog',
        'serviceRequest.serviceCatalog.globalService',
        'serviceRequest.beneficiaryMembership',
        'serviceRequest.beneficiaryMembership.user',
      ],
      order: { createdAt: 'DESC' },
      take: ALERT_LIST_LIMIT,
    });
    const requestIds = [...new Set(alerts.map((alert) => alert.serviceRequestId))];
    const visits = requestIds.length
      ? await this.dataSource.getRepository(VolunteerAssignment).find({
          where: {
            serviceRequestId: In(requestIds),
            startedAt: Not(IsNull()),
          },
          relations: ['volunteerMembership', 'volunteerMembership.user'],
        })
      : [];
    return (
      alerts
        // Staff on the visit themselves do not see or handle an alert about it.
        .filter((alert) => {
          const onVisit = visits.filter((v) => v.serviceRequestId === alert.serviceRequestId);
          return !partyUserIds(alert, alert.serviceRequest!, onVisit).includes(context.userId);
        })
        .map((alert) => toStaffView(alert, visits))
    );
  }

  async acknowledge(
    orgId: string,
    alertId: string,
    context: EvaluatedMembershipContext,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.handle(orgId, alertId, context, async (manager, { alert }) => {
      if (alert.status === SafetyAlertStatus.RESOLVED) {
        throw new ConflictException('This alert is already closed');
      }
      if (alert.status === SafetyAlertStatus.OPEN) {
        this.markSeen(alert, context.userId, now);
        await manager.save(SafetyAlert, alert);
        await this.audit(
          manager,
          'SAFETY_ALERT_ACKNOWLEDGED',
          context.userId,
          alert,
          ipAddress,
          {},
        );
      }
      return { id: alert.id, status: alert.status };
    });
  }

  /** BR-10: only a coordinator can clear a paused visit, and the volunteer still chooses. */
  async allowRestart(
    orgId: string,
    alertId: string,
    context: EvaluatedMembershipContext,
    notes: string,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.handle(orgId, alertId, context, async (manager, { alert, request, visits }) => {
      const paused = visits.filter((visit) => visit.pausedAt);
      if (paused.length === 0) throw new ConflictException('This visit is not paused');
      for (const visit of paused) {
        visit.restartAllowedAt = now;
        await manager.save(VolunteerAssignment, visit);
      }
      for (const open of await this.lockUnresolvedAlerts(manager, request.id)) {
        if (open.status === SafetyAlertStatus.OPEN) this.markSeen(open, context.userId, now);
        open.staffNotes = notes;
        await manager.save(SafetyAlert, open);
      }
      await this.notifyParties(manager, request, visits, RESTART_ALLOWED_MESSAGE);
      await this.audit(manager, 'SAFETY_RESTART_ALLOWED', context.userId, alert, ipAddress, {
        notes,
      });
      return { id: alert.id, status: 'RESTART_ALLOWED' };
    });
  }

  /** Ends a paused visit. It then waits for the usual coordinator decision on its credits. */
  async endVisit(
    orgId: string,
    alertId: string,
    context: EvaluatedMembershipContext,
    notes: string,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.handle(orgId, alertId, context, async (manager, { alert, request, visits }) => {
      if (visits.length === 0) throw new ConflictException('This visit has already ended');
      // Recorded against whoever raised the alert, so the same coordinator can decide the credits.
      await this.endVisits(manager, visits, alert.raisedByUserId, now);
      await this.noteStaffingAfterDeparture(manager, request, [], now);
      await this.resolveAll(manager, request.id, context.userId, notes, now);
      await this.notifyParties(manager, request, visits, ENDED_MESSAGE);
      await this.audit(manager, 'SAFETY_VISIT_ENDED', context.userId, alert, ipAddress, { notes });
      return { id: alert.id, status: SafetyAlertStatus.RESOLVED };
    });
  }

  /** Closes the alert on a visit that has already ended. */
  async closeAlert(
    orgId: string,
    alertId: string,
    context: EvaluatedMembershipContext,
    notes: string,
    ipAddress?: string,
    now = new Date(),
  ) {
    return this.handle(orgId, alertId, context, async (manager, { alert, request, visits }) => {
      if (visits.length > 0) throw new ConflictException('Restart or end the visit first');
      await this.resolveAll(manager, request.id, context.userId, notes, now);
      await this.audit(manager, 'SAFETY_ALERT_CLOSED', context.userId, alert, ipAddress, { notes });
      return { id: alert.id, status: SafetyAlertStatus.RESOLVED };
    });
  }

  private handle<T>(
    orgId: string,
    alertId: string,
    context: EvaluatedMembershipContext,
    work: (
      manager: EntityManager,
      locked: { alert: SafetyAlert; request: ServiceRequest; visits: VolunteerAssignment[] },
    ) => Promise<T>,
  ): Promise<T> {
    this.assertStaff(context);
    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const found = await manager.findOne(SafetyAlert, {
        where: { id: alertId, organizationId: orgId },
      });
      if (!found) throw new NotFoundException('Safety alert not found');
      const request = await this.lockRequest(manager, orgId, found.serviceRequestId);
      const alert = await manager.findOneOrFail(SafetyAlert, {
        where: { id: alertId },
        lock: { mode: 'pessimistic_write' },
      });
      const visits = await this.lockActiveVisits(manager, request.id);
      const started = await manager.find(VolunteerAssignment, {
        where: { serviceRequestId: request.id, startedAt: Not(IsNull()) },
        relations: ['volunteerMembership'],
      });
      const beneficiary = await manager.findOneOrFail(OrganizationMembership, {
        where: { id: request.beneficiaryMembershipId },
      });
      request.beneficiaryMembership = beneficiary;
      if (partyUserIds(alert, request, started).includes(context.userId)) {
        throw new ForbiddenException('Another coordinator must handle this alert');
      }
      return work(manager, { alert, request, visits });
    });
  }

  private assertStaff(context: EvaluatedMembershipContext): void {
    if (
      !context.isSuperAdmin &&
      !context.roles.some((role) =>
        [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN].includes(role),
      )
    ) {
      throw new ForbiddenException('Coordinator authority required');
    }
  }

  private async lockRequest(
    manager: EntityManager,
    orgId: string,
    requestId: string,
  ): Promise<ServiceRequest> {
    const request = await manager.findOne(ServiceRequest, {
      where: { id: requestId, organizationId: orgId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!request) throw new NotFoundException('Service request not found');
    return request;
  }

  private lockActiveVisits(
    manager: EntityManager,
    requestId: string,
  ): Promise<VolunteerAssignment[]> {
    return manager.find(VolunteerAssignment, {
      where: { serviceRequestId: requestId, status: VolunteerAssignmentStatus.IN_PROGRESS },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private lockUnresolvedAlerts(manager: EntityManager, requestId: string): Promise<SafetyAlert[]> {
    return manager.find(SafetyAlert, {
      where: { serviceRequestId: requestId, status: Not(SafetyAlertStatus.RESOLVED) },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /** Only someone on the visit can raise an alert or answer a restart. */
  private async partyRole(
    orgId: string,
    request: ServiceRequest,
    visits: VolunteerAssignment[],
    context: EvaluatedMembershipContext,
  ): Promise<SafetyAlertRaiserRole> {
    if (visits.some((visit) => visit.volunteerMembershipId === context.membershipId)) {
      return SafetyAlertRaiserRole.VOLUNTEER;
    }
    if (request.beneficiaryMembershipId === context.membershipId) {
      return SafetyAlertRaiserRole.BENEFICIARY;
    }
    const caregiver = await this.beneficiaries
      .verifyCaregiverProxyAccess(
        orgId,
        context.membershipId,
        request.beneficiaryMembershipId,
        'confirm',
      )
      .catch(() => null);
    if (!caregiver) throw new ForbiddenException('You are not part of this visit');
    return SafetyAlertRaiserRole.CAREGIVER;
  }

  /**
   * No credits move: the visit waits for the coordinator's usual decision. The time recorded
   * leaves out any pause. The note stays on the alert, away from anything the members can read.
   */
  private async endVisits(
    manager: EntityManager,
    visits: VolunteerAssignment[],
    requestedBy: string,
    now: Date,
  ): Promise<void> {
    for (const visit of visits) {
      visit.pausedSeconds = pausedSecondsAt(visit, now);
      visit.pausedAt = null;
      visit.restartAllowedAt = null;
      visit.status = VolunteerAssignmentStatus.COMPLETED;
      visit.finishedAt = now;
      visit.reportedMinutes = Math.min(workedMinutes(visit, now), MAX_SERVICE_MINUTES);
      visit.reviewReason = AssignmentReviewReason.SAFETY_ALERT;
      visit.reviewRequestedAt = now;
      visit.reviewRequestedByUserId = requestedBy;
      await manager.save(VolunteerAssignment, visit);
    }
  }

  /** The alert is over once everyone still on the visit is working again. */
  private async resolveIfEveryoneRestarted(
    manager: EntityManager,
    remaining: VolunteerAssignment[],
    alerts: SafetyAlert[],
    userId: string,
    now: Date,
  ): Promise<boolean> {
    if (remaining.length === 0 || remaining.some((visit) => visit.pausedAt)) return false;
    for (const alert of alerts) {
      this.resolve(alert, SafetyAlertOutcome.RESTARTED, userId, now);
      await manager.save(SafetyAlert, alert);
    }
    return true;
  }

  /**
   * One volunteer has left a team during an alert. Staff already know about the visit, so the
   * usual wait applies before the open place goes on offer.
   */
  private async noteStaffingAfterDeparture(
    manager: EntityManager,
    request: ServiceRequest,
    remaining: VolunteerAssignment[],
    now: Date,
  ): Promise<void> {
    if (
      remaining.length > 0 &&
      remaining.length < request.minVolunteers &&
      !request.belowMinimumAt
    ) {
      request.belowMinimumAt = now;
      await manager.save(ServiceRequest, request);
    } else if (remaining.length === 0 && request.belowMinimumAt) {
      request.belowMinimumAt = null;
      request.belowMinimumAlertedAt = null;
      request.replacementEscalatedAt = null;
      await manager.save(ServiceRequest, request);
    }
  }

  private markSeen(alert: SafetyAlert, userId: string, now: Date): void {
    alert.status = SafetyAlertStatus.ACKNOWLEDGED;
    alert.acknowledgedAt = now;
    alert.acknowledgedByUserId = userId;
  }

  private resolve(
    alert: SafetyAlert,
    outcome: SafetyAlertOutcome,
    userId: string,
    now: Date,
  ): void {
    alert.status = SafetyAlertStatus.RESOLVED;
    alert.outcome = outcome;
    alert.resolvedAt = now;
    alert.resolvedByUserId = userId;
  }

  private async resolveAll(
    manager: EntityManager,
    requestId: string,
    userId: string,
    notes: string,
    now: Date,
  ): Promise<void> {
    for (const alert of await this.lockUnresolvedAlerts(manager, requestId)) {
      this.resolve(alert, SafetyAlertOutcome.ENDED, userId, now);
      alert.staffNotes = notes;
      await manager.save(SafetyAlert, alert);
    }
  }

  private async notifyStaff(
    manager: EntityManager,
    request: ServiceRequest,
    visits: VolunteerAssignment[],
    raisedBy: string,
  ): Promise<void> {
    const members = await manager.find(OrganizationMembership, {
      where: {
        id: In([request.beneficiaryMembershipId, ...visits.map((v) => v.volunteerMembershipId)]),
      },
    });
    await this.notifications.notifyCoordinators(
      manager,
      {
        organizationId: request.organizationId,
        requestId: request.id,
        type: 'SAFETY_ALERT',
        title: 'Safety alert: please act now',
        body: 'Open the admin panel and go to Safety alerts.',
      },
      [raisedBy, ...members.map((member) => member.userId)],
    );
  }

  private async notifyParties(
    manager: EntityManager,
    request: ServiceRequest,
    visits: VolunteerAssignment[],
    message: { type: string; title: string; body: string },
    exceptUserId?: string,
  ): Promise<void> {
    const notice = { organizationId: request.organizationId, requestId: request.id, ...message };
    await this.notifications.notifyMemberships(
      manager,
      visits.map((visit) => visit.volunteerMembershipId),
      notice,
    );
    await this.notifications.notifyRequestOwners(manager, request, notice, exceptUserId);
  }

  private audit(
    manager: EntityManager,
    eventType: string,
    actorId: string,
    alert: SafetyAlert,
    ipAddress: string | undefined,
    payload: Record<string, unknown>,
  ) {
    // The member's note stays out of the audit trail, which more people can read.
    return this.auditService.logEvent(
      {
        eventType,
        actorId,
        targetId: alert.id,
        targetType: 'safety_alerts',
        organizationId: alert.organizationId,
        payload: { serviceRequestId: alert.serviceRequestId, ...payload },
        ipAddress: ipAddress ?? null,
      },
      manager,
    );
  }
}

const PAUSED_MESSAGE = {
  type: 'SAFETY_VISIT_PAUSED',
  title: 'This visit is paused',
  body: 'A coordinator will contact you.',
};
const ENDED_MESSAGE = {
  type: 'SAFETY_VISIT_ENDED',
  title: 'This visit has ended',
  body: 'A coordinator will contact you.',
};
const VOLUNTEER_LEFT_MESSAGE = {
  type: 'SAFETY_VOLUNTEER_LEFT',
  title: 'A volunteer has left this visit',
  body: 'A coordinator will contact you.',
};
const RESTART_ALLOWED_MESSAGE = {
  type: 'SAFETY_RESTART_ALLOWED',
  title: 'This visit can restart',
  body: 'Open the app to restart it, or to end it if you prefer.',
};
const RESTARTED_MESSAGE = {
  type: 'SAFETY_VISIT_RESTARTED',
  title: 'This visit has restarted',
  body: 'You can still raise a safety alert at any time.',
};

/** All the person who raised the alert needs to know: it reached the server. */
function memberReceipt(alert: SafetyAlert) {
  return { id: alert.id, action: alert.action, createdAt: alert.createdAt };
}

function partyUserIds(
  alert: SafetyAlert,
  request: ServiceRequest,
  visits: VolunteerAssignment[],
): string[] {
  return [
    alert.raisedByUserId,
    request.beneficiaryMembership?.userId,
    ...visits.map((visit) => visit.volunteerMembership?.userId),
  ].filter((id): id is string => Boolean(id));
}

function toStaffView(alert: SafetyAlert, allVisits: VolunteerAssignment[]) {
  const request = alert.serviceRequest!;
  const visits = allVisits.filter((visit) => visit.serviceRequestId === alert.serviceRequestId);
  const catalogue = request.serviceCatalog;
  return {
    id: alert.id,
    status: alert.status,
    action: alert.action,
    outcome: alert.outcome ?? null,
    notes: alert.notes ?? null,
    staffNotes: alert.staffNotes ?? null,
    raisedByRole: alert.raisedByRole,
    raisedByName: alert.raisedBy?.fullName ?? null,
    raisedByPhone: alert.raisedBy?.phoneE164 ?? null,
    createdAt: alert.createdAt,
    acknowledgedAt: alert.acknowledgedAt ?? null,
    resolvedAt: alert.resolvedAt ?? null,
    request: {
      id: request.id,
      requestNumber: request.requestNumber,
      serviceName: catalogue?.customLabelEn || catalogue?.globalService?.nameEn || 'Service',
      address: request.locationAddressText,
      beneficiaryName: request.beneficiaryMembership?.user?.fullName ?? null,
      beneficiaryPhone: request.beneficiaryMembership?.user?.phoneE164 ?? null,
    },
    visits: visits.map((visit) => ({
      id: visit.id,
      status: visit.status,
      volunteerName: visit.volunteerMembership?.user?.fullName ?? null,
      volunteerPhone: visit.volunteerMembership?.user?.phoneE164 ?? null,
      startedAt: visit.startedAt ?? null,
      pausedAt: visit.pausedAt ?? null,
      restartAllowedAt: visit.restartAllowedAt ?? null,
      reportedMinutes: visit.reportedMinutes ?? null,
      creditsPending: Boolean(visit.reviewRequestedAt) && !visit.reviewResolvedAt,
    })),
  };
}
