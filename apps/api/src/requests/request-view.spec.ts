import { ServiceRequestStatus, VolunteerAssignmentStatus } from '@ktb/shared-types';
import { visitStage } from './request-view';

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
