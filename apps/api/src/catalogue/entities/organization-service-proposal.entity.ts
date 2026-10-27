import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ServiceProposalStatus } from '@ktb/shared-types';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../identity/entities/user.entity';
import { ServiceCategory } from './service-category.entity';
import { GlobalServiceDefinition } from './global-service-definition.entity';

/**
 * OrganizationServiceProposal Entity (Organization Tenant Domain)
 * Local municipal proposals to Super Admin for new standard catalogue additions (D#10).
 */
@Entity('organization_service_proposals')
export class OrganizationServiceProposal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'proposed_by_user_id', type: 'uuid' })
  proposedByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'proposed_by_user_id' })
  proposer?: User;

  @Column({ name: 'proposed_name', type: 'varchar', length: 150 })
  proposedName!: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId!: string;

  @ManyToOne(() => ServiceCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category?: ServiceCategory;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text' })
  justification!: string;

  @Column({ name: 'suggested_min_volunteers', type: 'int', default: 1 })
  suggestedMinVolunteers!: number;

  @Column({ name: 'is_hazardous_physical', type: 'boolean', default: false })
  isHazardousPhysical!: boolean;

  @Column({
    type: 'varchar',
    length: 30,
    default: ServiceProposalStatus.PENDING_REVIEW,
  })
  status!: ServiceProposalStatus;

  @Column({ name: 'reviewed_by_user_id', type: 'uuid', nullable: true })
  reviewedByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by_user_id' })
  reviewer?: User | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt?: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string | null;

  @Column({ name: 'resulting_global_service_id', type: 'uuid', nullable: true })
  resultingGlobalServiceId?: string | null;

  @ManyToOne(() => GlobalServiceDefinition, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'resulting_global_service_id' })
  resultingGlobalService?: GlobalServiceDefinition | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
