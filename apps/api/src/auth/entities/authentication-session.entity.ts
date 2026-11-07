import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../identity/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';

/**
 * Authentication Session Entity
 * Tracks active refresh sessions and tenant context (NFR-07).
 */
@Entity('authentication_sessions')
export class AuthenticationSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 128, unique: true })
  refreshTokenHash!: string;

  /** The token this one replaced. Seeing it again later means a copy is in use. */
  @Column({ name: 'previous_refresh_token_hash', type: 'varchar', length: 128, nullable: true })
  previousRefreshTokenHash?: string | null;

  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true })
  rotatedAt?: Date | null;

  @Column({ name: 'active_org_id', type: 'uuid', nullable: true })
  activeOrgId?: string | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: 'active_org_id' })
  activeOrganization?: Organization | null;

  @Column({ name: 'device_info', type: 'jsonb', default: {} })
  deviceInfo!: Record<string, unknown>;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
