import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { SyncOperationStatus } from '@ktb/shared-types';

/**
 * SyncOperation — tracks client-initiated mutations by client_operation_id.
 *
 * The Flutter app submits a unique clientOperationId with every mutation.
 * After a network interruption the app can call GET /sync/operations/{clientOperationId}
 * to check whether the server committed the operation (FR-OFF-02, FR-OFF-03, D#99).
 *
 * Unique constraint (user_id, client_operation_id) prevents duplicate processing.
 */
@Entity('sync_operations')
export class SyncOperation {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'client_operation_id', type: 'varchar', length: 100 }) clientOperationId!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'organization_id', type: 'uuid', nullable: true }) organizationId?: string | null;

  @Column({ name: 'operation_type', type: 'varchar', length: 60 }) operationType!: string;
  @Column({ type: 'varchar', length: 20, default: SyncOperationStatus.PENDING }) status!: SyncOperationStatus;

  @Column({ name: 'result_entity_id', type: 'uuid', nullable: true }) resultEntityId?: string | null;
  @Column({ name: 'result_entity_type', type: 'varchar', length: 50, nullable: true }) resultEntityType?: string | null;
  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
