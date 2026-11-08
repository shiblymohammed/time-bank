import { ServiceRequestStatus, VolunteerAssignmentStatus } from '@ktb/shared-types';
import { toRequestView, visitStage } from './request-view';

describe('visitStage', () => {
  const visit = (status: VolunteerAssignmentStatus, extra: Record<string, Date | null> = {}) => ({
    status,
    confirmedAt: null,
    reviewRequestedAt: null,
    reviewResolvedAt: null,
    ...extra,
  });
  const started = ServiceRequestStatus.IN_PROGRESS;

  it('says nothing while the volunteer is still working', () => {
    expect(visitStage(started, [visit(VolunteerAssignmentStatus.IN_PROGRESS)])).toBeNull();
  });

  it('waits for confirmation once the volunteer has finished', () => {
    expect(visitStage(started, [visit(VolunteerAssignmentStatus.COMPLETED)])).toBe(
      'AWAITING_CONFIRMATION',
    );
  });

  it('shows a coordinator has the visit while a review is open', () => {
    expect(
      visitStage(started, [
        visit(VolunteerAssignmentStatus.COMPLETED, { reviewRequestedAt: new Date() }),
      ]),
    ).toBe('UNDER_REVIEW');
  });

  it('waits for the last volunteer of a team before asking to confirm', () => {
    expect(
      visitStage(started, [
        visit(VolunteerAssignmentStatus.COMPLETED),
        visit(VolunteerAssignmentStatus.IN_PROGRESS),
      ]),
    ).toBeNull();
  });

  it('only applies to started requests', () => {
    expect(
      visitStage(ServiceRequestStatus.COMPLETED, [visit(VolunteerAssignmentStatus.COMPLETED)]),
    ).toBeNull();
  });
});

describe('toRequestView contact sharing', () => {
  const person = { fullName: 'Asha Menon', phoneE164: '+919800000001' };
  const request = (status: VolunteerAssignmentStatus) =>
    ({
      id: 'req-1',
      status: ServiceRequestStatus.FULLY_MATCHED,
      beneficiaryMembership: { id: 'm-b', membershipNumber: 'KTB-1', user: { fullName: 'Ravi K' } },
      assignments: [
        {
          id: 'a-1',
          volunteerMembershipId: 'm-v',
          status,
          volunteerMembership: { membershipNumber: 'KTB-2', user: person },
        },
      ],
    }) as never;

  it('shows the volunteer name and phone while the visit is booked', () => {
    const view = toRequestView(request(VolunteerAssignmentStatus.ACCEPTED), false) as any;
    expect(view.beneficiaryMembership.fullName).toBe('Ravi K');
    expect(view.assignments[0].volunteer).toEqual({
      fullName: 'Asha Menon',
      membershipNumber: 'KTB-2',
      phoneE164: '+919800000001',
    });
  });

  it('stops sharing the phone once the visit is finished', () => {
    const view = toRequestView(request(VolunteerAssignmentStatus.COMPLETED), false) as any;
    expect(view.assignments[0].volunteer.fullName).toBe('Asha Menon');
    expect(view.assignments[0].volunteer.phoneE164).toBeNull();
  });

  it('lets staff see the phone at any stage', () => {
    const view = toRequestView(request(VolunteerAssignmentStatus.COMPLETED), true) as any;
    expect(view.assignments[0].volunteer.phoneE164).toBe('+919800000001');
  });
});
