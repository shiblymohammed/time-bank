import { EntityManager } from 'typeorm';
import { VolunteerAssignmentStatus } from '@ktb/shared-types';
import { VolunteerAssignment } from './entities/volunteer-assignment.entity';

/** An accepted volunteer who has not started this long after the start time missed the visit. */
export const NO_SHOW_GRACE_MINUTES = 30;
/** A request nobody took up closes this long after its start time. */
export const UNFILLED_GRACE_MINUTES = 120;
/** A volunteer still working this long past the expected duration is reminded to finish. */
export const FINISH_REMINDER_GRACE_MINUTES = 60;

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

export const awaitingReview = (assignment: VolunteerAssignment): boolean =>
  Boolean(assignment.reviewRequestedAt) && !assignment.reviewResolvedAt;
