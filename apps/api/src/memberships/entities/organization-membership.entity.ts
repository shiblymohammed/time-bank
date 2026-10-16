import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Unique,
} from 'typeorm';
import { MembershipStatus } from '@ktb/shared-types';
import { User } from '../../identity/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { MembershipRoleGrant } from './membership-role-grant.entity';
import { MembershipApproval } from './membership-approval.entity';

/**
 * Organization Membership Entity
 * Connects a global user to an organization with independent approval status (ITB-005, ITB-007).
 */
@Entity('organization_memberships')
@Unique(['organizationId', 'userId'])
export class OrganizationMembership {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, (org) => org.memberships)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.memberships)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'membership_number', type: 'varchar', length: 50, nullable: true })
  membershipNumber?: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: MembershipStatus.APPLIED,
  })
  status!: MembershipStatus;

  @CreateDateColumn({ name: 'applied_at', type: 'timestamptz' })
  appliedAt!: Date;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string | null;

  @OneToMany(() => MembershipRoleGrant, (grant) => grant.membership)
  roleGrants!: MembershipRoleGrant[];

  @OneToMany(() => MembershipApproval, (approval) => approval.membership)
  approvals!: MembershipApproval[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
