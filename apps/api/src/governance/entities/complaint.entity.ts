import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { ComplaintStatus, ComplaintTargetRole } from '@ktb/shared-types';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../identity/entities/user.entity';

/** Confidential complaint with auto-escalation routing (FR-SAFE-03, D#75, D#76). */
@Entity('complaints')
export class Complaint {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'organization_id' }) organization?: Organization;

  @Column({ name: 'complainant_user_id', type: 'uuid' }) complainantUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'complainant_user_id' }) complainantUser?: User;

  @Column({ name: 'target_user_id', type: 'uuid' }) targetUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'target_user_id' }) targetUser?: User;

  @Column({ name: 'target_role', type: 'varchar', length: 30 }) targetRole!: ComplaintTargetRole;

  @Column({ type: 'varchar', length: 300 }) subject!: string;
  @Column({ type: 'text' }) description!: string;
  @Column({ type: 'varchar', length: 30, default: ComplaintStatus.SUBMITTED }) status!: ComplaintStatus;

  @Column({ name: 'assigned_to_user_id', type: 'uuid', nullable: true }) assignedToUserId?: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'assigned_to_user_id' }) assignedToUser?: User | null;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true }) resolutionNotes?: string | null;
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true }) resolvedAt?: Date | null;

  @Column({ name: 'resolved_by_user_id', type: 'uuid', nullable: true }) resolvedByUserId?: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'resolved_by_user_id' }) resolvedByUser?: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
