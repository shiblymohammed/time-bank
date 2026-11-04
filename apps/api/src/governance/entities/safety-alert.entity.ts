import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { SafetyAlertRaisedBy, SafetyAlertStatus } from '@ktb/shared-types';
import { Organization } from '../../organizations/entities/organization.entity';
import { ServiceRequest } from '../../requests/entities/service-request.entity';
import { User } from '../../identity/entities/user.entity';

/** Safety alert raised mid-service by a volunteer, beneficiary, or caregiver (FR-SAFE-01, D#70–D#74). */
@Entity('safety_alerts')
export class SafetyAlert {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'organization_id' }) organization?: Organization;

  @Column({ name: 'service_request_id', type: 'uuid' }) serviceRequestId!: string;
  @ManyToOne(() => ServiceRequest, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'service_request_id' }) serviceRequest?: ServiceRequest;

  @Column({ name: 'raised_by_user_id', type: 'uuid' }) raisedByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'raised_by_user_id' }) raisedByUser?: User;

  @Column({ name: 'raised_by_role', type: 'varchar', length: 20 }) raisedByRole!: SafetyAlertRaisedBy;

  @Column({ type: 'varchar', length: 30, default: SafetyAlertStatus.RAISED }) status!: SafetyAlertStatus;
  @Column({ type: 'text' }) description!: string;

  @Column({ name: 'coordinator_id', type: 'uuid', nullable: true }) coordinatorId?: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'coordinator_id' }) coordinator?: User | null;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true }) acknowledgedAt?: Date | null;
  @Column({ name: 'service_paused_at', type: 'timestamptz', nullable: true }) servicePausedAt?: Date | null;
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true }) resolvedAt?: Date | null;

  @Column({ name: 'resolved_by_user_id', type: 'uuid', nullable: true }) resolvedByUserId?: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'resolved_by_user_id' }) resolvedByUser?: User | null;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true }) resolutionNotes?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
