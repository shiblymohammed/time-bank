import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OrganizationMembership } from './organization-membership.entity';

/**
 * Membership Document Entity
 * Stores organization-specific supporting documents (e.g. proof of local residence).
 */
@Entity('membership_documents')
export class MembershipDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ManyToOne(() => OrganizationMembership, (membership) => membership.documents)
  @JoinColumn({ name: 'membership_id' })
  membership!: OrganizationMembership;

  @Column({ name: 'storage_key', type: 'varchar', length: 255 })
  storageKey!: string;

  @Column({ name: 'document_type', type: 'varchar', length: 50 })
  documentType!: string;

  @Column({ name: 'review_status', type: 'varchar', length: 30, default: 'PENDING' })
  reviewStatus!: string;

  /** For a ward NOC: the ward whose representative should have signed it. */
  @Column({ name: 'ward_id', type: 'uuid', nullable: true })
  wardId?: string | null;

  /** Set for files uploaded to the server's private storage. */
  @Column({ name: 'content_type', type: 'varchar', length: 100, nullable: true })
  contentType?: string | null;

  @Column({ name: 'size_bytes', type: 'integer', nullable: true })
  sizeBytes?: number | null;

  @Column({ type: 'char', length: 64, nullable: true })
  sha256?: string | null;

  @Column({ name: 'review_notes', type: 'varchar', length: 500, nullable: true })
  reviewNotes?: string | null;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId?: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
