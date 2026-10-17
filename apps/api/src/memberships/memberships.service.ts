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
  RoleGrantStatus,
  UserRole,
  OrganizationStatus,
} from '@ktb/shared-types';

import { Organization } from '../organizations/entities/organization.entity';
import { User } from '../identity/entities/user.entity';
import { OrganizationMembership } from './entities/organization-membership.entity';
import { MembershipRoleGrant } from './entities/membership-role-grant.entity';
import { MembershipApproval } from './entities/membership-approval.entity';
import { MembershipDocument } from './entities/membership-document.entity';
import { AuditService } from '../audit/audit.service';

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
        return existing;
      }

      // Re-apply if previously rejected
      if (existing.status === MembershipStatus.REJECTED) {
        existing.status = MembershipStatus.APPLIED;
        existing.appliedAt = new Date();
        existing.rejectionReason = null;
        const reApplied = await this.membershipRepo.save(existing);

        await this.auditService.logEvent({
          eventType: 'MEMBERSHIP_APPLIED',
          actorId: userId,
          targetId: reApplied.id,
          targetType: 'ORGANIZATION_MEMBERSHIP',
          organizationId,
          ipAddress,
          payload: { reapplication: true, notes: dto.notes ?? null },
        });

        return reApplied;
      }
    }

    // Create new application
    const membership = this.membershipRepo.create({
      organizationId,
      userId,
      status: MembershipStatus.APPLIED,
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
      payload: { notes: dto.notes ?? null },
    });

    return saved;
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

    const org = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    // Generate formatted sequential membership number: {ORG_CODE}-{YEAR}-{INDEX}
    const approvedCount = await this.membershipRepo.count({
      where: { organizationId, status: MembershipStatus.APPROVED },
    });
    const year = new Date().getFullYear();
    const membershipNumber = `${org.code}-${year}-${String(approvedCount + 1).padStart(4, '0')}`;

    membership.status = MembershipStatus.APPROVED;
    membership.approvedAt = new Date();
    membership.approvedBy = approverId;
    membership.membershipNumber = membershipNumber;
    membership.rejectionReason = null;
    const saved = await this.membershipRepo.save(membership);

    // Grant initial role (default: VOLUNTEER)
    const initialRole = dto.initialRole ?? UserRole.VOLUNTEER;
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
      throw new BadRequestException('Cannot reject an approved membership; suspend or revoke instead');
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
    });

    if (!membership) {
      throw new NotFoundException('Membership not found in this organization');
    }

    if (membership.status !== MembershipStatus.APPROVED) {
      throw new BadRequestException('Cannot grant roles to an unapproved membership');
    }

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
      relations: ['user', 'roleGrants', 'approvals'],
    });

    if (!membership) {
      throw new NotFoundException('Membership not found in this organization');
    }

    return membership;
  }
}
