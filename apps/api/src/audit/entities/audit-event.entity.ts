import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * Immutable Audit Event Entity
 * BR-09, NFR-09: Append-only log of sensitive actions, privilege changes, and security events.
 */
@Entity('audit_events')
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType!: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId?: string | null;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId?: string | null;

  @Column({ name: 'target_type', type: 'varchar', length: 100, nullable: true })
  targetType?: string | null;

  @Column({ name: 'municipality_id', type: 'uuid', nullable: true })
  municipalityId?: string | null;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId?: string | null;

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
