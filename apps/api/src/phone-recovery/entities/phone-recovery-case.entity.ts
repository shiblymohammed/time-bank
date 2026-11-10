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
  PhoneRecoveryDocumentResult,
  PhoneRecoveryStatus,
} from '@ktb/shared-types';
import { User } from '../../identity/entities/user.entity';
import { OrganizationMembership } from '../../memberships/entities/organization-membership.entity';
import { Organization } from '../../organizations/entities/organization.entity';

/** A request to move someone's account to a new phone number, and who decided. */
@Entity('phone_recovery_cases')
export class PhoneRecoveryCase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  reference!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'subject_user_id', type: 'uuid' })
  subjectUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subject_user_id' })
  subject?: User;

  @Column({ name: 'subject_membership_id', type: 'uuid' })
  subjectMembershipId!: string;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subject_membership_id' })
  subjectMembership?: OrganizationMembership;

  @Column({ name: 'old_phone', type: 'varchar', length: 20 })
  oldPhone!: string;

  @Column({ name: 'new_phone', type: 'varchar', length: 20 })
  newPhone!: string;

  @Column({ type: 'varchar', length: 20 })
  level!: ComplaintLevel;

  /** Several communities, or a document that did not match: no one community's administrator decides. */
  @Column({ name: 'needs_super_admin', type: 'boolean', default: false })
  needsSuperAdmin!: boolean;

  @Column({ type: 'varchar', length: 20, default: PhoneRecoveryStatus.OPENED })
  status!: PhoneRecoveryStatus;

  @Column({ name: 'document_type', type: 'varchar', length: 30 })
  documentType!: string;

  @Column({ name: 'document_last4', type: 'varchar', length: 4 })
  documentLast4!: string;

  @Column({ name: 'document_result', type: 'varchar', length: 20 })
  documentResult!: PhoneRecoveryDocumentResult;

  /** What the coordinator saw and compared. Staff only. */
  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'opened_by_user_id', type: 'uuid' })
  openedByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'opened_by_user_id' })
  openedBy?: User;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt?: Date | null;

  @Column({ name: 'decided_by_user_id', type: 'uuid', nullable: true })
  decidedByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'decided_by_user_id' })
  decidedBy?: User | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt?: Date | null;

  /** The empty account that held the new number, retired by this move. */
  @Column({ name: 'retired_user_id', type: 'uuid', nullable: true })
  retiredUserId?: string | null;

  /** The new number was the member's own nominee's, so that nominee ended. */
  @Column({ name: 'nominee_ended', type: 'boolean', default: false })
  nomineeEnded!: boolean;

  @Column({ name: 'reversed_by_user_id', type: 'uuid', nullable: true })
  reversedByUserId?: string | null;

  @Column({ name: 'reversed_at', type: 'timestamptz', nullable: true })
  reversedAt?: Date | null;

  @Column({ name: 'client_operation_id', type: 'varchar', length: 100, nullable: true })
  clientOperationId?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
