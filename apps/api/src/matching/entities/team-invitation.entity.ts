import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TeamInvitationStatus } from '@ktb/shared-types';
import { Organization } from '../../organizations/entities/organization.entity';
import { ServiceRequest } from '../../requests/entities/service-request.entity';
import { OrganizationMembership } from '../../memberships/entities/organization-membership.entity';
import { VolunteerAssignment } from './volunteer-assignment.entity';

/**
 * TeamInvitation Entity (Milestone 5, FR-TEAM-02, D#65).
 *
 * An accepted volunteer on a multi-volunteer request invites a teammate from
 * the same organization to fill a remaining slot. The invitation bypasses the
 * matching engine and creates an ACCEPTED assignment directly when the invitee
 * accepts — no OFFERED round is needed.
 */
@Entity('team_invitations')
export class TeamInvitation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'service_request_id', type: 'uuid' })
  serviceRequestId!: string;

  @ManyToOne(() => ServiceRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_request_id' })
  serviceRequest?: ServiceRequest;

  @Column({ name: 'inviter_membership_id', type: 'uuid' })
  inviterMembershipId!: string;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'inviter_membership_id' })
  inviterMembership?: OrganizationMembership;

  @Column({ name: 'invitee_membership_id', type: 'uuid' })
  inviteeMembershipId!: string;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'invitee_membership_id' })
  inviteeMembership?: OrganizationMembership;

  @Column({ name: 'slot_number', type: 'int' })
  slotNumber!: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: TeamInvitationStatus.PENDING,
  })
  status!: TeamInvitationStatus;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt?: Date | null;

  @Column({ name: 'declined_at', type: 'timestamptz', nullable: true })
  declinedAt?: Date | null;

  @Column({ name: 'decline_reason', type: 'text', nullable: true })
  declineReason?: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt?: Date | null;

  @Column({ name: 'resulting_assignment_id', type: 'uuid', nullable: true })
  resultingAssignmentId?: string | null;

  @ManyToOne(() => VolunteerAssignment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'resulting_assignment_id' })
  resultingAssignment?: VolunteerAssignment | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
