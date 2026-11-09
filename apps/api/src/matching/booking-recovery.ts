import { EntityManager } from 'typeorm';
import { VolunteerAssignmentStatus } from '@ktb/shared-types';
import { VolunteerAssignment } from './entities/volunteer-assignment.entity';

/** An accepted volunteer who has not started this long after the start time missed the visit. */
export const NO_SHOW_GRACE_MINUTES = 30;
/** A request nobody took up closes this long after its start time. */
export const UNFILLED_GRACE_MINUTES = 120;
/** A volunteer still working this long past the expected duration is reminded to finish. */
export const FINISH_REMINDER_GRACE_MINUTES = 60;
/**
 * After one team member presses Finish, how long to wait before calling the team short.
 * Teammates usually finish within minutes of each other. Leaving early alerts straight away.
 */
export const TEAM_FINISH_WAIT_MINUTES = 10;

/** Help still due, under way, or waiting for a confirmation or a coordinator's decision. */
export function openHelpCount(manager: EntityManager, requestId: string): Promise<number> {
  return manager
    .getRepository(VolunteerAssignment)
    .createQueryBuilder('a')
    .where('a.serviceRequestId = :id', { id: requestId })
    .andWhere('(a.status IN (:...active) OR (a.status = :done AND a.confirmedAt IS NULL))', {
      active: [VolunteerAssignmentStatus.ACCEPTED, VolunteerAssignmentStatus.IN_PROGRESS],
      done: VolunteerAssignmentStatus.COMPLETED,
    })
    .getCount();
}

/** All the time this visit has spent paused, including a pause still running. */
export function pausedSecondsAt(
  visit: Pick<VolunteerAssignment, 'pausedAt' | 'pausedSeconds'>,
  now: Date,
): number {
  const running = visit.pausedAt
    ? Math.round((now.getTime() - new Date(visit.pausedAt).getTime()) / 1000)
    : 0;
  return (visit.pausedSeconds ?? 0) + Math.max(0, running);
}

/** Whole minutes on the clock up to [end], at least one, leaving out any safety pause. */
export function workedMinutes(
  visit: Pick<VolunteerAssignment, 'startedAt' | 'pausedAt' | 'pausedSeconds'>,
  end: Date,
): number {
  const seconds =
    (end.getTime() - new Date(visit.startedAt!).getTime()) / 1000 - pausedSecondsAt(visit, end);
  return Math.max(1, Math.ceil(seconds / 60));
}

export const awaitingReview = (assignment: VolunteerAssignment): boolean =>
  Boolean(assignment.reviewRequestedAt) && !assignment.reviewResolvedAt;
