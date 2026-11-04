import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { AccountClosureStatus, AccountClosureType } from '@ktb/shared-types';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../identity/entities/user.entity';

/** Account closure request — death or duplicate (FR-IDENT-07, FR-IDENT-08, D#46, D#87–D#90). */
@Entity('account_closures')
export class AccountClosure {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'user_id' }) user?: User;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true }) organizationId?: string | null;
  @ManyToOne(() => Organization, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'organization_id' }) organization?: Organization | null;

  @Column({ name: 'closure_type', type: 'varchar', length: 20 }) closureType!: AccountClosureType;
  @Column({ type: 'varchar', length: 30, default: AccountClosureStatus.PENDING_REVIEW }) status!: AccountClosureStatus;

  @Column({ name: 'requested_by_user_id', type: 'uuid' }) requestedByUserId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'requested_by_user_id' }) requestedByUser?: User;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true }) reviewedByUserId?: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'reviewed_by_user_id' }) reviewedByUser?: User | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true }) reviewedAt?: Date | null;
  @Column({ name: 'rejection_reason', type: 'text', nullable: true }) rejectionReason?: string | null;

  /** For DUPLICATE closure — the primary account that survives (D#87, D#88). */
  @Column({ name: 'duplicate_primary_user_id', type: 'uuid', nullable: true }) duplicatePrimaryUserId?: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'duplicate_primary_user_id' }) duplicatePrimaryUser?: User | null;

  /** For DECEASED closure — reference to the time-credit ledger transfer tx to nominee. */
  @Column({ name: 'nominee_transfer_tx_id', type: 'uuid', nullable: true }) nomineeTransferTxId?: string | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true }) archivedAt?: Date | null;
  @Column({ type: 'text', nullable: true }) notes?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
