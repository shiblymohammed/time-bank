import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClosureEvidenceType, ClosureKind, ClosureStatus, ComplaintLevel } from '@ktb/shared-types';
import { User } from '../../identity/entities/user.entity';
import { OrganizationMembership } from '../../memberships/entities/organization-membership.entity';
import { Organization } from '../../organizations/entities/organization.entity';

/** What to put back if a closure turns out to be wrong. */
export type ClosureRestoreState = {
  userStatus: string;
  walletStatus: string | null;
  memberships: { id: string; status: string }[];
  documentFingerprint: string | null;
};

const credits = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
};

/** A death or a duplicate: who reported it, who decided, and any credits that moved. */
@Entity('account_closures')
export class AccountClosure {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  reference!: string;

  @Column({ type: 'varchar', length: 20 })
  kind!: ClosureKind;

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

  @Column({ name: 'primary_user_id', type: 'uuid', nullable: true })
  primaryUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'primary_user_id' })
  primary?: User | null;

  @Column({ type: 'varchar', length: 20 })
  level!: ComplaintLevel;

  /** The person belongs to several communities, so no one community's administrator decides. */
  @Column({ name: 'needs_super_admin', type: 'boolean', default: false })
  needsSuperAdmin!: boolean;

  @Column({ type: 'varchar', length: 20, default: ClosureStatus.REPORTED })
  status!: ClosureStatus;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'date_of_death', type: 'date', nullable: true })
  dateOfDeath?: string | null;

  @Column({ name: 'evidence_type', type: 'varchar', length: 30, nullable: true })
  evidenceType?: ClosureEvidenceType | null;

  @Column({ name: 'evidence_last4', type: 'varchar', length: 4, nullable: true })
  evidenceLast4?: string | null;

  @Column({ name: 'member_message', type: 'text', nullable: true })
  memberMessage?: string | null;

  @Column({ name: 'reported_by_user_id', type: 'uuid' })
  reportedByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reported_by_user_id' })
  reportedBy?: User;

  @Column({ name: 'decided_by_user_id', type: 'uuid', nullable: true })
  decidedByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'decided_by_user_id' })
  decidedBy?: User | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt?: Date | null;

  @Column({ name: 'restore_state', type: 'jsonb', nullable: true })
  restoreState?: ClosureRestoreState | null;

  @Column({ name: 'nominee_under_review', type: 'boolean', default: false })
  nomineeUnderReview!: boolean;

  @Column({ name: 'receiver_user_id', type: 'uuid', nullable: true })
  receiverUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'receiver_user_id' })
  receiver?: User | null;

  @Column({ name: 'transfer_recommended_by_user_id', type: 'uuid', nullable: true })
  transferRecommendedByUserId?: string | null;

  @Column({ name: 'transfer_recommended_at', type: 'timestamptz', nullable: true })
  transferRecommendedAt?: Date | null;

  @Column({
    name: 'transferred_credits',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: credits,
  })
  transferredCredits!: number;

  @Column({ name: 'last_transferred_at', type: 'timestamptz', nullable: true })
  lastTransferredAt?: Date | null;

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
