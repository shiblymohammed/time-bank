import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  AccountStatus,
  GlobalRestrictionStatus,
  GlobalRestrictionType,
  MembershipStatus,
  OrganizationStatus,
  RoleGrantStatus,
} from '@ktb/shared-types';

import { User } from '../identity/entities/user.entity';
import { UniversalTimeWallet } from '../identity/entities/universal-time-wallet.entity';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { MembershipRoleGrant } from '../memberships/entities/membership-role-grant.entity';
import { AuditService } from '../audit/audit.service';
import { ImposeRestrictionDto } from './dto/impose-restriction.dto';
import { ResolveRestrictionDto } from './dto/resolve-restriction.dto';
import { UpdateOrgStatusDto } from './dto/update-org-status.dto';
import { GrantOrgRoleDto } from './dto/grant-org-role.dto';
import { RevokeOrgRoleDto } from './dto/revoke-org-role.dto';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UniversalTimeWallet)
    private readonly walletRepo: Repository<UniversalTimeWallet>,
    @InjectRepository(GlobalAccountRestriction)
    private readonly restrictionRepo: Repository<GlobalAccountRestriction>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepo: Repository<OrganizationMembership>,
    @InjectRepository(MembershipRoleGrant)
    private readonly roleGrantRepo: Repository<MembershipRoleGrant>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Aggregate platform-wide overview metrics for central Super Admin dashboard (M2-11).
   */
  async getOverviewMetrics() {
    const totalUsers = await this.userRepo.count();
    const totalOrganizations = await this.orgRepo.count();
    const activeOrganizations = await this.orgRepo.count({
      where: { status: OrganizationStatus.ACTIVE },
    });
    const totalUniversalWallets = await this.walletRepo.count();

    const sumResult = await this.walletRepo
      .createQueryBuilder('wallet')
      .select('SUM(wallet.balanceCredits)', 'totalBalance')
      .getRawOne();
    const totalBalanceCredits = parseFloat(sumResult?.totalBalance ?? '0');

    const pendingMemberships = await this.membershipRepo.count({
      where: {
        status: In([MembershipStatus.APPLIED, MembershipStatus.PENDING_REVIEW]),
      },
    });

    return {
      totalUsers,
      totalOrganizations,
      activeOrganizations,
      totalUniversalWallets,
      totalBalanceCredits,
      pendingMemberships,
    };
  }

  /**
   * Impose a platform-wide account restriction (M2-11, D#82, D#83).
   */
  async imposeRestriction(
    dto: ImposeRestrictionDto,
    adminId: string,
    ipAddress?: string,
  ): Promise<GlobalAccountRestriction> {
    if (dto.userId === adminId) {
      throw new BadRequestException('Super Admin cannot impose a restriction on themselves');
    }

    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) {
      throw new NotFoundException('Target user not found');
    }

    const restriction = this.restrictionRepo.create({
      userId: dto.userId,
      restrictionType: dto.restrictionType,
      reasonCode: dto.reasonCode,
      status: GlobalRestrictionStatus.ACTIVE,
      authorizedBy: adminId,
    });
    const saved = await this.restrictionRepo.save(restriction);

    // Apply corresponding account status update
    if (dto.restrictionType === GlobalRestrictionType.PERMANENT_BAN) {
      user.status = AccountStatus.PERMANENTLY_BANNED;
      await this.userRepo.save(user);
    } else if (dto.restrictionType === GlobalRestrictionType.TEMPORARY_SUSPENSION) {
      user.status = AccountStatus.SUSPENDED;
      await this.userRepo.save(user);
    }

    await this.auditService.logEvent({
      eventType: 'GLOBAL_RESTRICTION_IMPOSED',
      actorId: adminId,
      targetId: saved.id,
      targetType: 'GLOBAL_ACCOUNT_RESTRICTION',
      ipAddress,
      payload: {
        userId: dto.userId,
        restrictionType: dto.restrictionType,
        reasonCode: dto.reasonCode,
      },
    });

    return saved;
  }

  /**
   * Resolve an active global account restriction and restore account if cleared.
   */
  async resolveRestriction(
    restrictionId: string,
    dto: ResolveRestrictionDto,
    adminId: string,
    ipAddress?: string,
  ): Promise<GlobalAccountRestriction> {
    const restriction = await this.restrictionRepo.findOne({
      where: { id: restrictionId },
    });
    if (!restriction) {
      throw new NotFoundException('Account restriction not found');
    }

    if (restriction.status !== GlobalRestrictionStatus.ACTIVE) {
      throw new BadRequestException('Restriction is not active');
    }

    restriction.status = GlobalRestrictionStatus.RESOLVED;
    restriction.resolvedAt = new Date();
    restriction.resolvedBy = adminId;
    restriction.resolutionNotes = dto.resolutionNotes;
    const saved = await this.restrictionRepo.save(restriction);

    // Check if target user has any remaining active restrictions
    const otherActive = await this.restrictionRepo.count({
      where: {
        userId: restriction.userId,
        status: GlobalRestrictionStatus.ACTIVE,
      },
    });

    if (otherActive === 0) {
      const user = await this.userRepo.findOne({ where: { id: restriction.userId } });
      if (user && user.status !== AccountStatus.ACTIVE) {
        user.status = AccountStatus.ACTIVE;
        await this.userRepo.save(user);
      }
    }

    await this.auditService.logEvent({
      eventType: 'GLOBAL_RESTRICTION_RESOLVED',
      actorId: adminId,
      targetId: saved.id,
      targetType: 'GLOBAL_ACCOUNT_RESTRICTION',
      ipAddress,
      payload: {
        userId: restriction.userId,
        resolutionNotes: dto.resolutionNotes,
      },
    });

    return saved;
  }

  /**
   * List global account restrictions.
   */
  async listRestrictions(userId?: string, status?: GlobalRestrictionStatus) {
    const qb = this.restrictionRepo.createQueryBuilder('r').innerJoinAndSelect('r.user', 'user');

    if (userId) {
      qb.andWhere('r.userId = :userId', { userId });
    }
    if (status) {
      qb.andWhere('r.status = :status', { status });
    }

    qb.orderBy('r.createdAt', 'DESC');
    return qb.getMany();
  }

  /**
   * Update organization lifecycle status (M2-12).
   */
  async updateOrganizationStatus(
    orgId: string,
    dto: UpdateOrgStatusDto,
    adminId: string,
    ipAddress?: string,
  ): Promise<Organization> {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const previousStatus = org.status;
    org.status = dto.status;
    const saved = await this.orgRepo.save(org);

    await this.auditService.logEvent({
      eventType: 'ORGANIZATION_STATUS_CHANGED',
      actorId: adminId,
      targetId: org.id,
      targetType: 'ORGANIZATION',
      organizationId: org.id,
      ipAddress,
      payload: {
        previousStatus,
        newStatus: dto.status,
        reason: dto.reason ?? null,
      },
    });

    return saved;
  }

  /**
   * Grant / appoint an organization-scoped role to a user (M2-12).
   */
  async grantOrganizationRole(
    orgId: string,
    dto: GrantOrgRoleDto,
    adminId: string,
    ipAddress?: string,
  ): Promise<MembershipRoleGrant> {
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) {
      throw new NotFoundException('Target user not found');
    }

    // Find or create membership for this organization
    let membership = await this.membershipRepo.findOne({
      where: { organizationId: orgId, userId: dto.userId },
      relations: ['roleGrants'],
    });

    if (!membership) {
      membership = this.membershipRepo.create({
        organizationId: orgId,
        userId: dto.userId,
        status: MembershipStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: adminId,
      });
      membership = await this.membershipRepo.save(membership);
    } else if (membership.status !== MembershipStatus.APPROVED) {
      membership.status = MembershipStatus.APPROVED;
      membership.approvedAt = new Date();
      membership.approvedBy = adminId;
      membership = await this.membershipRepo.save(membership);
    }

    // Check if role is already granted and active
    const activeGrant = await this.roleGrantRepo.findOne({
      where: {
        membershipId: membership.id,
        role: dto.role,
        status: RoleGrantStatus.ACTIVE,
      },
    });

    if (activeGrant) {
      throw new ConflictException('User already has an active grant for this role in this organization');
    }

    const newGrant = this.roleGrantRepo.create({
      membershipId: membership.id,
      role: dto.role,
      status: RoleGrantStatus.ACTIVE,
      grantedBy: adminId,
    });
    const saved = await this.roleGrantRepo.save(newGrant);

    await this.auditService.logEvent({
      eventType: 'MEMBERSHIP_ROLE_GRANTED',
      actorId: adminId,
      targetId: saved.id,
      targetType: 'MEMBERSHIP_ROLE_GRANT',
      organizationId: orgId,
      ipAddress,
      payload: {
        userId: dto.userId,
        role: dto.role,
        membershipId: membership.id,
      },
    });

    return saved;
  }

  /**
   * Revoke an organization-scoped role grant (M2-12).
   */
  async revokeOrganizationRole(
    orgId: string,
    roleGrantId: string,
    dto: RevokeOrgRoleDto,
    adminId: string,
    ipAddress?: string,
  ): Promise<MembershipRoleGrant> {
    const grant = await this.roleGrantRepo.findOne({
      where: { id: roleGrantId },
      relations: ['membership'],
    });

    if (!grant || grant.membership?.organizationId !== orgId) {
      throw new NotFoundException('Role grant not found for this organization');
    }

    if (grant.status === RoleGrantStatus.REVOKED) {
      throw new BadRequestException('Role grant is already revoked');
    }

    grant.status = RoleGrantStatus.REVOKED;
    grant.revokedAt = new Date();
    grant.revokedBy = adminId;
    grant.revocationReason = dto.reason ?? 'Revoked by Super Admin';
    const saved = await this.roleGrantRepo.save(grant);

    await this.auditService.logEvent({
      eventType: 'MEMBERSHIP_ROLE_REVOKED',
      actorId: adminId,
      targetId: saved.id,
      targetType: 'MEMBERSHIP_ROLE_GRANT',
      organizationId: orgId,
      ipAddress,
      payload: {
        role: grant.role,
        membershipId: grant.membershipId,
        reason: grant.revocationReason,
      },
    });

    return saved;
  }

  /**
   * Global audit trail querying and filtering (M2-13).
   */
  async queryAuditLogs(query: AuditLogQueryDto) {
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    return this.auditService.queryEvents({
      eventType: query.eventType,
      actorId: query.actorId,
      organizationId: query.organizationId,
      targetId: query.targetId,
      startDate,
      endDate,
      limit: query.limit,
      offset: query.offset,
    });
  }
}
