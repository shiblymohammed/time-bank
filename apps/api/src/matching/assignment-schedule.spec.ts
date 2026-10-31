import { assignmentSchedule } from './assignment-schedule';
import { VolunteerAssignment } from './entities/volunteer-assignment.entity';
import { RequestRescheduleHistory } from '../requests/entities/request-reschedule.entity';

describe('Assignment schedule history', () => {
  const first = {
    createdAt: new Date('2030-01-01T09:00:00Z'),
    previousStartTime: new Date('2030-01-02T10:00:00Z'),
    newStartTime: new Date('2030-01-03T10:00:00Z'),
  } as RequestRescheduleHistory;
  const second = {
    createdAt: new Date('2030-01-01T12:00:00Z'),
    previousStartTime: first.newStartTime,
    newStartTime: new Date('2030-01-04T10:00:00Z'),
  } as RequestRescheduleHistory;
  const assignment = (offeredAt: string, reschedule?: RequestRescheduleHistory) =>
    ({
      offeredAt: new Date(offeredAt),
      reschedule,
      serviceRequest: { scheduledStartTime: second.newStartTime, reschedules: [second, first] },
    }) as VolunteerAssignment;

  it('preserves the initial offer time after multiple reschedules', () => {
    expect(assignmentSchedule(assignment('2030-01-01T08:00:00Z'))).toEqual(first.previousStartTime);
  });
  it('preserves a linked confirmation time after a later reschedule', () => {
    expect(assignmentSchedule(assignment('2030-01-01T10:00:00Z', first))).toEqual(
      first.newStartTime,
    );
  });
  it('reconstructs older unlinked offers from an unordered change timeline', () => {
    expect(assignmentSchedule(assignment('2030-01-01T10:00:00Z'))).toEqual(first.newStartTime);
    expect(assignmentSchedule(assignment('2030-01-01T13:00:00Z'))).toEqual(second.newStartTime);
  });
  it('uses the current schedule only when there is no change history', () => {
    expect(assignmentSchedule(assignment('2030-01-01T08:00:00Z'), [])).toEqual(second.newStartTime);
    expect(assignmentSchedule({} as VolunteerAssignment)).toBeNull();
  });
});
