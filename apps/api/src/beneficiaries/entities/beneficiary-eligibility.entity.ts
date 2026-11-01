import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { BeneficiaryEligibilityStatus, BeneficiaryEligibilityType } from '@ktb/shared-types';
import { Organization } from '../../organizations/entities/organization.entity';
import { OrganizationMembership } from '../../memberships/entities/organization-membership.entity';
import { User } from '../../identity/entities/user.entity';

/**
 * BeneficiaryEligibility Entity (Organization Tenant Domain)
 * Tracks beneficiary eligibility, ongoing/temporary review dates, and quotas (D#24, D#25, D#26).
 */
@Entity('beneficiary_eligibilities')
@Unique('uq_beneficiary_eligibility', ['organizationId', 'membershipId'])
export class BeneficiaryEligibility {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'membership_id' })
  membership?: OrganizationMembership;

  @Column({
    name: 'eligibility_type',
    type: 'varchar',
    length: 30,
    default: BeneficiaryEligibilityType.ONGOING,
  })
  eligibilityType!: BeneficiaryEligibilityType;

  @Column({
    type: 'varchar',
    length: 30,
    default: BeneficiaryEligibilityStatus.ACTIVE,
  })
  status!: BeneficiaryEligibilityStatus;

  @Column({
    name: 'approved_assistance_categories',
    type: 'jsonb',
    default: '["*"]',
  })
  approvedAssistanceCategories!: string[];

  @Column({ name: 'review_due_at', type: 'timestamptz' })
  reviewDueAt!: Date;

  @Column({ name: 'approved_by_user_id', type: 'uuid' })
  approvedByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'approved_by_user_id' })
  approver?: User;

  @Column({ name: 'approved_at', type: 'timestamptz', default: () => 'NOW()' })
  approvedAt!: Date;

  @Column({ name: 'monthly_request_quota', type: 'int', default: 8 })
  monthlyRequestQuota!: number;

  @Column({ name: 'quota_override_reason', type: 'text', nullable: true })
  quotaOverrideReason?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
