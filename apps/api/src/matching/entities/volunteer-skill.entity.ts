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
import { SkillVerificationStatus } from '@ktb/shared-types';
import { Organization } from '../../organizations/entities/organization.entity';
import { OrganizationMembership } from '../../memberships/entities/organization-membership.entity';
import { MembershipDocument } from '../../memberships/entities/membership-document.entity';
import { User } from '../../identity/entities/user.entity';

/**
 * VolunteerSkill Entity (Organization Tenant Domain)
 * Tracks coordinator-verified skill credentials for specialized volunteer tasks (D#11, FR-MATCH-02).
 */
@Entity('volunteer_skills')
@Unique('uq_volunteer_skills', ['membershipId', 'skillCode'])
export class VolunteerSkill {
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

  @Column({ name: 'skill_code', type: 'varchar', length: 50 })
  skillCode!: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: SkillVerificationStatus.PENDING_VERIFICATION,
  })
  status!: SkillVerificationStatus;

  @Column({ name: 'verification_notes', type: 'text', nullable: true })
  verificationNotes?: string | null;

  @Column({ name: 'verified_by_user_id', type: 'uuid', nullable: true })
  verifiedByUserId?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'verified_by_user_id' })
  verifier?: User | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt?: Date | null;

  @Column({ name: 'document_id', type: 'uuid', nullable: true })
  documentId?: string | null;

  @ManyToOne(() => MembershipDocument, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'document_id' })
  document?: MembershipDocument | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
