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
  ComplaintOutcome,
  ComplaintStatus,
  ComplaintSubject,
} from '@ktb/shared-types';
import { User } from '../../identity/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { ServiceRequest } from '../../requests/entities/service-request.entity';

/** Confidential: read only by the member who raised it and the staff at its level or above. */
@Entity('complaints')
export class Complaint {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ type: 'varchar', length: 30, unique: true })
  reference!: string;

  @Column({ name: 'raised_by_user_id', type: 'uuid' })
  raisedByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'raised_by_user_id' })
  raisedBy?: User;

  @Column({ type: 'varchar', length: 20 })
  subject!: ComplaintSubject;

  /** Who it is with now. It only ever moves up. */
  @Column({ type: 'varchar', length: 20 })
  level!: ComplaintLevel;

  @Column({ type: 'varchar', length: 20, default: ComplaintStatus.OPEN })
  status!: ComplaintStatus;

  @Column({ type: 'text' })
  description!: string;

  @Column({ name: 'service_request_id', type: 'uuid', nullable: true })
  serviceRequestId?: string | null;

  @ManyToOne(() => ServiceRequest, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'service_request_id' })
  serviceRequest?: ServiceRequest | null;

  @Column({ name: 'client_operation_id', type: 'varchar', length: 100, nullable: true })
  clientOperationId?: string | null;

  @Column({ name: 'handled_by_user_id', type: 'uuid', nullable: true })
  handledByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'handled_by_user_id' })
  handledBy?: User | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  outcome?: ComplaintOutcome | null;

  /** What the member is told. The reason behind it stays in the case history. */
  @Column({ name: 'member_message', type: 'text', nullable: true })
  memberMessage?: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt?: Date | null;

  @Column({ name: 'decided_by_user_id', type: 'uuid', nullable: true })
  decidedByUserId?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
