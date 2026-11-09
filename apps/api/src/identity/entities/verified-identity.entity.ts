import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { IdentityVerificationStatus } from '@ktb/shared-types';
import { User } from './user.entity';

/**
 * Verified Identity Entity
 * Represents central identity-verification status for a global user (FR-IDENT-02, ITB-004).
 */
@Entity('verified_identities')
export class VerifiedIdentity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId!: string;

  @OneToOne(() => User, (user) => user.verifiedIdentity)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    name: 'verification_status',
    type: 'varchar',
    length: 30,
    default: IdentityVerificationStatus.UNVERIFIED,
  })
  verificationStatus!: IdentityVerificationStatus;

  @Column({ name: 'verification_level', type: 'varchar', length: 30, default: 'BASIC' })
  verificationLevel!: string;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt?: Date | null;

  @Column({ name: 'verified_by', type: 'uuid', nullable: true })
  verifiedBy?: string | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string | null;

  /** The kind of document a coordinator checked (IdentityDocumentType). */
  @Column({ name: 'document_type', type: 'varchar', length: 30, nullable: true })
  documentType?: string | null;

  /** Last 4 characters of the document number, for staff to recognise it. */
  @Column({ name: 'document_last4', type: 'varchar', length: 4, nullable: true })
  documentLast4?: string | null;

  /** Keyed one-way fingerprint of the full number; never shown, only compared. */
  @Column({
    name: 'document_fingerprint',
    type: 'varchar',
    length: 64,
    nullable: true,
    select: false,
  })
  documentFingerprint?: string | null;

  @Column({ name: 'verification_notes', type: 'varchar', length: 500, nullable: true })
  verificationNotes?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
