import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { OrganizationType, OrganizationStatus } from '@ktb/shared-types';
import { OrganizationBranding } from './organization-branding.entity';
import { OrganizationAppBuild } from './organization-app-build.entity';
import { OrganizationMembership } from '../../memberships/entities/organization-membership.entity';

/**
 * Organization Entity (Tenant)
 * Represents an onboarded municipal corporation or municipality (ITB-002, D#1).
 */
@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: OrganizationType.MUNICIPALITY,
  })
  type!: OrganizationType;

  @Column({
    type: 'varchar',
    length: 30,
    default: OrganizationStatus.ACTIVE,
  })
  status!: OrganizationStatus;

  @Column({ name: 'state_code', type: 'varchar', length: 10, default: 'KL' })
  stateCode!: string;

  @Column({ type: 'varchar', length: 100 })
  district!: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;

  @OneToOne(() => OrganizationBranding, (branding) => branding.organization)
  branding?: OrganizationBranding;

  @OneToMany(() => OrganizationAppBuild, (build) => build.organization)
  appBuilds!: OrganizationAppBuild[];

  @OneToMany(() => OrganizationMembership, (membership) => membership.organization)
  memberships!: OrganizationMembership[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
