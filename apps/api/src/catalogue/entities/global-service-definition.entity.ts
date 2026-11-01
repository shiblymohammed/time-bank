import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { ServiceCategory } from './service-category.entity';
import { User } from '../../identity/entities/user.entity';
import { OrganizationServiceCatalog } from './organization-service-catalog.entity';

/**
 * GlobalServiceDefinition Entity (Global Core Domain)
 * Canonical master service items maintained nationwide by Super Admin (D#10, ITB-002).
 */
@Entity('global_service_definitions')
export class GlobalServiceDefinition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId!: string;

  @ManyToOne(() => ServiceCategory, (category) => category.services, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category?: ServiceCategory;

  @Column({ type: 'varchar', length: 60, unique: true })
  code!: string;

  @Column({ name: 'name_en', type: 'varchar', length: 150 })
  nameEn!: string;

  @Column({ name: 'name_ml', type: 'varchar', length: 150 })
  nameMl!: string;

  @Column({ name: 'description_en', type: 'text', nullable: true })
  descriptionEn?: string | null;

  @Column({ name: 'description_ml', type: 'text', nullable: true })
  descriptionMl?: string | null;

  @Column({ name: 'default_min_volunteers', type: 'int', default: 1 })
  defaultMinVolunteers!: number;

  @Column({ name: 'default_preferred_volunteers', type: 'int', default: 1 })
  defaultPreferredVolunteers!: number;

  @Column({ name: 'is_hazardous_physical', type: 'boolean', default: false })
  isHazardousPhysical!: boolean;

  @Column({ name: 'requires_skills', type: 'boolean', default: false })
  requiresSkills!: boolean;

  @Column({ name: 'required_skill_codes', type: 'jsonb', default: '[]' })
  requiredSkillCodes!: string[];

  @Column({ name: 'is_emergency_prohibited', type: 'boolean', default: true })
  isEmergencyProhibited!: boolean;

  // Future Credit Calculation Metadata (PRD D#14, D#15, D#63)
  @Column({
    name: 'base_credit_rate_hourly',
    type: 'numeric',
    precision: 4,
    scale: 2,
    default: 1.0,
  })
  baseCreditRateHourly!: number;

  @Column({ name: 'credit_multiplier', type: 'numeric', precision: 3, scale: 2, default: 1.0 })
  creditMultiplier!: number;

  @Column({ name: 'allow_partial_hours', type: 'boolean', default: true })
  allowPartialHours!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator?: User | null;

  @OneToMany(() => OrganizationServiceCatalog, (cat) => cat.globalService)
  organizationCatalogEntries?: OrganizationServiceCatalog[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
