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
import { OrganizationMembership } from '../../memberships/entities/organization-membership.entity';

/**
 * VolunteerAvailability Entity (Organization Tenant Domain)
 * Preferences for geographic matching, radius, wards, and transient coordinates (D#9, D#12, D#58).
 */
@Entity('volunteer_availabilities')
@Unique('uq_volunteer_availability', ['organizationId', 'membershipId'])
export class VolunteerAvailability {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'membership_id' })
  membership?: OrganizationMembership;

  @Column({ name: 'is_available_immediate', type: 'boolean', default: true })
  isAvailableImmediate!: boolean;

  @Column({
    name: 'max_travel_radius_km',
    type: 'numeric',
    precision: 4,
    scale: 1,
    default: 5.0,
  })
  maxTravelRadiusKm!: number;

  @Column({ name: 'preferred_ward_numbers', type: 'jsonb', default: '[]' })
  preferredWardNumbers!: string[];

  @Column({ name: 'transient_lat', type: 'numeric', precision: 10, scale: 7, nullable: true })
  transientLat?: number | null;

  @Column({ name: 'transient_lng', type: 'numeric', precision: 10, scale: 7, nullable: true })
  transientLng?: number | null;

  @Column({ name: 'transient_updated_at', type: 'timestamptz', nullable: true })
  transientUpdatedAt?: Date | null;

  @Column({ name: 'is_gps_consented', type: 'boolean', default: true })
  isGpsConsented!: boolean;

  @Column({ name: 'residential_address_text', type: 'text', nullable: true })
  residentialAddressText?: string | null;

  @Column({ name: 'residential_ward_number', type: 'varchar', length: 20, nullable: true })
  residentialWardNumber?: string | null;

  @Column({ name: 'residential_postal_code', type: 'varchar', length: 10, nullable: true })
  residentialPostalCode?: string | null;

  @Column({ name: 'residential_lat', type: 'numeric', precision: 10, scale: 7, nullable: true })
  residentialLat?: number | null;

  @Column({ name: 'residential_lng', type: 'numeric', precision: 10, scale: 7, nullable: true })
  residentialLng?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
