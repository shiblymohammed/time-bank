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
  SafetyAlertAction,
  SafetyAlertOutcome,
  SafetyAlertRaiserRole,
  SafetyAlertStatus,
} from '@ktb/shared-types';
import { User } from '../../identity/entities/user.entity';
import { ServiceRequest } from '../../requests/entities/service-request.entity';

/** Confidential: only staff read this, and never the person the visit is shared with. */
@Entity('safety_alerts')
export class SafetyAlert {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'service_request_id', type: 'uuid' })
  serviceRequestId!: string;

  @ManyToOne(() => ServiceRequest, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_request_id' })
  serviceRequest?: ServiceRequest;

  @Column({ name: 'raised_by_user_id', type: 'uuid' })
  raisedByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'raised_by_user_id' })
  raisedBy?: User;

  @Column({ name: 'raised_by_role', type: 'varchar', length: 20 })
  raisedByRole!: SafetyAlertRaiserRole;

  @Column({ type: 'varchar', length: 10 })
  action!: SafetyAlertAction;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ name: 'client_operation_id', type: 'varchar', length: 100, nullable: true })
  clientOperationId?: string | null;

  @Column({ type: 'varchar', length: 20, default: SafetyAlertStatus.OPEN })
  status!: SafetyAlertStatus;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt?: Date | null;

  @Column({ name: 'acknowledged_by_user_id', type: 'uuid', nullable: true })
  acknowledgedByUserId?: string | null;

  @Column({ name: 'staff_notes', type: 'text', nullable: true })
  staffNotes?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  outcome?: SafetyAlertOutcome | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt?: Date | null;

  @Column({ name: 'resolved_by_user_id', type: 'uuid', nullable: true })
  resolvedByUserId?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
