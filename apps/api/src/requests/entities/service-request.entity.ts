import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Unique,
} from 'typeorm';
import {
  CreationChannel,
  ServiceRequestStatus,
  UrgencyType,
} from '@ktb/shared-types';
import { Organization } from '../../organizations/entities/organization.entity';
import { OrganizationMembership } from '../../memberships/entities/organization-membership.entity';
import { OrganizationServiceCatalog } from '../../catalogue/entities/organization-service-catalog.entity';
import { User } from '../../identity/entities/user.entity';
import { CaregiverAuthorization } from '../../beneficiaries/entities/caregiver-authorization.entity';
import { VolunteerAssignment } from '../../matching/entities/volunteer-assignment.entity';
import { MatchingRound } from '../../matching/entities/matching-round.entity';
import { RequestCancellation } from './request-cancellation.entity';
import { RequestRescheduleHistory } from './request-reschedule.entity';

/**
 * ServiceRequest Entity (Organization Tenant Domain)
 * The central transaction entity representing an assistance booking (D#8, D#59, D#60, D#61).
 */
@Entity('service_requests')
@Unique('uq_service_requests_org_number', ['organizationId', 'requestNumber'])
export class ServiceRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'request_number', type: 'varchar', length: 50 })
  requestNumber!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100, nullable: true })
  idempotencyKey?: string | null;

  @Column({ name: 'beneficiary_membership_id', type: 'uuid' })
  beneficiaryMembershipId!: string;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'beneficiary_membership_id' })
  beneficiaryMembership?: OrganizationMembership;

  @Column({ name: 'service_catalog_id', type: 'uuid' })
  serviceCatalogId!: string;

  @ManyToOne(() => OrganizationServiceCatalog, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_catalog_id' })
  serviceCatalog?: OrganizationServiceCatalog;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_user_id' })
  creator?: User;

  @Column({
    name: 'creation_channel',
    type: 'varchar',
    length: 30,
    default: CreationChannel.DIRECT_BENEFICIARY,
  })
  creationChannel!: CreationChannel;

  @Column({ name: 'caregiver_authorization_id', type: 'uuid', nullable: true })
  caregiverAuthorizationId?: string | null;

  @ManyToOne(() => CaregiverAuthorization, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'caregiver_authorization_id' })
  caregiverAuthorization?: CaregiverAuthorization | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: UrgencyType.IMMEDIATE,
  })
  urgency!: UrgencyType;

  @Column({
    type: 'varchar',
    length: 30,
    default: ServiceRequestStatus.MATCHING_ACTIVE,
  })
  status!: ServiceRequestStatus;

  @Column({ name: 'scheduled_start_time', type: 'timestamptz' })
  scheduledStartTime!: Date;

  @Column({ name: 'expected_duration_minutes', type: 'int', default: 60 })
  expectedDurationMinutes!: number;

  @Column({ name: 'min_volunteers', type: 'int', default: 1 })
  minVolunteers!: number;

  @Column({ name: 'preferred_volunteers', type: 'int', default: 1 })
  preferredVolunteers!: number;

  // Mandatory Manual Location Fields (D#59, FR-SVC-02)
  @Column({ name: 'location_address_text', type: 'text' })
  locationAddressText!: string;

  @Column({ name: 'location_ward_number', type: 'varchar', length: 20 })
  locationWardNumber!: string;

  @Column({ name: 'location_landmark', type: 'varchar', length: 255, nullable: true })
  locationLandmark?: string | null;

  @Column({ name: 'location_postal_code', type: 'varchar', length: 10 })
  locationPostalCode!: string;

  @Column({ name: 'location_lat', type: 'numeric', precision: 10, scale: 7, nullable: true })
  locationLat?: number | null;

  @Column({ name: 'location_lng', type: 'numeric', precision: 10, scale: 7, nullable: true })
  locationLng?: number | null;

  @Column({ name: 'beneficiary_notes', type: 'text', nullable: true })
  beneficiaryNotes?: string | null;

  @Column({ name: 'matching_radius_km', type: 'numeric', precision: 4, scale: 1, default: 3.0 })
  matchingRadiusKm!: number;

  @Column({ name: 'matching_tier', type: 'int', default: 1 })
  matchingTier!: number;

  @Column({ name: 'escalated_at', type: 'timestamptz', nullable: true })
  escalatedAt?: Date | null;

  @Column({ name: 'assigned_coordinator_id', type: 'uuid', nullable: true })
  assignedCoordinatorId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assigned_coordinator_id' })
  assignedCoordinator?: User | null;

  @Column({ name: 'allows_cross_org_volunteers', type: 'boolean', default: false })
  allowsCrossOrgVolunteers!: boolean;

  @OneToMany(() => VolunteerAssignment, (assignment) => assignment.serviceRequest)
  assignments?: VolunteerAssignment[];

  @OneToMany(() => MatchingRound, (round) => round.serviceRequest)
  matchingRounds?: MatchingRound[];

  @OneToMany(() => RequestCancellation, (cancellation) => cancellation.serviceRequest)
  cancellations?: RequestCancellation[];

  @OneToMany(() => RequestRescheduleHistory, (reschedule) => reschedule.serviceRequest)
  reschedules?: RequestRescheduleHistory[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
