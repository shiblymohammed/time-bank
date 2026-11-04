import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { AppealStatus, AppealSubjectType } from '@ktb/shared-types';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../identity/entities/user.entity';

/** Appeal against a suspension, ban, or adverse decision. Super Admin is final authority (FR-SAFE-04, D#77, D#78, BR-11). */
@Entity('appeals')
export class Appeal {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'organization_id' }) organization?: Organization;

  @Column({ name: 'appellant_user_id', type: 'uuid' }) appellantUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'appellant_user_id' }) appellantUser?: User;

  @Column({ name: 'subject_type', type: 'varchar', length: 30 }) subjectType!: AppealSubjectType;
  @Column({ name: 'subject_reference_id', type: 'uuid' }) subjectReferenceId!: string;

  @Column({ type: 'text' }) grounds!: string;
  @Column({ type: 'varchar', length: 30, default: AppealStatus.SUBMITTED }) status!: AppealStatus;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true }) reviewedByUserId?: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'reviewed_by_user_id' }) reviewedByUser?: User | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true }) reviewedAt?: Date | null;
  @Column({ name: 'outcome_notes', type: 'text', nullable: true }) outcomeNotes?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
