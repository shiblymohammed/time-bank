import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AppealKind, AppealOutcome, AppealStatus, ComplaintLevel } from '@ktb/shared-types';
import { AccountClosure } from '../../closures/entities/account-closure.entity';
import { Complaint } from '../../complaints/entities/complaint.entity';
import { User } from '../../identity/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { RestrictionCase } from './restriction-case.entity';

/** A challenge to a restriction, a closure or a complaint's outcome, heard by someone who did not decide it. */
@Entity('appeals')
export class Appeal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  reference!: string;

  @Column({ type: 'varchar', length: 20 })
  kind!: AppealKind;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId?: string | null;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization | null;

  @Column({ name: 'restriction_case_id', type: 'uuid', nullable: true })
  restrictionCaseId?: string | null;

  @ManyToOne(() => RestrictionCase, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'restriction_case_id' })
  restrictionCase?: RestrictionCase | null;

  @Column({ name: 'closure_id', type: 'uuid', nullable: true })
  closureId?: string | null;

  @ManyToOne(() => AccountClosure, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'closure_id' })
  closure?: AccountClosure | null;

  @Column({ name: 'complaint_id', type: 'uuid', nullable: true })
  complaintId?: string | null;

  @ManyToOne(() => Complaint, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'complaint_id' })
  complaint?: Complaint | null;

  @Column({ name: 'appellant_user_id', type: 'uuid' })
  appellantUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'appellant_user_id' })
  appellant?: User;

  /** Not the appellant when staff filed it for someone who does not use the app. */
  @Column({ name: 'filed_by_user_id', type: 'uuid' })
  filedByUserId!: string;

  @Column({ name: 'original_decider_user_id', type: 'uuid', nullable: true })
  originalDeciderUserId?: string | null;

  @Column({ type: 'varchar', length: 20 })
  level!: ComplaintLevel;

  @Column({ type: 'varchar', length: 20, default: AppealStatus.OPEN })
  status!: AppealStatus;

  @Column({ type: 'text' })
  grounds!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  outcome?: AppealOutcome | null;

  @Column({ name: 'staff_notes', type: 'text', nullable: true })
  staffNotes?: string | null;

  @Column({ name: 'member_message', type: 'text', nullable: true })
  memberMessage?: string | null;

  @Column({ name: 'decided_by_user_id', type: 'uuid', nullable: true })
  decidedByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'decided_by_user_id' })
  decidedBy?: User | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt?: Date | null;

  @Column({ name: 'client_operation_id', type: 'varchar', length: 100, nullable: true })
  clientOperationId?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
