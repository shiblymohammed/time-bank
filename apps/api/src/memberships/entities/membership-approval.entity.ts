import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MembershipApprovalAction } from '@ktb/shared-types';
import { OrganizationMembership } from './organization-membership.entity';

/**
 * Membership Approval Audit Record Entity
 * Captures decision history, reviewer, action, and notes (Section 3, Section 10).
 */
@Entity('membership_approvals')
export class MembershipApproval {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ManyToOne(() => OrganizationMembership, (m) => m.approvals)
  @JoinColumn({ name: 'membership_id' })
  membership!: OrganizationMembership;

  @Column({
    type: 'varchar',
    length: 50,
  })
  action!: MembershipApprovalAction;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
