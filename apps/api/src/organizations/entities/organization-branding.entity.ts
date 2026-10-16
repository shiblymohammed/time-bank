import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from './organization.entity';

/**
 * Organization Branding Entity
 * Stores app display name, logos, and visual theme tokens for white-label builds (ITB-003, ITB-010).
 */
@Entity('organization_branding')
export class OrganizationBranding {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid', unique: true })
  organizationId!: string;

  @OneToOne(() => Organization, (org) => org.branding)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'app_display_name', type: 'varchar', length: 100 })
  appDisplayName!: string;

  @Column({ name: 'logo_key', type: 'varchar', length: 255, nullable: true })
  logoKey?: string | null;

  @Column({ name: 'primary_color', type: 'varchar', length: 20, default: '#0D5C75' })
  primaryColor!: string;

  @Column({ name: 'secondary_color', type: 'varchar', length: 20, default: '#F59E0B' })
  secondaryColor!: string;

  @Column({ name: 'theme_config', type: 'jsonb', default: {} })
  themeConfig!: Record<string, unknown>;

  @Column({ name: 'support_email', type: 'varchar', length: 255, nullable: true })
  supportEmail?: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
