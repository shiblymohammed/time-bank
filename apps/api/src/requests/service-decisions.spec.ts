import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  AssignmentReviewDecision,
  AssignmentReviewReason,
  ServiceRequestStatus,
  UserRole,
  VolunteerAssignmentStatus,
} from '@ktb/shared-types';
import { RequestsService } from './requests.service';
import { ServiceRequest } from './entities/service-request.entity';
import { RequestCancellation } from './entities/request-cancellation.entity';
import { VolunteerAssignment } from '../matching/entities/volunteer-assignment.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';

const START = new Date('2026-06-01T10:00:00Z');
const minutesAfterStart = (minutes: number) => new Date(START.getTime() + minutes * 60_000);
const NOW = minutesAfterStart(120);

const member = (membershipId: string, ...roles: UserRole[]) =>
  ({ membershipId, roles, isSuperAdmin: false }) as any;
const beneficiary = member('beneficiary-membership', UserRole.BENEFICIARY);
const coordinator = member('coordinator-membership', UserRole.COORDINATOR);

describe('Service decisions', () => {
  let request: any;
  let assignment: any;
  let open: number;
  let delivered: number;
  let pairMinutes: number;
  let cancellations: any;
  let ledger: any;
  let notifications: any;
  let caregiverAccess: jest.Mock;
  let service: RequestsService;

  beforeEach(() => {
    request = {
      id: 'request',
      organizationId: 'org',
      requestNumber: 'R-1',
      status: ServiceRequestStatus.IN_PROGRESS,
      beneficiaryMembershipId: 'beneficiary-membership',
      expectedDurationMinutes: 60,
    };
    assignment = {
      id: 'assignment',
      volunteerMembershipId: 'volunteer-membership',
      status: VolunteerAssignmentStatus.COMPLETED,
      startedAt: START,
      finishedAt: minutesAfterStart(60),
      reportedMinutes: 60,
    };
    open = 0;
    delivered = 1;
    pairMinutes = 0;
    cancellations = { create: jest.fn((row) => row), save: jest.fn() };
    ledger = {
      postServiceEarning: jest.fn().mockResolvedValue({ amount: 1, held: false }),
      policyForRequest: jest.fn().mockResolvedValue({}),
    };
    notifications = {
      notifyUsers: jest.fn(),
      notifyMemberships: jest.fn(),
      notifyRequestOwners: jest.fn(),
      notifyCoordinators: jest.fn(),
    };
    caregiverAccess = jest.fn().mockResolvedValue({ id: 'authorization' });

    const repositories = new Map<unknown, unknown>([
      [
        ServiceRequest,
        { findOne: async () => request, save: async (row: unknown) => row },
      ],
      [
        VolunteerAssignment,
        {
          findOne: async () => assignment,
          find: async () => [assignment],
          save: async (row: unknown) => row,
          count: async () => delivered,
          createQueryBuilder: () => {
            const builder = {
              where: () => builder,
              andWhere: () => builder,
              getCount: async () => open,
            };
            return builder;
          },
        },
      ],
      [
        OrganizationMembership,
        { findOne: async () => ({ id: 'volunteer-membership', userId: 'volunteer-user' }) },
      ],
      [RequestCancellation, cancellations],
    ]);
    const manager = {
      query: async () => [{ total: pairMinutes }],
      getRepository: (entity: unknown) => repositories.get(entity),
    };
    const requestRepo = {
      manager: {
        transaction: (_isolation: string, action: (m: unknown) => unknown) => action(manager),
      },
    };
    service = new RequestsService(
      requestRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { verifyCaregiverProxyAccess: caregiverAccess } as any,
      { afterVolunteerStopped: jest.fn() } as any,
      { logEvent: jest.fn() } as any,
      {} as any,
      ledger,
      notifications,
    );
  });

  const confirm = (context = beneficiary, dto = {}, actor = 'beneficiary-user') =>
    service.confirmCompletion('org', 'request', 'assignment', actor, context, dto, undefined, NOW);
  const dispute = () =>
    service.disputeCompletion(
      'org',
      'request',
      'assignment',
      'beneficiary-user',
      beneficiary,
      { reason: 'Nobody came' },
      undefined,
      NOW,
    );
  const resolve = (dto: object, context = coordinator, actor = 'coordinator-user') =>
    service.resolveServiceReview(
      'org',
      'request',
      'assignment',
      actor,
      context,
      { notes: 'Checked with both people', ...dto } as any,
      undefined,
      NOW,
    );

  describe('confirming', () => {
    it('pays an ordinary visit and completes the request', async () => {
      const result = await confirm();

      expect(result.reviewRequired).toBe(false);
      expect(ledger.postServiceEarning).toHaveBeenCalledTimes(1);
      expect(request.status).toBe(ServiceRequestStatus.COMPLETED);
    });

    it('never moves a cancelled request back to completed', async () => {
      request.status = ServiceRequestStatus.CANCELLED;

      await confirm();

      expect(request.status).toBe(ServiceRequestStatus.CANCELLED);
    });

    it('does not pay minutes that were never timed, however willing both people are', async () => {
      assignment.finishedAt = minutesAfterStart(1);

      const result = await confirm();

      expect(result).toMatchObject({ reviewRequired: true, creditsEarned: 0 });
      expect(assignment.reviewReason).toBe(AssignmentReviewReason.MINUTES_OVER_TIMED_WORK);
      expect(ledger.postServiceEarning).not.toHaveBeenCalled();
      expect(notifications.notifyCoordinators).toHaveBeenCalled();
      expect(request.status).toBe(ServiceRequestStatus.IN_PROGRESS);
    });

    it('allows a few minutes of difference from the timer', async () => {
      assignment.finishedAt = minutesAfterStart(52);

      await expect(confirm()).resolves.toMatchObject({ reviewRequired: false });
    });

    it('sends a forgotten Finish to a coordinator', async () => {
      assignment.finishedAt = minutesAfterStart(720);
      assignment.reportedMinutes = 720;

      await confirm();

      expect(assignment.reviewReason).toBe(AssignmentReviewReason.MINUTES_OVER_EXPECTED);
      expect(ledger.postServiceEarning).not.toHaveBeenCalled();
    });

    it('sends a pair past its monthly limit to a coordinator', async () => {
      pairMinutes = 1190;

      await confirm();

      expect(assignment.reviewReason).toBe(AssignmentReviewReason.PAIR_MONTHLY_LIMIT);
    });

    it('lets independent staff confirm without review', async () => {
      assignment.finishedAt = minutesAfterStart(1);

      await expect(confirm(coordinator, {}, 'coordinator-user')).resolves.toMatchObject({
        reviewRequired: false,
      });
    });

    it('applies the rules to staff confirming their own visit', async () => {
      assignment.finishedAt = minutesAfterStart(1);
      const staffBeneficiary = member('beneficiary-membership', UserRole.COORDINATOR);

      await expect(confirm(staffBeneficiary)).resolves.toMatchObject({ reviewRequired: true });
    });

    it('refuses a visit a coordinator is reviewing', async () => {
      assignment.reviewRequestedAt = NOW;

      await expect(confirm()).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('disputing', () => {
    it('holds the credits and tells coordinators', async () => {
      await dispute();

      expect(assignment.reviewReason).toBe(AssignmentReviewReason.BENEFICIARY_DISPUTE);
      expect(assignment.reviewNotes).toBe('Nobody came');
      expect(ledger.postServiceEarning).not.toHaveBeenCalled();
      expect(notifications.notifyCoordinators).toHaveBeenCalled();
      await expect(confirm()).rejects.toBeInstanceOf(ConflictException);
    });

    it('replaces an automatic review, but cannot be sent twice', async () => {
      assignment.reviewRequestedAt = NOW;
      assignment.reviewReason = AssignmentReviewReason.PAIR_MONTHLY_LIMIT;

      await dispute();

      expect(assignment.reviewReason).toBe(AssignmentReviewReason.BENEFICIARY_DISPUTE);
      await expect(dispute()).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a visit that has been paid', async () => {
      assignment.confirmedAt = NOW;

      await expect(dispute()).rejects.toBeInstanceOf(ConflictException);
    });

    it('stops the volunteer disputing or confirming their own visit', async () => {
      await expect(
        confirm(member('volunteer-membership', UserRole.COORDINATOR), {}, 'volunteer-user'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('deciding', () => {
    const inReview = () => {
      assignment.reviewRequestedAt = NOW;
      assignment.reviewRequestedByUserId = 'beneficiary-user';
    };

    it('pays what the member confirmed unless the coordinator says otherwise', async () => {
      inReview();
      assignment.reviewMinutes = 45;

      await resolve({ decision: AssignmentReviewDecision.PAY });

      expect(assignment.confirmedMinutes).toBe(45);
      expect(assignment.reviewOutcome).toBe('PAY');
      expect(ledger.postServiceEarning).toHaveBeenCalledTimes(1);
      expect(request.status).toBe(ServiceRequestStatus.COMPLETED);
    });

    it('rejecting pays nothing and closes the request as cancelled', async () => {
      inReview();
      delivered = 0;

      await resolve({ decision: AssignmentReviewDecision.REJECT });

      expect(assignment.status).toBe(VolunteerAssignmentStatus.NOT_DELIVERED);
      expect(ledger.postServiceEarning).not.toHaveBeenCalled();
      expect(request.status).toBe(ServiceRequestStatus.CANCELLED);
      expect(cancellations.save).toHaveBeenCalledWith(
        expect.objectContaining({ reasonCode: 'SERVICE_NOT_DELIVERED' }),
      );
    });

    it('keeps a request completed when another volunteer delivered', async () => {
      inReview();

      await resolve({ decision: AssignmentReviewDecision.REJECT });

      expect(request.status).toBe(ServiceRequestStatus.COMPLETED);
    });

    it('leaves the request open while another volunteer is still due', async () => {
      inReview();
      open = 1;

      await resolve({ decision: AssignmentReviewDecision.REJECT });

      expect(request.status).toBe(ServiceRequestStatus.IN_PROGRESS);
    });

    it('closes a visit stuck in progress, with minutes to pay', async () => {
      assignment.status = VolunteerAssignmentStatus.IN_PROGRESS;
      assignment.finishedAt = null;
      assignment.reportedMinutes = null;

      await expect(resolve({ decision: AssignmentReviewDecision.PAY })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      await resolve({ decision: AssignmentReviewDecision.PAY, minutes: 30 });

      expect(assignment).toMatchObject({
        status: VolunteerAssignmentStatus.COMPLETED,
        reportedMinutes: 30,
        confirmedMinutes: 30,
      });
    });

    it('cannot pay more than was reported', async () => {
      inReview();

      await expect(
        resolve({ decision: AssignmentReviewDecision.PAY, minutes: 61 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('needs a visit that is actually waiting', async () => {
      await expect(resolve({ decision: AssignmentReviewDecision.PAY })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('is for staff who have no part in the visit', async () => {
      inReview();
      const decide = { decision: AssignmentReviewDecision.PAY };

      await expect(resolve(decide, beneficiary, 'beneficiary-user')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        resolve(decide, member('beneficiary-membership', UserRole.COORDINATOR)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(resolve(decide, coordinator, 'beneficiary-user')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        resolve(decide, member('volunteer-membership', UserRole.COORDINATOR), 'volunteer-user'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('cancelling', () => {
    const cancel = () =>
      service.cancelRequest('org', 'request', 'beneficiary-user', beneficiary, {
        reasonCode: 'CHANGED',
        notes: 'Plans changed',
      });

    it('refuses once a volunteer has done work, whatever the request status says', async () => {
      request.status = ServiceRequestStatus.MATCHING_ACTIVE;

      await expect(cancel()).rejects.toBeInstanceOf(BadRequestException);
      expect(request.status).toBe(ServiceRequestStatus.MATCHING_ACTIVE);
    });

    it('tells an accepted volunteer not to go', async () => {
      request.status = ServiceRequestStatus.FULLY_MATCHED;
      request.scheduledStartTime = START;
      assignment.status = VolunteerAssignmentStatus.ACCEPTED;

      await cancel();

      expect(notifications.notifyMemberships).toHaveBeenCalledWith(
        expect.anything(),
        ['volunteer-membership'],
        expect.objectContaining({ type: 'REQUEST_CANCELLED' }),
      );
    });
  });
});
