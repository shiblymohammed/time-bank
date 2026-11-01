import type { VolunteerAssignment } from './entities/volunteer-assignment.entity';
import type { RequestRescheduleHistory } from '../requests/entities/request-reschedule.entity';

// An assignment belongs to the schedule offered at its creation, even after the
// request moves again. The history fallback also supports older, unlinked rows.
export function assignmentSchedule(
  assignment: VolunteerAssignment,
  history: RequestRescheduleHistory[] = assignment.serviceRequest?.reschedules ?? [],
): Date | null {
  if (assignment.reschedule) return assignment.reschedule.newStartTime;
  const changes = [...history].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  if (!changes.length) return assignment.serviceRequest?.scheduledStartTime ?? null;
  const offered = new Date(assignment.offeredAt).getTime();
  if (!Number.isFinite(offered)) return null;
  const preceding = changes.filter((change) => new Date(change.createdAt).getTime() < offered);
  return preceding.length
    ? preceding[preceding.length - 1]!.newStartTime
    : changes[0]!.previousStartTime;
}
