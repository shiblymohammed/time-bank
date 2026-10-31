import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BeneficiaryEligibilityStatus,
  CaregiverAuthorizationStatus,
  MembershipStatus,
  UserRole,
} from '@ktb/shared-types';

import { BeneficiaryEligibility } from './entities/beneficiary-eligibility.entity';
import { CaregiverAuthorization } from './entities/caregiver-authorization.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { ServiceRequest } from '../requests/entities/service-request.entity';
import { AuditService } from '../audit/audit.service';
import {
  AuthorizationService,
  EvaluatedMembershipContext,
} from '../authorization/authorization.service';
import { MembershipDocument } from '../memberships/entities/membership-document.entity';

import { GrantBeneficiaryEligibilityDto } from './dto/grant-beneficiary-eligibility.dto';
import { CreateCaregiverAuthorizationDto } from './dto/create-caregiver-authorization.dto';
import { ReviewCaregiverAuthorizationDto } from './dto/review-caregiver-authorization.dto';

@Injectable()
export class BeneficiariesService {
  constructor(
    @InjectRepository(BeneficiaryEligibility)
    private readonly eligibilityRepo: Repository<BeneficiaryEligibility>,
    @InjectRepository(CaregiverAuthorization)
    private readonly caregiverAuthRepo: Repository<CaregiverAuthorization>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepo: Repository<OrganizationMembership>,
    @InjectRepository(ServiceRequest)
    private readonly requestRepo: Repository<ServiceRequest>,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    @InjectRepository(MembershipDocument)
    private readonly documentRepo: Repository<MembershipDocument>,
  ) {}

  // ─── Beneficiary Eligibility ────────────────────────────────────────────────
  async grantEligibility(
    orgId: string,
    dto: GrantBeneficiaryEligibilityDto,
    approverId: string,
    ipAddress?: string,
  ): Promise<BeneficiaryEligibility> {
    const membership = await this.membershipRepo.findOne({
      where: { id: dto.membershipId, organizationId: orgId },
    });
    if (!membership) {
      throw new NotFoundException(`Membership '${dto.membershipId}' not found in organization`);
    }

    if (membership.status !== MembershipStatus.APPROVED) {
      throw new BadRequestException('Cannot grant eligibility to unapproved membership');
    }

    let eligibility = await this.eligibilityRepo.findOne({
      where: { organizationId: orgId, membershipId: dto.membershipId },
    });

    if (eligibility) {
      eligibility.eligibilityType = dto.eligibilityType;
      eligibility.status = BeneficiaryEligibilityStatus.ACTIVE;
      eligibility.reviewDueAt = new Date(dto.reviewDueAt);
      if (dto.approvedAssistanceCategories) {
        eligibility.approvedAssistanceCategories = dto.approvedAssistanceCategories;
      }
      if (dto.monthlyRequestQuota !== undefined) {
        eligibility.monthlyRequestQuota = dto.monthlyRequestQuota;
      }
      if (dto.quotaOverrideReason !== undefined) {
        eligibility.quotaOverrideReason = dto.quotaOverrideReason ?? null;
      }
      eligibility.approvedByUserId = approverId;
      eligibility.approvedAt = new Date();
    } else {
      eligibility = this.eligibilityRepo.create({
        organizationId: orgId,
        membershipId: dto.membershipId,
        eligibilityType: dto.eligibilityType,
        status: BeneficiaryEligibilityStatus.ACTIVE,
        approvedAssistanceCategories: dto.approvedAssistanceCategories ?? ['*'],
        reviewDueAt: new Date(dto.reviewDueAt),
        approvedByUserId: approverId,
        monthlyRequestQuota: dto.monthlyRequestQuota ?? 8,
        quotaOverrideReason: dto.quotaOverrideReason ?? null,
      });
    }

    const saved = await this.eligibilityRepo.save(eligibility);

    await this.auditService.logEvent({
      eventType: 'BENEFICIARY_ELIGIBILITY_GRANTED',
      actorId: approverId,
      targetId: saved.id,
      targetType: 'beneficiary_eligibilities',
      organizationId: orgId,
      payload: {
        membershipId: saved.membershipId,
        eligibilityType: saved.eligibilityType,
        monthlyRequestQuota: saved.monthlyRequestQuota,
        reviewDueAt: saved.reviewDueAt,
      },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async getEligibility(
    orgId: string,
    membershipId: string,
    actorId: string,
  ): Promise<BeneficiaryEligibility> {
    await this.assertBeneficiaryAccess(orgId, membershipId, actorId);
    const eligibility = await this.eligibilityRepo.findOne({
      where: { organizationId: orgId, membershipId },
    });
    if (!eligibility) {
      throw new NotFoundException(
        `Beneficiary eligibility not found for membership '${membershipId}'`,
      );
    }
    return eligibility;
  }

  async checkEligibilityAndQuota(
    orgId: string,
    membershipId: string,
    serviceCategoryId?: string,
  ): Promise<{ eligible: boolean; remainingQuota: number }> {
    const eligibility = await this.eligibilityRepo.findOne({
      where: { organizationId: orgId, membershipId },
    });

    if (!eligibility || eligibility.status !== BeneficiaryEligibilityStatus.ACTIVE) {
      throw new ForbiddenException('Beneficiary eligibility is not active');
    }

    if (new Date() > new Date(eligibility.reviewDueAt)) {
      throw new ForbiddenException(
        'Beneficiary eligibility has expired and requires coordinator review (D#25)',
      );
    }

    // Category restriction check (D#24, FR-BEN)
    if (
      serviceCategoryId &&
      eligibility.approvedAssistanceCategories &&
      !eligibility.approvedAssistanceCategories.includes('*') &&
      !eligibility.approvedAssistanceCategories.includes(serviceCategoryId)
    ) {
      throw new ForbiddenException(
        `Beneficiary is not approved for service category '${serviceCategoryId}' (D#24)`,
      );
    }

    // Compute requests in current calendar month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthCount = await this.requestRepo
      .createQueryBuilder('req')
      .where('req.organizationId = :orgId', { orgId })
      .andWhere('req.beneficiaryMembershipId = :membershipId', { membershipId })
      .andWhere('req.createdAt >= :startOfMonth', { startOfMonth })
      .andWhere('req.status != :cancelled', { cancelled: 'CANCELLED' })
      .getCount();

    if (monthCount >= eligibility.monthlyRequestQuota) {
      throw new ForbiddenException(
        `Monthly assistance request quota (${eligibility.monthlyRequestQuota}) reached for this beneficiary (D#26)`,
      );
    }

    return {
      eligible: true,
      remainingQuota: eligibility.monthlyRequestQuota - monthCount,
    };
  }

  // ─── Caregiver Authorizations ───────────────────────────────────────────────
  async createCaregiverAuthorization(
    orgId: string,
    dto: CreateCaregiverAuthorizationDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<CaregiverAuthorization> {
    const beneficiaryMem = await this.membershipRepo.findOne({
      where: { id: dto.beneficiaryMembershipId, organizationId: orgId },
    });
    if (!beneficiaryMem || beneficiaryMem.status !== MembershipStatus.APPROVED) {
      throw new NotFoundException('Beneficiary membership not found or not approved');
    }

    const caregiverMem = await this.membershipRepo.findOne({
      where: { id: dto.caregiverMembershipId, organizationId: orgId },
    });
    if (!caregiverMem || caregiverMem.status !== MembershipStatus.APPROVED) {
      throw new NotFoundException('Caregiver membership not found or not approved');
    }

    if (dto.beneficiaryMembershipId === dto.caregiverMembershipId) {
      throw new BadRequestException('Beneficiary and caregiver cannot be the same membership');
    }

    const context = await this.authorizationService.evaluateOrganizationAccess(actorId, orgId);
    if (
      !this.isStaff(context) &&
      context.membershipId !== beneficiaryMem.id &&
      context.membershipId !== caregiverMem.id
    ) {
      throw new ForbiddenException(
        'Only the beneficiary, caregiver, or staff can request authorization',
      );
    }
    if (dto.authorizationDocumentId) {
      const document = await this.documentRepo.findOne({
        where: { id: dto.authorizationDocumentId },
        relations: ['membership'],
      });
      if (
        !document ||
        document.membership?.organizationId !== orgId ||
        ![beneficiaryMem.id, caregiverMem.id].includes(document.membershipId) ||
        (!this.isStaff(context) && document.membershipId !== context.membershipId)
      ) {
        throw new ForbiddenException(
          'Authorization document is not accessible for this relationship',
        );
      }
    }

    const existing = await this.caregiverAuthRepo.findOne({
      where: {
        organizationId: orgId,
        beneficiaryMembershipId: dto.beneficiaryMembershipId,
        caregiverMembershipId: dto.caregiverMembershipId,
      },
    });

    if (existing && existing.status === CaregiverAuthorizationStatus.APPROVED) {
      throw new ConflictException('Caregiver authorization already active');
    }

    const auth = this.caregiverAuthRepo.create({
      organizationId: orgId,
      beneficiaryMembershipId: dto.beneficiaryMembershipId,
      caregiverMembershipId: dto.caregiverMembershipId,
      relationshipType: dto.relationshipType,
      status: CaregiverAuthorizationStatus.PENDING_REVIEW,
      authorizationDocumentId: dto.authorizationDocumentId ?? null,
      canInitiateRequests: dto.canInitiateRequests ?? true,
      canVerifyCompletions: dto.canVerifyCompletions ?? true,
    });

    const saved = await this.caregiverAuthRepo.save(auth);

    await this.auditService.logEvent({
      eventType: 'CAREGIVER_AUTHORIZATION_REQUESTED',
      actorId,
      targetId: saved.id,
      targetType: 'caregiver_authorizations',
      organizationId: orgId,
      payload: {
        beneficiaryMembershipId: saved.beneficiaryMembershipId,
        caregiverMembershipId: saved.caregiverMembershipId,
        relationshipType: saved.relationshipType,
      },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async reviewCaregiverAuthorization(
    orgId: string,
    authorizationId: string,
    dto: ReviewCaregiverAuthorizationDto,
    reviewerId: string,
    ipAddress?: string,
  ): Promise<CaregiverAuthorization> {
    const auth = await this.caregiverAuthRepo.findOne({
      where: { id: authorizationId, organizationId: orgId },
    });
    if (!auth) {
      throw new NotFoundException(`Caregiver authorization '${authorizationId}' not found`);
    }

    auth.status = dto.status;
    if (dto.status === CaregiverAuthorizationStatus.APPROVED) {
      auth.approvedByUserId = reviewerId;
      auth.approvedAt = new Date();
    } else if (dto.status === CaregiverAuthorizationStatus.REVOKED) {
      auth.revokedByUserId = reviewerId;
      auth.revokedAt = new Date();
      auth.revocationReason = dto.revocationReason ?? dto.notes ?? 'Revoked by coordinator';
    }

    const saved = await this.caregiverAuthRepo.save(auth);

    await this.auditService.logEvent({
      eventType: 'CAREGIVER_AUTHORIZATION_REVIEWED',
      actorId: reviewerId,
      targetId: saved.id,
      targetType: 'caregiver_authorizations',
      organizationId: orgId,
      payload: { status: saved.status, reason: auth.revocationReason },
      ipAddress: ipAddress ?? null,
    });

    return saved;
  }

  async verifyCaregiverProxyAccess(
    orgId: string,
    caregiverMembershipId: string,
    beneficiaryMembershipId: string,
  ): Promise<CaregiverAuthorization> {
    const auth = await this.caregiverAuthRepo.findOne({
      where: {
        organizationId: orgId,
        caregiverMembershipId,
        beneficiaryMembershipId,
        status: CaregiverAuthorizationStatus.APPROVED,
      },
    });

    if (!auth || !auth.canInitiateRequests) {
      throw new ForbiddenException(
        'Active caregiver authorization not found or proxy request initiation permission denied (D#8, D#37)',
      );
    }

    return auth;
  }

  async listCaregiversForBeneficiary(
    orgId: string,
    beneficiaryMembershipId: string,
    actorId: string,
  ): Promise<CaregiverAuthorization[]> {
    const context = await this.assertBeneficiaryAccess(orgId, beneficiaryMembershipId, actorId);
    return this.caregiverAuthRepo.find({
      where: {
        organizationId: orgId,
        beneficiaryMembershipId,
        ...(!this.isStaff(context) && context.membershipId !== beneficiaryMembershipId
          ? {
              caregiverMembershipId: context.membershipId,
              status: CaregiverAuthorizationStatus.APPROVED,
            }
          : {}),
      },
    });
  }

  async listCareRecipientsForCaregiver(
    orgId: string,
    caregiverMembershipId: string,
  ): Promise<CaregiverAuthorization[]> {
    return this.caregiverAuthRepo.find({
      where: {
        organizationId: orgId,
        caregiverMembershipId,
        status: CaregiverAuthorizationStatus.APPROVED,
      },
      relations: ['beneficiaryMembership', 'beneficiaryMembership.user'],
    });
  }

  async listMyCareRecipients(orgId: string, actorId: string) {
    const context = await this.authorizationService.evaluateOrganizationAccess(actorId, orgId);
    if (!context.roles.includes(UserRole.CAREGIVER)) {
      throw new ForbiddenException('Approved caregiver role required');
    }
    const authorizations = await this.caregiverAuthRepo.find({
      where: {
        organizationId: orgId,
        caregiverMembershipId: context.membershipId,
        status: CaregiverAuthorizationStatus.APPROVED,
        canInitiateRequests: true,
      },
      relations: ['beneficiaryMembership'],
      order: { createdAt: 'DESC' },
    });
    return authorizations.map((authorization) => ({
      id: authorization.id,
      organizationId: authorization.organizationId,
      beneficiaryMembershipId: authorization.beneficiaryMembershipId,
      caregiverMembershipId: authorization.caregiverMembershipId,
      relationshipType: authorization.relationshipType,
      status: authorization.status,
      canInitiateRequests: authorization.canInitiateRequests,
      canVerifyCompletions: authorization.canVerifyCompletions,
      beneficiaryMembership: authorization.beneficiaryMembership
        ? {
            id: authorization.beneficiaryMembership.id,
            membershipNumber: authorization.beneficiaryMembership.membershipNumber,
          }
        : null,
    }));
  }

  private isStaff(context: EvaluatedMembershipContext): boolean {
    return (
      context.isSuperAdmin ||
      context.roles.some((role) =>
        [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN].includes(role),
      )
    );
  }

  private async assertBeneficiaryAccess(
    orgId: string,
    membershipId: string,
    actorId: string,
  ): Promise<EvaluatedMembershipContext> {
    const context = await this.authorizationService.evaluateOrganizationAccess(actorId, orgId);
    const membership = await this.membershipRepo.findOne({
      where: { id: membershipId, organizationId: orgId },
    });
    if (!membership) {
      throw new NotFoundException('Beneficiary membership not found in this organization');
    }
    if (this.isStaff(context) || context.membershipId === membershipId) return context;
    const relationship = await this.caregiverAuthRepo.findOne({
      where: {
        organizationId: orgId,
        beneficiaryMembershipId: membershipId,
        caregiverMembershipId: context.membershipId,
        status: CaregiverAuthorizationStatus.APPROVED,
      },
    });
    if (!relationship) {
      throw new ForbiddenException(
        'Beneficiary records require ownership, staff authority, or an approved caregiver relationship',
      );
    }
    return context;
  }
}
