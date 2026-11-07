import { VolunteerAssignmentStatus } from '@ktb/shared-types';
import type { ServiceRequest } from './entities/service-request.entity';

const HELP_DELIVERY_STATUSES = [
  VolunteerAssignmentStatus.ACCEPTED,
  VolunteerAssignmentStatus.IN_PROGRESS,
  VolunteerAssignmentStatus.COMPLETED,
];

/**
 * What a request reader may see. Member records stay out: they hold phone numbers and
 * application answers. Only staff see offers nobody took up.
 */
export function toRequestView(request: ServiceRequest, isStaff: boolean) {
  const { beneficiaryMembership, assignments, ...details } = request;
  return {
    ...details,
    beneficiaryMembership: beneficiaryMembership
      ? {
          id: beneficiaryMembership.id,
          membershipNumber: beneficiaryMembership.membershipNumber ?? null,
        }
      : undefined,
    assignments: assignments
      ?.filter((assignment) => isStaff || HELP_DELIVERY_STATUSES.includes(assignment.status))
      .map((assignment) => ({
        id: assignment.id,
        volunteerMembershipId: assignment.volunteerMembershipId,
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
