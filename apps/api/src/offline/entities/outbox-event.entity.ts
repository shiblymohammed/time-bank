import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';
import { OutboxEventStatus } from '@ktb/shared-types';

/**
 * OutboxEvent — transactional outbox pattern entry (FR-OFF-02, D#99).
 *
 * Written in the same transaction as the business state change.
 * The OutboxProcessorService polls PENDING events and delivers them,
 * retrying with exponential back-off up to maxAttempts.
 */
@Entity('outbox_events')
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 }) eventType!: string;
  @Column({ name: 'aggregate_id', type: 'uuid' }) aggregateId!: string;
  @Column({ name: 'aggregate_type', type: 'varchar', length: 50 }) aggregateType!: string;
  @Column({ name: 'organization_id', type: 'uuid', nullable: true }) organizationId?: string | null;
  @Column({ type: 'jsonb', default: {} }) payload!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: OutboxEventStatus.PENDING })
  status!: OutboxEventStatus;

  @Column({ name: 'attempt_count', type: 'int', default: 0 }) attemptCount!: number;
  @Column({ name: 'max_attempts', type: 'int', default: 5 }) maxAttempts!: number;
  @Column({ name: 'next_retry_at', type: 'timestamptz', default: () => 'NOW()' }) nextRetryAt!: Date;
  @Column({ name: 'last_error', type: 'text', nullable: true }) lastError?: string | null;
  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true }) deliveredAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
