import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PhoneRecoveryEventType } from '@ktb/shared-types';
import { User } from '../../identity/entities/user.entity';
import { PhoneRecoveryCase } from './phone-recovery-case.entity';

/** The case's history. A database trigger refuses any change once written. */
@Entity('phone_recovery_events')
export class PhoneRecoveryEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'case_id', type: 'uuid' })
  caseId!: string;

  @ManyToOne(() => PhoneRecoveryCase, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'case_id' })
  recoveryCase?: PhoneRecoveryCase;

  @Column({ name: 'actor_user_id', type: 'uuid' })
  actorUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_user_id' })
  actor?: User;

  @Column({ type: 'varchar', length: 20 })
  type!: PhoneRecoveryEventType;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
