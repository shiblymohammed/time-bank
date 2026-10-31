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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
