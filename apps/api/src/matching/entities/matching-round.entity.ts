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
import { MatchingRoundStatus } from '@ktb/shared-types';
import { Organization } from '../../organizations/entities/organization.entity';
import { ServiceRequest } from '../../requests/entities/service-request.entity';
import { VolunteerAssignment } from './volunteer-assignment.entity';

/**
 * MatchingRound Entity (Organization Tenant Domain)
 * Tracks durable matching rounds, search tiers, and radii progression (D#7, D#13, D#60).
 */
@Entity('matching_rounds')
@Unique('uq_matching_rounds_request_round', ['serviceRequestId', 'roundNumber'])
export class MatchingRound {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'service_request_id', type: 'uuid' })
  serviceRequestId!: string;

  @ManyToOne(() => ServiceRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_request_id' })
  serviceRequest?: ServiceRequest;

  @Column({ name: 'round_number', type: 'int', default: 1 })
  roundNumber!: number;

  @Column({ type: 'int', default: 1 })
  tier!: number;

  @Column({
    name: 'search_radius_km',
    type: 'numeric',
    precision: 4,
    scale: 1,
    default: 3.0,
  })
  searchRadiusKm!: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: MatchingRoundStatus.ACTIVE,
  })
  status!: MatchingRoundStatus;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'NOW()' })
  startedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'offers_dispatched_count', type: 'int', default: 0 })
  offersDispatchedCount!: number;

  @Column({ name: 'offers_accepted_count', type: 'int', default: 0 })
  offersAcceptedCount!: number;

  @OneToMany(() => VolunteerAssignment, (va) => va.matchingRound)
  assignments!: VolunteerAssignment[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
