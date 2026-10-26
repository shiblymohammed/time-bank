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
import { User } from '../../identity/entities/user.entity';
import { OperationalZone } from './operational-zone.entity';

/**
 * VolunteerZoneAssignment Entity (Organization Tenant Domain)
 * Connects a volunteer membership to an authorized operational zone (D#9, D#13).
 */
@Entity('volunteer_zone_assignments')
@Unique('uq_volunteer_zone_assignment', ['membershipId', 'zoneId'])
export class VolunteerZoneAssignment {
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

  @Column({ name: 'zone_id', type: 'uuid' })
  zoneId!: string;

  @ManyToOne(() => OperationalZone, (zone) => zone.volunteerAssignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'zone_id' })
  zone?: OperationalZone;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;

  @Column({ name: 'assigned_by_user_id', type: 'uuid', nullable: true })
  assignedByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_by_user_id' })
  assignedByUser?: User | null;

  @Column({ name: 'assigned_at', type: 'timestamptz', default: () => 'NOW()' })
  assignedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
