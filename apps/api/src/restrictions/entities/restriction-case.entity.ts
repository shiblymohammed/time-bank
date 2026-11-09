import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ComplaintLevel,
  GlobalRestrictionType,
  RestrictionCaseStatus,
  RestrictionScope,
} from '@ktb/shared-types';
import { Complaint } from '../../complaints/entities/complaint.entity';
import { GlobalAccountRestriction } from '../../identity/entities/global-account-restriction.entity';
import { User } from '../../identity/entities/user.entity';
import { OrganizationMembership } from '../../memberships/entities/organization-membership.entity';
import { Organization } from '../../organizations/entities/organization.entity';

/** Who recommended a suspension or ban, who decided it, and why. Staff only, except memberMessage. */
@Entity('restriction_cases')
export class RestrictionCase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  reference!: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId?: string | null;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ name: 'subject_user_id', type: 'uuid' })
  subjectUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subject_user_id' })
  subject?: User;

  @Column({ name: 'subject_membership_id', type: 'uuid', nullable: true })
  subjectMembershipId?: string | null;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'subject_membership_id' })
  subjectMembership?: OrganizationMembership | null;

  @Column({ name: 'restriction_type', type: 'varchar', length: 50 })
  restrictionType!: GlobalRestrictionType;

  /** Chosen by whoever decides. Empty until then. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  scope?: RestrictionScope | null;

  /** The lowest level that may read this, set by the person's own standing. */
  @Column({ type: 'varchar', length: 20 })
  level!: ComplaintLevel;

  @Column({ type: 'varchar', length: 20, default: RestrictionCaseStatus.RECOMMENDED })
  status!: RestrictionCaseStatus;

  /** Staff only: the reason and evidence. */
  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'complaint_id', type: 'uuid', nullable: true })
  complaintId?: string | null;

  @ManyToOne(() => Complaint, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'complaint_id' })
  complaint?: Complaint | null;

  @Column({ name: 'recommended_by_user_id', type: 'uuid' })
  recommendedByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recommended_by_user_id' })
  recommendedBy?: User;

  /** The only words the restricted person sees. */
  @Column({ name: 'member_message', type: 'text', nullable: true })
  memberMessage?: string | null;

  @Column({ name: 'decided_by_user_id', type: 'uuid', nullable: true })
  decidedByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'decided_by_user_id' })
  decidedBy?: User | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt?: Date | null;

  @Column({ name: 'restriction_id', type: 'uuid', nullable: true })
  restrictionId?: string | null;

  @ManyToOne(() => GlobalAccountRestriction, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'restriction_id' })
  restriction?: GlobalAccountRestriction | null;

  /** Staff are reminded on this date. Access never returns because of it (D#81). */
  @Column({ name: 'review_on', type: 'timestamptz', nullable: true })
  reviewOn?: Date | null;

  @Column({ name: 'review_notified_at', type: 'timestamptz', nullable: true })
  reviewNotifiedAt?: Date | null;

  @Column({ name: 'reinstatement_recommended_by_user_id', type: 'uuid', nullable: true })
  reinstatementRecommendedByUserId?: string | null;

  @Column({ name: 'reinstatement_recommended_at', type: 'timestamptz', nullable: true })
  reinstatementRecommendedAt?: Date | null;

  @Column({ name: 'ended_by_user_id', type: 'uuid', nullable: true })
  endedByUserId?: string | null;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt?: Date | null;

  @Column({ name: 'client_operation_id', type: 'varchar', length: 100, nullable: true })
  clientOperationId?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
