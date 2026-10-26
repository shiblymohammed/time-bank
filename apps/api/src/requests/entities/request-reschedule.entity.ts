import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { ServiceRequest } from './service-request.entity';
import { User } from '../../identity/entities/user.entity';

/**
 * RequestRescheduleHistory Entity (Organization Tenant Domain)
 * Tracks changes to scheduled booking times for auditing and re-matching (D#62).
 */
@Entity('request_reschedules')
export class RequestRescheduleHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'service_request_id', type: 'uuid' })
  serviceRequestId!: string;

  @ManyToOne(() => ServiceRequest, (req) => req.reschedules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_request_id' })
  serviceRequest?: ServiceRequest;

  @Column({ name: 'rescheduled_by_user_id', type: 'uuid' })
  rescheduledByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'rescheduled_by_user_id' })
  rescheduler?: User;

  @Column({ name: 'previous_start_time', type: 'timestamptz' })
  previousStartTime!: Date;

  @Column({ name: 'new_start_time', type: 'timestamptz' })
  newStartTime!: Date;

  @Column({ type: 'text' })
  reason!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
