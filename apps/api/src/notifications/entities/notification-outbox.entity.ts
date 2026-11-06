import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../identity/entities/user.entity';

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  NO_DEVICE = 'NO_DEVICE',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
}

/** Written in the same transaction as the event, so a rollback sends nothing. */
@Entity('notification_outbox')
export class NotificationOutbox {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 50 })
  type!: string;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'varchar', length: 300 })
  body!: string;

  @Column({ type: 'jsonb', default: {} })
  data!: Record<string, string>;

  @Column({ type: 'varchar', length: 20, default: NotificationStatus.PENDING })
  status!: NotificationStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', default: () => 'NOW()' })
  nextAttemptAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'last_error', type: 'varchar', length: 300, nullable: true })
  lastError?: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
