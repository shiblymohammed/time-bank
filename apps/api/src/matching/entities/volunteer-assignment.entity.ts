import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AssignmentReviewReason, VolunteerAssignmentStatus } from '@ktb/shared-types';
import { Organization } from '../../organizations/entities/organization.entity';
import { ServiceRequest } from '../../requests/entities/service-request.entity';
import { OrganizationMembership } from '../../memberships/entities/organization-membership.entity';
import { User } from '../../identity/entities/user.entity';
import { MatchingRound } from './matching-round.entity';
import { RequestRescheduleHistory } from '../../requests/entities/request-reschedule.entity';

/**
 * VolunteerAssignment Entity (Organization Tenant Domain)
 * Represents an individual volunteer's allocation to a request position (D#12, D#63, D#64, BR-06).
 */
@Entity('volunteer_assignments')
export class VolunteerAssignment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'service_request_id', type: 'uuid' })
  serviceRequestId!: string;

  @ManyToOne(() => ServiceRequest, (req) => req.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_request_id' })
  serviceRequest?: ServiceRequest;

  @Column({ name: 'volunteer_membership_id', type: 'uuid' })
  volunteerMembershipId!: string;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'volunteer_membership_id' })
  volunteerMembership?: OrganizationMembership;

  @Column({ name: 'matching_round_id', type: 'uuid', nullable: true })
  matchingRoundId?: string | null;

  @ManyToOne(() => MatchingRound, (round) => round.assignments, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'matching_round_id' })
  matchingRound?: MatchingRound | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100, nullable: true })
  idempotencyKey?: string | null;

  @Column({ name: 'reschedule_id', type: 'uuid', nullable: true })
  rescheduleId?: string | null;

  @ManyToOne(() => RequestRescheduleHistory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reschedule_id' })
  reschedule?: RequestRescheduleHistory | null;

  @Column({ name: 'slot_number', type: 'int', default: 1 })
  slotNumber!: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: VolunteerAssignmentStatus.OFFERED,
  })
  status!: VolunteerAssignmentStatus;

  @Column({ name: 'offered_at', type: 'timestamptz', default: () => 'NOW()' })
  offeredAt!: Date;

  @Column({ name: 'offer_expires_at', type: 'timestamptz' })
  offerExpiresAt!: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt?: Date | null;

  @Column({ name: 'declined_at', type: 'timestamptz', nullable: true })
  declinedAt?: Date | null;

  @Column({ name: 'decline_reason', type: 'text', nullable: true })
  declineReason?: string | null;

  @Column({ name: 'withdrawn_at', type: 'timestamptz', nullable: true })
  withdrawnAt?: Date | null;

  @Column({ name: 'withdrawal_reason', type: 'text', nullable: true })
  withdrawalReason?: string | null;

  // Service completion: the volunteer starts and finishes; someone else confirms.
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt?: Date | null;

  @Column({ name: 'reported_minutes', type: 'int', nullable: true })
  reportedMinutes?: number | null;

  @Column({ name: 'completion_notes', type: 'text', nullable: true })
  completionNotes?: string | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt?: Date | null;

  @Column({ name: 'confirmed_by_user_id', type: 'uuid', nullable: true })
  confirmedByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'confirmed_by_user_id' })
  confirmedBy?: User | null;

  @Column({ name: 'confirmed_minutes', type: 'int', nullable: true })
  confirmedMinutes?: number | null;

  @Column({ name: 'finish_reminded_at', type: 'timestamptz', nullable: true })
  finishRemindedAt?: Date | null;

  // Safety pause: the visit stays IN_PROGRESS, and paused time is not counted as time worked.
  @Column({ name: 'paused_at', type: 'timestamptz', nullable: true })
  pausedAt?: Date | null;

  @Column({ name: 'paused_seconds', type: 'int', default: 0 })
  pausedSeconds!: number;

  @Column({ name: 'restart_allowed_at', type: 'timestamptz', nullable: true })
  restartAllowedAt?: Date | null;

  // A coordinator decides these visits; no credits are paid until they do.
  @Column({ name: 'review_reason', type: 'varchar', length: 40, nullable: true })
  reviewReason?: AssignmentReviewReason | null;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes?: string | null;

  /** The minutes the member confirmed before this was sent for review. */
  @Column({ name: 'review_minutes', type: 'int', nullable: true })
  reviewMinutes?: number | null;

  @Column({ name: 'review_requested_at', type: 'timestamptz', nullable: true })
  reviewRequestedAt?: Date | null;

  @Column({ name: 'review_requested_by_user_id', type: 'uuid', nullable: true })
  reviewRequestedByUserId?: string | null;

  @Column({ name: 'review_resolved_at', type: 'timestamptz', nullable: true })
  reviewResolvedAt?: Date | null;

  @Column({ name: 'review_resolved_by_user_id', type: 'uuid', nullable: true })
  reviewResolvedByUserId?: string | null;

  @Column({ name: 'review_outcome', type: 'varchar', length: 20, nullable: true })
  reviewOutcome?: string | null;

  /** A team member is on site and waiting for enough teammates. Timers start together. */
  @Column({ name: 'arrived_at', type: 'timestamptz', nullable: true })
  arrivedAt?: Date | null;

  @Column({ name: 'invited_by_membership_id', type: 'uuid', nullable: true })
  invitedByMembershipId?: string | null;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'invited_by_membership_id' })
  invitedByMembership?: OrganizationMembership | null;

  @Column({ name: 'replaced_by_assignment_id', type: 'uuid', nullable: true })
  replacedByAssignmentId?: string | null;

  @ManyToOne(() => VolunteerAssignment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'replaced_by_assignment_id' })
  replacedByAssignment?: VolunteerAssignment | null;

  @Column({ name: 'assigned_by_coordinator_id', type: 'uuid', nullable: true })
  assignedByCoordinatorId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_by_coordinator_id' })
  assignedByCoordinator?: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
