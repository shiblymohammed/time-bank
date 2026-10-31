import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { VolunteerAssignmentStatus } from '@ktb/shared-types';
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
