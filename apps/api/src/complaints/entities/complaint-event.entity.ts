import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ComplaintEventType } from '@ktb/shared-types';
import { User } from '../../identity/entities/user.entity';
import { Complaint } from './complaint.entity';

/** The case history. A database trigger refuses any change once written. */
@Entity('complaint_events')
export class ComplaintEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'complaint_id', type: 'uuid' })
  complaintId!: string;

  @ManyToOne(() => Complaint, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'complaint_id' })
  complaint?: Complaint;

  @Column({ name: 'actor_user_id', type: 'uuid' })
  actorUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_user_id' })
  actor?: User;

  @Column({ type: 'varchar', length: 20 })
  type!: ComplaintEventType;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
