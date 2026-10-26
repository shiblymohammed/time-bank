import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../identity/entities/user.entity';
import { VolunteerZoneAssignment } from './volunteer-zone-assignment.entity';

/**
 * OperationalZone Entity (Organization Tenant Domain)
 * Coordinator-managed operational zones and ward clusters (D#9, D#13).
 */
@Entity('operational_zones')
@Unique('uq_operational_zones_org_code', ['organizationId', 'code'])
export class OperationalZone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'ward_numbers', type: 'jsonb', default: '[]' })
  wardNumbers!: string[];

  @Column({ name: 'center_lat', type: 'numeric', precision: 10, scale: 7, nullable: true })
  centerLat?: number | null;

  @Column({ name: 'center_lng', type: 'numeric', precision: 10, scale: 7, nullable: true })
  centerLng?: number | null;

  @Column({ name: 'radius_km', type: 'numeric', precision: 4, scale: 1, default: 5.0 })
  radiusKm!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser?: User | null;

  @OneToMany(() => VolunteerZoneAssignment, (vza) => vza.zone)
  volunteerAssignments!: VolunteerZoneAssignment[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
