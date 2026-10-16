import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { IdentityDocumentType, DocumentReviewStatus } from '@ktb/shared-types';
import { User } from './user.entity';

/**
 * Identity Document Entity
 * Secure document submission and review (NFR-08: private storage key).
 */
@Entity('identity_documents')
export class IdentityDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    name: 'document_type',
    type: 'varchar',
    length: 50,
  })
  documentType!: IdentityDocumentType;

  @Column({ name: 'storage_key', type: 'varchar', length: 255 })
  storageKey!: string;

  @Column({
    name: 'review_status',
    type: 'varchar',
    length: 30,
    default: DocumentReviewStatus.PENDING,
  })
  reviewStatus!: DocumentReviewStatus;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt?: Date | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
