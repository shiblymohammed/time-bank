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
import {
  CaregiverAuthorizationStatus,
  CaregiverRelationshipType,
} from '@ktb/shared-types';
import { Organization } from '../../organizations/entities/organization.entity';
import { OrganizationMembership } from '../../memberships/entities/organization-membership.entity';
import { MembershipDocument } from '../../memberships/entities/membership-document.entity';
import { User } from '../../identity/entities/user.entity';

/**
 * CaregiverAuthorization Entity (Organization Tenant Domain)
 * Explicit, revocable authorization granted by or for a beneficiary to a caregiver (D#8, D#37).
 */
@Entity('caregiver_authorizations')
@Unique('uq_caregiver_authorization', [
  'organizationId',
  'beneficiaryMembershipId',
  'caregiverMembershipId',
])
export class CaregiverAuthorization {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'beneficiary_membership_id', type: 'uuid' })
  beneficiaryMembershipId!: string;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'beneficiary_membership_id' })
  beneficiaryMembership?: OrganizationMembership;

  @Column({ name: 'caregiver_membership_id', type: 'uuid' })
  caregiverMembershipId!: string;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'caregiver_membership_id' })
  caregiverMembership?: OrganizationMembership;

  @Column({
    name: 'relationship_type',
    type: 'varchar',
    length: 50,
    default: CaregiverRelationshipType.FAMILY_CHILD,
  })
  relationshipType!: CaregiverRelationshipType;

  @Column({
    type: 'varchar',
    length: 30,
    default: CaregiverAuthorizationStatus.PENDING_REVIEW,
  })
  status!: CaregiverAuthorizationStatus;

  @Column({ name: 'authorization_document_id', type: 'uuid', nullable: true })
  authorizationDocumentId?: string | null;

  @ManyToOne(() => MembershipDocument, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'authorization_document_id' })
  authorizationDocument?: MembershipDocument | null;

  @Column({ name: 'can_initiate_requests', type: 'boolean', default: true })
  canInitiateRequests!: boolean;

  @Column({ name: 'can_verify_completions', type: 'boolean', default: true })
  canVerifyCompletions!: boolean;

  @Column({ name: 'approved_by_user_id', type: 'uuid', nullable: true })
  approvedByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'approved_by_user_id' })
  approver?: User | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date | null;

  @Column({ name: 'revoked_by_user_id', type: 'uuid', nullable: true })
  revokedByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'revoked_by_user_id' })
  revoker?: User | null;

  @Column({ name: 'revocation_reason', type: 'text', nullable: true })
  revocationReason?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
