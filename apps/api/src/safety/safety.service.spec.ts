import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AssignmentReviewReason,
  SafetyAlertAction,
  SafetyAlertOutcome,
  SafetyAlertRaiserRole,
  SafetyAlertStatus,
  ServiceRequestStatus,
  UserRole,
  VolunteerAssignmentStatus,
} from '@ktb/shared-types';
import { VolunteerAssignment } from '../matching/entities/volunteer-assignment.entity';
import { pausedSecondsAt, workedMinutes } from '../matching/booking-recovery';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { ServiceRequest } from '../requests/entities/service-request.entity';
import { safetyState, toRequestView, visitStage } from '../requests/request-view';
import { SafetyAlert } from './entities/safety-alert.entity';
import { SafetyService } from './safety.service';

const START = new Date('2026-11-09T10:00:00.000Z');
const minutesAfterStart = (minutes: number) => new Date(START.getTime() + minutes * 60_000);

const person = (membershipId: string, userId: string, roles: UserRole[] = []) =>
  ({
    userId,
    organizationId: 'org',
    membershipId,
    roles,
    isSuperAdmin: false,
    membershipStatus: 'APPROVED',
  }) as never;
const volunteer = person('m-volunteer', 'u-volunteer', [UserRole.VOLUNTEER]);
const beneficiary = person('m-beneficiary', 'u-beneficiary', [UserRole.BENEFICIARY]);
const stranger = person('m-stranger', 'u-stranger', [UserRole.VOLUNTEER]);
const coordinator = person('m-coordinator', 'u-coordinator', [UserRole.COORDINATOR]);

describe('SafetyService', () => {
  let visit: VolunteerAssignment;
  let request: ServiceRequest;
  let alerts: SafetyAlert[];
  let notifications: {
    notifyCoordinators: jest.Mock;
    notifyMemberships: jest.Mock;
    notifyRequestOwners: jest.Mock;
  };
  let audit: { logEvent: jest.Mock };
  let service: SafetyService;

  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, wanted]) => {
      const operator = wanted as { _type?: string; _value?: unknown };
      if (operator?._type === 'not') {
        const inner = operator._value as { _type?: string } | unknown;
        return (inner as { _type?: string })?._type === 'isNull'
          ? row[key] !== null && row[key] !== undefined
          : row[key] !== inner;
      }
      return row[key] === wanted;
    });

  const rows = (entity: unknown): Record<string, unknown>[] => {
    if (entity === VolunteerAssignment) return [visit as never];
    if (entity === SafetyAlert) return alerts as never;
    if (entity === ServiceRequest) return [request as never];
    if (entity === OrganizationMembership) {
      return [
        { id: 'm-beneficiary', userId: 'u-beneficiary' },
        { id: 'm-volunteer', userId: 'u-volunteer' },
        { id: 'm-coordinator', userId: 'u-coordinator' },
      ];
    }
    return [];
  };

  beforeEach(() => {
    visit = {
      id: 'visit',
      organizationId: 'org',
      serviceRequestId: 'request',
      volunteerMembershipId: 'm-volunteer',
      volunteerMembership: { userId: 'u-volunteer' },
      status: VolunteerAssignmentStatus.IN_PROGRESS,
      startedAt: START,
      pausedAt: null,
      pausedSeconds: 0,
      restartAllowedAt: null,
    } as never;
    request = {
      id: 'request',
      organizationId: 'org',
      beneficiaryMembershipId: 'm-beneficiary',
      createdByUserId: 'u-beneficiary',
      status: ServiceRequestStatus.IN_PROGRESS,
    } as never;
    alerts = [];
    const manager = {
      findOne: jest.fn(async (entity: unknown, options: { where: Record<string, unknown> }) => {
        return rows(entity).find((row) => matches(row, options.where)) ?? null;
      }),
      findOneOrFail: jest.fn(
        async (entity: unknown, options: { where: Record<string, unknown> }) => {
          return rows(entity).find((row) => matches(row, options.where));
        },
      ),
      find: jest.fn(async (entity: unknown, options: { where: Record<string, unknown> }) => {
        if (entity === OrganizationMembership) return rows(entity);
        return rows(entity).filter((row) => matches(row, options.where));
      }),
      create: jest.fn((_entity: unknown, value: object) => ({ ...value })),
      save: jest.fn(async (entity: unknown, value: SafetyAlert) => {
        if (entity === SafetyAlert && !value.id) {
          value.id = `alert-${alerts.length + 1}`;
          alerts.push(value);
        }
        return value;
      }),
    };
    notifications = {
      notifyCoordinators: jest.fn(),
      notifyMemberships: jest.fn(),
      notifyRequestOwners: jest.fn(),
    };
    audit = { logEvent: jest.fn() };
    const dataSource = {
      transaction: jest.fn((_level: string, work: (m: typeof manager) => unknown) => work(manager)),
    };
    const caregivers = {
      verifyCaregiverProxyAccess: jest.fn(async (_o, membershipId: string) => {
        if (membershipId === 'm-caregiver') return { id: 'authorization' };
        throw new ForbiddenException('No authorization');
      }),
    };
    service = new SafetyService(
      dataSource as never,
      notifications as never,
      audit as never,
      caregivers as never,
    );
  });

  const raise = (who: never, action = SafetyAlertAction.PAUSE, extra = {}) =>
    service.raiseAlert(
      'org',
      'request',
      (who as { userId: string }).userId,
      who,
      { action, notes: 'Private worry', ...extra },
      undefined,
      minutesAfterStart(20),
    );

  describe('raising an alert', () => {
    it('lets the volunteer pause the visit and tells staff at once', async () => {
      const receipt = await raise(volunteer);
      expect(visit.pausedAt).toEqual(minutesAfterStart(20));
      expect(visit.status).toBe(VolunteerAssignmentStatus.IN_PROGRESS);
      expect(alerts[0]!.raisedByRole).toBe(SafetyAlertRaiserRole.VOLUNTEER);
      expect(notifications.notifyCoordinators).toHaveBeenCalledTimes(1);
      // The member gets a receipt, not the record.
      expect(receipt).not.toHaveProperty('notes');
    });

    it('lets the beneficiary and an authorized caregiver raise one', async () => {
      await raise(beneficiary);
      expect(alerts[0]!.raisedByRole).toBe(SafetyAlertRaiserRole.BENEFICIARY);
      await raise(person('m-caregiver', 'u-caregiver'));
      expect(alerts[1]!.raisedByRole).toBe(SafetyAlertRaiserRole.CAREGIVER);
    });

    it('refuses anyone not on the visit', async () => {
      await expect(raise(stranger)).rejects.toBeInstanceOf(ForbiddenException);
      expect(visit.pausedAt).toBeNull();
    });

    it('refuses a request in another organization', async () => {
      await expect(
        service.raiseAlert('other', 'request', 'u-volunteer', volunteer, {
          action: SafetyAlertAction.PAUSE,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses when no visit is under way', async () => {
      visit.status = VolunteerAssignmentStatus.ACCEPTED;
      await expect(raise(beneficiary)).rejects.toBeInstanceOf(ConflictException);
    });

    it('a retry finds the alert it already raised', async () => {
      const first = await raise(volunteer, SafetyAlertAction.PAUSE, {
        clientOperationId: 'retry-key-1',
      });
      const second = await raise(volunteer, SafetyAlertAction.PAUSE, {
        clientOperationId: 'retry-key-1',
      });
      expect(second.id).toBe(first.id);
      expect(alerts).toHaveLength(1);
      expect(notifications.notifyCoordinators).toHaveBeenCalledTimes(1);
    });

    it('never names the person who raised it in any message, or the note in the audit trail', async () => {
      await raise(beneficiary);
      const messages = [
        ...notifications.notifyMemberships.mock.calls,
        ...notifications.notifyRequestOwners.mock.calls,
      ].map((call) => JSON.stringify(call[2]));
      for (const message of messages) {
        expect(message).not.toMatch(/alert|beneficiary|volunteer|Private worry/i);
      }
      expect(JSON.stringify(audit.logEvent.mock.calls)).not.toContain('Private worry');
    });

    it('does not alert staff who are on the visit themselves', async () => {
      await raise(volunteer);
      const except = notifications.notifyCoordinators.mock.calls[0][2];
      expect(except).toEqual(expect.arrayContaining(['u-volunteer', 'u-beneficiary']));
    });

    it('takes back permission to restart when another alert is raised', async () => {
      await raise(volunteer);
      visit.restartAllowedAt = minutesAfterStart(25);
      await raise(beneficiary);
      expect(visit.restartAllowedAt).toBeNull();
    });
  });

  describe('ending a visit through an alert', () => {
    it('sends it to a coordinator with the time worked, and pays nothing', async () => {
      await raise(volunteer, SafetyAlertAction.END);
      expect(visit.status).toBe(VolunteerAssignmentStatus.COMPLETED);
      expect(visit.reportedMinutes).toBe(20);
      expect(visit.reviewReason).toBe(AssignmentReviewReason.SAFETY_ALERT);
      expect(visit.reviewRequestedAt).toEqual(minutesAfterStart(20));
      expect(visit.confirmedAt).toBeUndefined();
    });

    it('leaves paused time out of the minutes', async () => {
      await raise(volunteer);
      await service.raiseAlert(
        'org',
        'request',
        'u-beneficiary',
        beneficiary,
        { action: SafetyAlertAction.END },
        undefined,
        minutesAfterStart(50),
      );
      expect(visit.reportedMinutes).toBe(20);
    });
  });

  describe('restarting', () => {
    const respond = (who: never, restart: boolean, minutes = 40) =>
      service.respondToRestart(
        'org',
        'request',
        (who as { userId: string }).userId,
        who,
        restart,
        undefined,
        minutesAfterStart(minutes),
      );

    it('refuses a restart until a coordinator allows it (BR-10)', async () => {
      await raise(beneficiary);
      await expect(respond(volunteer, true)).rejects.toBeInstanceOf(ConflictException);
      expect(visit.pausedAt).not.toBeNull();
    });

    it('resumes the clock without the paused time once allowed', async () => {
      await raise(beneficiary);
      await service.allowRestart(
        'org',
        alerts[0]!.id,
        coordinator,
        'Spoke to both',
        undefined,
        minutesAfterStart(30),
      );
      expect(visit.restartAllowedAt).toEqual(minutesAfterStart(30));
      await respond(volunteer, true);
      expect(visit.pausedAt).toBeNull();
      expect(visit.pausedSeconds).toBe(20 * 60);
      expect(alerts[0]!.status).toBe(SafetyAlertStatus.RESOLVED);
      expect(alerts[0]!.outcome).toBe(SafetyAlertOutcome.RESTARTED);
      expect(workedMinutes(visit, minutesAfterStart(60))).toBe(40);
    });

    it('does not let the beneficiary restart for the volunteer', async () => {
      await raise(volunteer);
      await service.allowRestart('org', alerts[0]!.id, coordinator, 'Spoke to both');
      await expect(respond(beneficiary, true)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each([
      ['volunteer', volunteer],
      ['beneficiary', beneficiary],
    ])('lets the %s decline, which ends the visit for review', async (_name, who) => {
      await raise(volunteer);
      await service.allowRestart('org', alerts[0]!.id, coordinator, 'Spoke to both');
      await respond(who as never, false);
      expect(visit.status).toBe(VolunteerAssignmentStatus.COMPLETED);
      expect(visit.reviewReason).toBe(AssignmentReviewReason.SAFETY_ALERT);
      expect(alerts[0]!.status).not.toBe(SafetyAlertStatus.RESOLVED);
    });

    it('refuses someone not on the visit', async () => {
      await raise(volunteer);
      await expect(respond(stranger, false)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('coordinator actions', () => {
    it('are refused for members', async () => {
      await raise(volunteer);
      for (const attempt of [
        service.listAlerts('org', stranger, true),
        service.acknowledge('org', alerts[0]!.id, stranger),
        service.allowRestart('org', alerts[0]!.id, stranger, 'Allowing'),
        service.endVisit('org', alerts[0]!.id, stranger, 'Ending'),
        service.closeAlert('org', alerts[0]!.id, stranger, 'Closing'),
      ]) {
        await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      }
    });

    it('are refused for a coordinator who is on the visit', async () => {
      const onVisit = person('m-volunteer', 'u-volunteer', [UserRole.COORDINATOR]);
      await raise(beneficiary);
      await expect(
        service.allowRestart('org', alerts[0]!.id, onVisit, 'Me'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('cannot reach an alert in another organization', async () => {
      await raise(volunteer);
      await expect(service.acknowledge('other', alerts[0]!.id, coordinator)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('acknowledging leaves the visit paused', async () => {
      await raise(volunteer);
      await service.acknowledge('org', alerts[0]!.id, coordinator);
      expect(alerts[0]!.status).toBe(SafetyAlertStatus.ACKNOWLEDGED);
      expect(visit.pausedAt).not.toBeNull();
    });

    it('ending a paused visit is on record against whoever raised it, so one coordinator can decide credits', async () => {
      await raise(beneficiary);
      await service.endVisit(
        'org',
        alerts[0]!.id,
        coordinator,
        'Visit not safe',
        undefined,
        minutesAfterStart(45),
      );
      expect(visit.status).toBe(VolunteerAssignmentStatus.COMPLETED);
      expect(visit.reportedMinutes).toBe(20);
      expect(visit.reviewRequestedByUserId).toBe('u-beneficiary');
      expect(alerts[0]!.outcome).toBe(SafetyAlertOutcome.ENDED);
    });

    it('cannot close an alert while the visit is still paused', async () => {
      await raise(volunteer);
      await expect(
        service.closeAlert('org', alerts[0]!.id, coordinator, 'Done'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('closes the alert once the visit has ended', async () => {
      await raise(volunteer, SafetyAlertAction.END);
      await service.closeAlert('org', alerts[0]!.id, coordinator, 'Spoke to both');
      expect(alerts[0]!.status).toBe(SafetyAlertStatus.RESOLVED);
      expect(alerts[0]!.staffNotes).toBe('Spoke to both');
    });
  });
});

describe('safety pause time', () => {
  const visit = (over = {}) =>
    ({ startedAt: START, pausedAt: null, pausedSeconds: 0, ...over }) as VolunteerAssignment;

  it('counts a pause still running', () => {
    expect(pausedSecondsAt(visit({ pausedAt: minutesAfterStart(10) }), minutesAfterStart(15))).toBe(
      300,
    );
  });

  it('adds earlier pauses', () => {
    expect(workedMinutes(visit({ pausedSeconds: 600 }), minutesAfterStart(30))).toBe(20);
  });

  it('is never below one minute', () => {
    expect(workedMinutes(visit(), START)).toBe(1);
  });
});

describe('what members can see', () => {
  const ended = {
    status: VolunteerAssignmentStatus.COMPLETED,
    reviewReason: AssignmentReviewReason.SAFETY_ALERT,
    reviewRequestedAt: START,
  };

  it('shows a paused stage on a paused visit', () => {
    expect(
      visitStage(ServiceRequestStatus.IN_PROGRESS, [
        { status: VolunteerAssignmentStatus.IN_PROGRESS, pausedAt: START } as never,
      ]),
    ).toBe('SAFETY_PAUSED');
  });

  it('says a visit ended early but not that a safety alert ended it', () => {
    const request = {
      status: ServiceRequestStatus.IN_PROGRESS,
      assignments: [{ id: 'a', ...ended }],
    } as never;
    const member = toRequestView(request, false).assignments![0]!;
    expect(member.reviewReason).toBeNull();
    expect(member.endedEarly).toBe(true);
    expect(toRequestView(request, true).assignments![0]!.reviewReason).toBe(
      AssignmentReviewReason.SAFETY_ALERT,
    );
  });

  it('reports nothing on an ordinary visit', () => {
    expect(safetyState({ pausedAt: null, restartAllowedAt: null, reviewReason: null })).toEqual({
      safetyPaused: false,
      restartAllowed: false,
      endedEarly: false,
    });
  });
});
