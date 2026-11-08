import { ServiceRequestStatus, VolunteerAssignmentStatus } from '@ktb/shared-types';
import type { VolunteerAssignment } from '../matching/entities/volunteer-assignment.entity';
import type { ServiceRequest } from './entities/service-request.entity';

/** While a visit is booked or under way, both sides may call each other. */
export const VISIT_CONTACT_STATUSES = [
  VolunteerAssignmentStatus.ACCEPTED,
  VolunteerAssignmentStatus.IN_PROGRESS,
];

const HELP_DELIVERY_STATUSES = [
  VolunteerAssignmentStatus.ACCEPTED,
  VolunteerAssignmentStatus.IN_PROGRESS,
  VolunteerAssignmentStatus.COMPLETED,
];

/** Where a started visit stands once the volunteer has stopped working. */
export type VisitStage = 'AWAITING_CONFIRMATION' | 'UNDER_REVIEW';

/**
 * A request stays IN_PROGRESS until the help is confirmed. Once no volunteer is still
 * working, the visit is either waiting for confirmation or with a coordinator.
 */
export function visitStage(
  status: ServiceRequestStatus,
  assignments: Pick<
    VolunteerAssignment,
    'status' | 'confirmedAt' | 'reviewRequestedAt' | 'reviewResolvedAt'
  >[] = [],
): VisitStage | null {
  if (status !== ServiceRequestStatus.IN_PROGRESS) return null;
  if (assignments.some((a) => a.status === VolunteerAssignmentStatus.IN_PROGRESS)) return null;
  const finished = assignments.filter(
    (a) => a.status === VolunteerAssignmentStatus.COMPLETED && !a.confirmedAt,
  );
  if (finished.some((a) => a.reviewRequestedAt && !a.reviewResolvedAt)) return 'UNDER_REVIEW';
  return finished.length > 0 ? 'AWAITING_CONFIRMATION' : null;
}

/**
 * What a request reader may see. Member records stay out: they hold phone numbers and
 * application answers. Only staff see offers nobody took up.
 */
export function toRequestView(
  request: ServiceRequest,
  isStaff: boolean,
  stageAssignments: VolunteerAssignment[] | undefined = request.assignments,
) {
  const { beneficiaryMembership, assignments, ...details } = request;
  return {
    ...details,
    stage: visitStage(request.status, stageAssignments),
    beneficiaryMembership: beneficiaryMembership
      ? {
          id: beneficiaryMembership.id,
          membershipNumber: beneficiaryMembership.membershipNumber ?? null,
          fullName: beneficiaryMembership.user?.fullName ?? null,
        }
      : undefined,
    assignments: assignments
      ?.filter((assignment) => isStaff || HELP_DELIVERY_STATUSES.includes(assignment.status))
      .map((assignment) => ({
        id: assignment.id,
        volunteerMembershipId: assignment.volunteerMembershipId,
        // Who is coming: a name and membership number, and a phone number only while the visit
        // is booked or under way (staff always).
        volunteer: assignment.volunteerMembership
          ? {
              fullName: assignment.volunteerMembership.user?.fullName ?? null,
              membershipNumber: assignment.volunteerMembership.membershipNumber ?? null,
              phoneE164:
                isStaff || VISIT_CONTACT_STATUSES.includes(assignment.status)
                  ? (assignment.volunteerMembership.user?.phoneE164 ?? null)
                  : null,
            }
          : null,
        status: assignment.status,
        slotNumber: assignment.slotNumber,
        acceptedAt: assignment.acceptedAt ?? null,
        startedAt: assignment.startedAt ?? null,
        finishedAt: assignment.finishedAt ?? null,
        reportedMinutes: assignment.reportedMinutes ?? null,
        completionNotes: assignment.completionNotes ?? null,
        confirmedAt: assignment.confirmedAt ?? null,
        confirmedMinutes: assignment.confirmedMinutes ?? null,
        reviewReason: assignment.reviewReason ?? null,
        reviewRequestedAt: assignment.reviewRequestedAt ?? null,
        reviewResolvedAt: assignment.reviewResolvedAt ?? null,
        reviewOutcome: assignment.reviewOutcome ?? null,
      })),
  };
}

export type ServiceRequestView = ReturnType<typeof toRequestView>;
