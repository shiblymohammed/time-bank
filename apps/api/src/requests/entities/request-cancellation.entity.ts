import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CancellerRole } from '@ktb/shared-types';
import { Organization } from '../../organizations/entities/organization.entity';
import { ServiceRequest } from './service-request.entity';
import { User } from '../../identity/entities/user.entity';

/**
 * RequestCancellation Entity (Organization Tenant Domain)
 * Detailed audit log for request cancellations and coordinator reliability reviews (D#29, D#62).
 */
@Entity('request_cancellations')
export class RequestCancellation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'service_request_id', type: 'uuid' })
  serviceRequestId!: string;

  @ManyToOne(() => ServiceRequest, (req) => req.cancellations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_request_id' })
  serviceRequest?: ServiceRequest;

  @Column({ name: 'cancelled_by_user_id', type: 'uuid' })
  cancelledByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cancelled_by_user_id' })
  canceller?: User;

  @Column({
    name: 'canceller_role',
    type: 'varchar',
    length: 30,
  })
  cancellerRole!: CancellerRole;

  @Column({ name: 'reason_code', type: 'varchar', length: 50 })
  reasonCode!: string;

  @Column({ type: 'text' })
  notes!: string;

  @CreateDateColumn({ name: 'cancelled_at', type: 'timestamptz' })
  cancelledAt!: Date;

  @Column({
    name: 'hours_before_start',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0.0,
  })
  hoursBeforeStart!: number;
}
