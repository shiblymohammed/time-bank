import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserRole, RoleGrantStatus } from '@ktb/shared-types';
import { OrganizationMembership } from './organization-membership.entity';

/**
 * Membership Role Grant Entity
 * Binds an authorized role to a specific organization membership (ITB-006, D#2).
 */
@Entity('membership_role_grants')
export class MembershipRoleGrant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ManyToOne(() => OrganizationMembership, (m) => m.roleGrants)
  @JoinColumn({ name: 'membership_id' })
  membership!: OrganizationMembership;

  @Column({
    type: 'varchar',
    length: 50,
  })
  role!: UserRole;

  @Column({
    type: 'varchar',
    length: 30,
    default: RoleGrantStatus.ACTIVE,
  })
  status!: RoleGrantStatus;

  @CreateDateColumn({ name: 'granted_at', type: 'timestamptz' })
  grantedAt!: Date;

  @Column({ name: 'granted_by', type: 'uuid' })
  grantedBy!: string;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date | null;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy?: string | null;

  @Column({ name: 'revocation_reason', type: 'text', nullable: true })
  revocationReason?: string | null;
}
