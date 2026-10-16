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
import { Organization } from './organization.entity';

/**
 * Organization App Build Entity
 * Tracks application IDs, versions, and release status per platform (ITB-011).
 */
@Entity('organization_app_builds')
@Unique(['platform', 'applicationId'])
export class OrganizationAppBuild {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, (org) => org.appBuilds)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 20, default: 'ANDROID' })
  platform!: string;

  @Column({ name: 'application_id', type: 'varchar', length: 255 })
  applicationId!: string;

  @Column({ name: 'build_version', type: 'varchar', length: 50, default: '1.0.0' })
  buildVersion!: string;

  @Column({ name: 'min_supported_version', type: 'varchar', length: 50, default: '1.0.0' })
  minSupportedVersion!: string;

  @Column({ name: 'release_status', type: 'varchar', length: 30, default: 'DRAFT' })
  releaseStatus!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
