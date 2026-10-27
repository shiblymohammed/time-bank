import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { GlobalServiceDefinition } from './global-service-definition.entity';

/**
 * OrganizationServiceCatalog Entity (Organization Tenant Domain)
 * Local organization enablement and headcount configuration of global services (D#10, ITB-002).
 */
@Entity('organization_service_catalog')
@Unique('uq_org_service_catalog', ['organizationId', 'globalServiceId'])
export class OrganizationServiceCatalog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'global_service_id', type: 'uuid' })
  globalServiceId!: string;

  @ManyToOne(() => GlobalServiceDefinition, (service) => service.organizationCatalogEntries, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'global_service_id' })
  globalService?: GlobalServiceDefinition;

  @Column({ name: 'custom_label_en', type: 'varchar', length: 150, nullable: true })
  customLabelEn?: string | null;

  @Column({ name: 'custom_label_ml', type: 'varchar', length: 150, nullable: true })
  customLabelMl?: string | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled!: boolean;

  @Column({ name: 'min_volunteers', type: 'int', default: 1 })
  minVolunteers!: number;

  @Column({ name: 'preferred_volunteers', type: 'int', default: 1 })
  preferredVolunteers!: number;

  @Column({ name: 'requires_coordinator_dispatch', type: 'boolean', default: false })
  requiresCoordinatorDispatch!: boolean;

  @Column({ name: 'local_instructions_en', type: 'text', nullable: true })
  localInstructionsEn?: string | null;

  @Column({ name: 'local_instructions_ml', type: 'text', nullable: true })
  localInstructionsMl?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
