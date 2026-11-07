import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MembershipStatus,
  MembershipApprovalAction,
  SkillVerificationStatus,
  RoleGrantStatus,
  UserRole,
  OrganizationStatus,
} from '@ktb/shared-types';

import { Organization } from '../organizations/entities/organization.entity';
import { User } from '../identity/entities/user.entity';
import {
  MembershipApplicationDetails,
  OrganizationMembership,
} from './entities/organization-membership.entity';
import { MembershipRoleGrant } from './entities/membership-role-grant.entity';
import { MembershipApproval } from './entities/membership-approval.entity';
import { MembershipDocument } from './entities/membership-document.entity';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { RoleHierarchyService } from '../authorization/role-hierarchy.service';
import { GlobalServiceDefinition } from '../catalogue/entities/global-service-definition.entity';
import { VolunteerAvailability } from '../matching/entities/volunteer-availability.entity';
import { VolunteerSkill } from '../matching/entities/volunteer-skill.entity';

import { ApplyMembershipDto } from './dto/apply-membership.dto';
import { ApproveMembershipDto } from './dto/approve-membership.dto';
import { RejectMembershipDto } from './dto/reject-membership.dto';
import { UploadMembershipDocDto } from './dto/upload-membership-doc.dto';
import { ReviewMembershipDocDto } from './dto/review-membership-doc.dto';
import { GrantRoleDto } from './dto/grant-role.dto';
import { RevokeRoleDto } from './dto/revoke-role.dto';
import { MembershipQueryDto } from './dto/membership-query.dto';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepo: Repository<OrganizationMembership>,
    @InjectRepository(MembershipRoleGrant)
    private readonly roleGrantRepo: Repository<MembershipRoleGrant>,
    @InjectRepository(MembershipApproval)
    private readonly approvalRepo: Repository<MembershipApproval>,
    @InjectRepository(MembershipDocument)
    private readonly documentRepo: Repository<MembershipDocument>,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly roleHierarchyService: RoleHierarchyService,
  ) {}

  /**
   * Apply for membership in an organization (M2-14, ITB-005, ITB-007).
   */
  async apply(
    organizationId: string,
    userId: string,
    dto: ApplyMembershipDto,
    ipAddress?: string,
  ): Promise<OrganizationMembership> {
    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    if (org.status !== OrganizationStatus.ACTIVE) {
      throw new BadRequestException('Organization is not accepting new membership applications');
    }

    const existing = await this.membershipRepo.findOne({
      where: { organizationId, userId },
      relations: ['roleGrants'],
    });

    if (existing) {
      if (existing.status === MembershipStatus.APPROVED) {
        throw new ConflictException('You are already an approved member of this organization');
      }

      if (
        existing.status === MembershipStatus.APPLIED ||
        existing.status === MembershipStatus.PENDING_REVIEW
      ) {
        // A pending applicant may correct what they asked for; nothing else changes.
        if (dto.requestedRole === undefined && dto.notes === undefined && !dto.volunteer)
          return existing;
        Object.assign(existing, await this.applicationFields(dto));
        return this.membershipRepo.save(existing);
      }

      // Re-apply if previously rejected
      if (existing.status === MembershipStatus.REJECTED) {
        existing.status = MembershipStatus.APPLIED;
        existing.appliedAt = new Date();
        existing.rejectionReason = null;
        Object.assign(existing, await this.applicationFields(dto));
        const reApplied = await this.membershipRepo.save(existing);

        await this.auditService.logEvent({
          eventType: 'MEMBERSHIP_APPLIED',
          actorId: userId,
          targetId: reApplied.id,
          targetType: 'ORGANIZATION_MEMBERSHIP',
          organizationId,
          ipAddress,
          payload: {
            reapplication: true,
            requestedRole: reApplied.requestedRole ?? null,
            notes: dto.notes ?? null,
          },
        });

        return reApplied;
      }
    }

    // Create new application
    const membership = this.membershipRepo.create({
      organizationId,
      userId,
      status: MembershipStatus.APPLIED,
      ...(await this.applicationFields(dto)),
    });
    const saved = await this.membershipRepo.save(membership);

    // If user has no primary organization set, designate this one
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (user && !user.primaryOrgId) {
      user.primaryOrgId = organizationId;
      await this.userRepo.save(user);
    }

    // Audit record
    await this.auditService.logEvent({
      eventType: 'MEMBERSHIP_APPLIED',
      actorId: userId,
      targetId: saved.id,
      targetType: 'ORGANIZATION_MEMBERSHIP',
      organizationId,
      ipAddress,
      payload: { requestedRole: saved.requestedRole ?? null, notes: dto.notes ?? null },
    });

    return saved;
  }

  /** What the applicant asked for. Volunteer answers need the volunteer role and known skills. */
  private async applicationFields(dto: ApplyMembershipDto): Promise<{
    requestedRole: UserRole | null;
    applicationNotes: string | null;
    applicationDetails: MembershipApplicationDetails;
  }> {
    const requestedRole = dto.requestedRole ?? null;
    if (dto.volunteer && requestedRole !== UserRole.VOLUNTEER)
      throw new BadRequestException('Volunteer details need requestedRole VOLUNTEER');
    const details: MembershipApplicationDetails = {};
    if (dto.volunteer) {
      const skillCodes = [...new Set(dto.volunteer.skillCodes ?? [])];
      if (skillCodes.length) {
        const services = await this.membershipRepo.manager
          .getRepository(GlobalServiceDefinition)
          .find({ where: { isActive: true }, select: { id: true, requiredSkillCodes: true } });
        const known = new Set(services.flatMap((service) => service.requiredSkillCodes ?? []));
        const unknown = skillCodes.filter((code) => !known.has(code));
        if (unknown.length)
          throw new BadRequestException(`Unknown skill codes: ${unknown.join(', ')}`);
      }
      details.volunteer = {
        maxTravelRadiusKm: dto.volunteer.maxTravelRadiusKm ?? 5,
        availableAtShortNotice: dto.volunteer.availableAtShortNotice ?? false,
        usualDays: dto.volunteer.usualDays ?? [],
        usualTimes: dto.volunteer.usualTimes ?? [],
        skillCodes,
      };
    }
    return { requestedRole, applicationNotes: dto.notes ?? null, applicationDetails: details };
  }

  /** Turns a volunteer's application answers into matching preferences and unverified skills. */
  private async seedVolunteerProfile(membership: OrganizationMembership): Promise<void> {
    const answers = membership.applicationDetails?.volunteer;
    if (!answers) return;
    const manager = this.membershipRepo.manager;
    const availabilityRepo = manager.getRepository(VolunteerAvailability);
    const existing = await availabilityRepo.findOne({
      where: { organizationId: membership.organizationId, membershipId: membership.id },
    });
    if (!existing)
      await availabilityRepo.save(
        availabilityRepo.create({
          organizationId: membership.organizationId,
          membershipId: membership.id,
          maxTravelRadiusKm: answers.maxTravelRadiusKm,
          isAvailableImmediate: answers.availableAtShortNotice,
        }),
      );
    if (answers.skillCodes.length)
      await manager
        .createQueryBuilder()
        .insert()
        .into(VolunteerSkill)
        .values(
          answers.skillCodes.map((skillCode) => ({
            organizationId: membership.organizationId,
            membershipId: membership.id,
            skillCode,
            status: SkillVerificationStatus.PENDING_VERIFICATION,
          })),
        )
        .orIgnore()
        .execute();
  }

  /** Each call takes the next number atomically, so simultaneous approvals never share one. */
  private async nextMembershipSequence(organizationId: string): Promise<number> {
    const result = await this.orgRepo
      .createQueryBuilder()
      .update(Organization)
      .set({ membershipSequence: () => 'membership_sequence + 1' })
      .where('id = :organizationId', { organizationId })
      .returning('membership_sequence')
      .execute();
    return Number((result.raw as { membership_sequence: number }[])[0]!.membership_sequence);
  }

  /**
   * Approve a membership application and grant initial operational role (M2-14, D#2).
   */
  async approveMembership(
    organizationId: string,
    membershipId: string,
    approverId: string,
    dto: ApproveMembershipDto,
    ipAddress?: string,
  ): Promise<OrganizationMembership> {
    const membership = await this.membershipRepo.findOne({
      where: { id: membershipId, organizationId },
      relations: ['roleGrants'],
    });

    if (!membership) {
      throw new NotFoundException('Membership application not found in this organization');
    }

    if (membership.status === MembershipStatus.APPROVED) {
      throw new BadRequestException('Membership is already approved');
    }
    const previousStatus = membership.status;
    if (
      ![
        MembershipStatus.APPLIED,
        MembershipStatus.PENDING_REVIEW,
        MembershipStatus.REJECTED,
      ].includes(previousStatus)
    ) {
      throw new BadRequestException(`A ${previousStatus} membership cannot be approved`);
    }

    const initialRole = dto.initialRole ?? membership.requestedRole ?? UserRole.VOLUNTEER;
    this.authorizationService.assertNoSelfEscalation(approverId, membership.userId, initialRole);
    await this.assertCanManageRole(organizationId, approverId, initialRole);

    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    // Generate formatted sequential membership number: {ORG_CODE}-{YEAR}-{INDEX}
    const year = new Date().getFullYear();
    const sequence = await this.nextMembershipSequence(organizationId);
    const membershipNumber = `${org.code}-${year}-${String(sequence).padStart(4, '0')}`;

    const approvedFields = {
      status: MembershipStatus.APPROVED,
      approvedAt: new Date(),
      approvedBy: approverId,
      membershipNumber,
      rejectionReason: null,
    };
    // Only one of two simultaneous approvals may go on to grant the role.
    const claimed = await this.membershipRepo.update(
      { id: membershipId, organizationId, status: previousStatus },
      approvedFields,
    );
    if (!claimed.affected) throw new ConflictException('Membership was already reviewed');
    const saved = Object.assign(membership, approvedFields);

    // Grant initial role (default: VOLUNTEER)
    const existingGrant = await this.roleGrantRepo.findOne({
      where: {
        membershipId: saved.id,
        role: initialRole,
        status: RoleGrantStatus.ACTIVE,
      },
    });

    if (!existingGrant) {
      const grant = this.roleGrantRepo.create({
        membershipId: saved.id,
        role: initialRole,
        status: RoleGrantStatus.ACTIVE,
        grantedBy: approverId,
      });
      await this.roleGrantRepo.save(grant);
    }
    if (initialRole === UserRole.VOLUNTEER) await this.seedVolunteerProfile(saved);

    // Record approval audit trail
    const approval = this.approvalRepo.create({
      membershipId: saved.id,
      action: MembershipApprovalAction.MEMBERSHIP_APPROVED,
      actorId: approverId,
      notes: dto.notes ?? 'Application approved',
    });
    await this.approvalRepo.save(approval);

    await this.auditService.logEvent({
      eventType: 'MEMBERSHIP_APPROVED',
      actorId: approverId,
      targetId: saved.id,
      targetType: 'ORGANIZATION_MEMBERSHIP',
      organizationId,
      ipAddress,
      payload: {
        membershipNumber,
        initialRole,
        notes: dto.notes ?? null,
      },
    });

    const updated = await this.membershipRepo.findOne({
      where: { id: saved.id },
      relations: ['roleGrants', 'approvals'],
    });
    return updated!;
  }

  /**
   * Reject a membership application (M2-14).
   */
  async rejectMembership(
    organizationId: string,
    membershipId: string,
    rejecterId: string,
    dto: RejectMembershipDto,
    ipAddress?: string,
  ): Promise<OrganizationMembership> {
    const membership = await this.membershipRepo.findOne({
      where: { id: membershipId, organizationId },
    });

    if (!membership) {
      throw new NotFoundException('Membership application not found in this organization');
    }

    if (membership.status === MembershipStatus.APPROVED) {
      throw new BadRequestException(
        'Cannot reject an approved membership; suspend or revoke instead',
      );
    }

    membership.status = MembershipStatus.REJECTED;
    membership.rejectionReason = dto.reason;
    const saved = await this.membershipRepo.save(membership);

    const approval = this.approvalRepo.create({
      membershipId: saved.id,
      action: MembershipApprovalAction.MEMBERSHIP_REJECTED,
      actorId: rejecterId,
      notes: dto.reason,
    });
    await this.approvalRepo.save(approval);

    await this.auditService.logEvent({
      eventType: 'MEMBERSHIP_REJECTED',
      actorId: rejecterId,
      targetId: saved.id,
      targetType: 'ORGANIZATION_MEMBERSHIP',
      organizationId,
      ipAddress,
      payload: { reason: dto.reason },
    });

    return saved;
  }

  /**
   * Upload a supporting document for an organization membership (M2-15).
   */
  async uploadDocument(
    organizationId: string,
    membershipId: string,
    userId: string,
    dto: UploadMembershipDocDto,
    ipAddress?: string,
  ): Promise<MembershipDocument> {
    const membership = await this.membershipRepo.findOne({
      where: { id: membershipId, organizationId },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found in this organization');
    }

    if (membership.userId !== userId) {
      throw new ForbiddenException('You can only submit documents for your own membership');
    }

    const doc = this.documentRepo.create({
      membershipId,
      documentType: dto.documentType,
      storageKey: dto.storageKey,
      reviewStatus: 'PENDING',
    });
    const saved = await this.documentRepo.save(doc);

    await this.auditService.logEvent({
      eventType: 'MEMBERSHIP_DOCUMENT_UPLOADED',
      actorId: userId,
      targetId: saved.id,
      targetType: 'MEMBERSHIP_DOCUMENT',
      organizationId,
      ipAddress,
      payload: { documentType: dto.documentType },
    });

    return saved;
  }

  /**
   * Review a membership supporting document (M2-15).
   */
  async reviewDocument(
    organizationId: string,
    documentId: string,
    reviewerId: string,
    dto: ReviewMembershipDocDto,
    ipAddress?: string,
  ): Promise<MembershipDocument> {
    const doc = await this.documentRepo.findOne({
      where: { id: documentId },
      relations: ['membership'],
    });

    if (!doc || doc.membership?.organizationId !== organizationId) {
      throw new NotFoundException('Document not found in this organization');
    }
    this.authorizationService.assertNoSelfEscalation(reviewerId, doc.membership!.userId);

    doc.reviewStatus = dto.status;
    const saved = await this.documentRepo.save(doc);

    await this.auditService.logEvent({
      eventType: 'MEMBERSHIP_DOCUMENT_REVIEWED',
      actorId: reviewerId,
      targetId: saved.id,
      targetType: 'MEMBERSHIP_DOCUMENT',
      organizationId,
      ipAddress,
      payload: {
        reviewStatus: dto.status,
        notes: dto.notes ?? null,
      },
    });

    return saved;
  }

  /**
   * Grant an operational role to an approved member (M2-16).
   */
  async grantRole(
    organizationId: string,
    membershipId: string,
    dto: GrantRoleDto,
    granterId: string,
    ipAddress?: string,
  ): Promise<MembershipRoleGrant> {
    const membership = await this.membershipRepo.findOne({
      where: { id: membershipId, organizationId },
      relations: ['user'],
    });

    if (!membership) {
      throw new NotFoundException('Membership not found in this organization');
    }

    if (membership.status !== MembershipStatus.APPROVED) {
      throw new BadRequestException('Cannot grant roles to an unapproved membership');
    }

    this.authorizationService.assertNoSelfEscalation(granterId, membership.userId, dto.role);
    await this.assertCanManageRole(organizationId, granterId, dto.role, true);

    const existingGrant = await this.roleGrantRepo.findOne({
      where: {
        membershipId,
        role: dto.role,
        status: RoleGrantStatus.ACTIVE,
      },
    });

    if (existingGrant) {
      throw new ConflictException('Member already holds an active grant for this role');
    }

    const grant = this.roleGrantRepo.create({
      membershipId,
      role: dto.role,
      status: RoleGrantStatus.ACTIVE,
      grantedBy: granterId,
    });
    const saved = await this.roleGrantRepo.save(grant);

    await this.auditService.logEvent({
      eventType: 'MEMBERSHIP_ROLE_GRANTED',
      actorId: granterId,
      targetId: saved.id,
      targetType: 'MEMBERSHIP_ROLE_GRANT',
      organizationId,
      ipAddress,
      payload: {
        role: dto.role,
        membershipId,
      },
    });

    return saved;
  }

  /**
   * Revoke an active role grant within an organization (M2-16).
   */
  async revokeRole(
    organizationId: string,
    membershipId: string,
    roleGrantId: string,
    dto: RevokeRoleDto,
    revokerId: string,
    ipAddress?: string,
  ): Promise<MembershipRoleGrant> {
    const grant = await this.roleGrantRepo.findOne({
      where: { id: roleGrantId, membershipId },
      relations: ['membership'],
    });

    if (!grant || grant.membership?.organizationId !== organizationId) {
      throw new NotFoundException('Role grant not found in this organization');
    }

    await this.assertCanManageRole(organizationId, revokerId, grant.role, true);

    if (grant.status === RoleGrantStatus.REVOKED) {
      throw new BadRequestException('Role grant is already revoked');
    }

    grant.status = RoleGrantStatus.REVOKED;
    grant.revokedAt = new Date();
    grant.revokedBy = revokerId;
    grant.revocationReason = dto.reason ?? null;
    const saved = await this.roleGrantRepo.save(grant);

    await this.auditService.logEvent({
      eventType: 'MEMBERSHIP_ROLE_REVOKED',
      actorId: revokerId,
      targetId: saved.id,
      targetType: 'MEMBERSHIP_ROLE_GRANT',
      organizationId,
      ipAddress,
      payload: {
        role: grant.role,
        membershipId,
        reason: dto.reason ?? null,
      },
    });

    return saved;
  }

  /**
   * List and filter organization memberships (M2-17).
   */
  async listMemberships(
    organizationId: string,
    query: MembershipQueryDto,
  ): Promise<{ memberships: OrganizationMembership[]; total: number }> {
    const qb = this.membershipRepo
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.user', 'user')
      .leftJoinAndSelect('m.roleGrants', 'roleGrants')
      .where('m.organizationId = :organizationId', { organizationId });

    if (query.status) {
      qb.andWhere('m.status = :status', { status: query.status });
    }

    if (query.role)
      qb.andWhere(
        'EXISTS (SELECT 1 FROM membership_role_grants selected_role WHERE selected_role.membership_id = m.id AND selected_role.role = :selectedRole AND selected_role.status = :activeRole)',
        { selectedRole: query.role, activeRole: RoleGrantStatus.ACTIVE },
      );
    if (query.search?.trim())
      qb.andWhere('(m.membershipNumber ILIKE :search OR user.phoneE164 ILIKE :search)', {
        search: `%${query.search.trim()}%`,
      });

    qb.orderBy('m.createdAt', 'DESC');
    qb.take(Math.min(query.limit ?? 50, 100));
    qb.skip(query.offset ?? 0);

    const [memberships, total] = await qb.getManyAndCount();
    return { memberships, total };
  }

  /**
   * Get membership details with role grants, documents, and approvals (M2-17).
   */
  async getMembershipById(
    organizationId: string,
    membershipId: string,
  ): Promise<OrganizationMembership> {
    const membership = await this.membershipRepo.findOne({
      where: { id: membershipId, organizationId },
      relations: ['user', 'roleGrants', 'approvals', 'documents'],
    });

    if (!membership) {
      throw new NotFoundException('Membership not found in this organization');
    }

    return membership;
  }

  async listMembershipDocuments(
    organizationId: string,
    membershipId: string,
  ): Promise<MembershipDocument[]> {
    const membership = await this.membershipRepo.findOne({
      where: { id: membershipId, organizationId },
    });
    if (!membership) throw new NotFoundException('Membership not found in this organization');
    return this.documentRepo.find({ where: { membershipId }, order: { createdAt: 'DESC' } });
  }

  private async assertCanManageRole(
    organizationId: string,
    actorId: string,
    role: UserRole,
    requiresAdmin = false,
  ): Promise<void> {
    this.roleHierarchyService.assertValidMembershipRole(role);
    const context = await this.authorizationService.evaluateOrganizationAccess(
      actorId,
      organizationId,
    );
    if (
      requiresAdmin &&
      !context.isSuperAdmin &&
      !context.roles.includes(UserRole.MUNICIPALITY_ADMIN)
    ) {
      throw new ForbiddenException('Municipality administrator required to manage roles');
    }
    this.roleHierarchyService.assertCanGrantRole(this.getHighestRole(context.roles), role);
  }

  /**
   * Helper: determines the highest privilege level from a set of roles.
   * Role hierarchy: SUPER_ADMIN > MUNICIPALITY_ADMIN > COORDINATOR > VOLUNTEER/BENEFICIARY/CAREGIVER/MERCHANT
   */
  private getHighestRole(roles: UserRole[]): UserRole {
    if (roles.includes(UserRole.SUPER_ADMIN)) return UserRole.SUPER_ADMIN;
    if (roles.includes(UserRole.MUNICIPALITY_ADMIN)) return UserRole.MUNICIPALITY_ADMIN;
    if (roles.includes(UserRole.COORDINATOR)) return UserRole.COORDINATOR;
    if (roles.includes(UserRole.VOLUNTEER)) return UserRole.VOLUNTEER;
    if (roles.includes(UserRole.BENEFICIARY)) return UserRole.BENEFICIARY;
    if (roles.includes(UserRole.CAREGIVER)) return UserRole.CAREGIVER;
    if (roles.includes(UserRole.MERCHANT)) return UserRole.MERCHANT;

    throw new ForbiddenException('User has no recognized roles');
  }
}
