import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, In } from 'typeorm';
import {
  AccountStatus,
  GlobalRestrictionStatus,
  GlobalRestrictionType,
  MembershipStatus,
  OrganizationStatus,
  RoleGrantStatus,
  UserRole,
} from '@ktb/shared-types';

import { User } from '../identity/entities/user.entity';
import { UniversalTimeWallet } from '../identity/entities/universal-time-wallet.entity';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { MembershipRoleGrant } from '../memberships/entities/membership-role-grant.entity';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { RoleHierarchyService } from '../authorization/role-hierarchy.service';
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
    private readonly authorizationService: AuthorizationService,
    private readonly roleHierarchyService: RoleHierarchyService,
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

    return this.userRepo.manager.transaction(async (m) => {
      const user = await m.getRepository(User).findOne({ where: { id: dto.userId } });
      if (!user) {
        throw new NotFoundException('Target user not found');
      }
      // Every restriction type removes access, including a Super Admin's.
      if (await this.holdsSuperAdmin(m, dto.userId)) {
        await this.assertSuperAdminRemains(m, { userId: dto.userId });
      }

      const restrictions = m.getRepository(GlobalAccountRestriction);
      const saved = await restrictions.save(
        restrictions.create({
          userId: dto.userId,
          restrictionType: dto.restrictionType,
          reasonCode: dto.reasonCode,
          status: GlobalRestrictionStatus.ACTIVE,
          authorizedBy: adminId,
        }),
      );

      // Apply corresponding account status update
      if (dto.restrictionType === GlobalRestrictionType.PERMANENT_BAN) {
        user.status = AccountStatus.PERMANENTLY_BANNED;
        await m.getRepository(User).save(user);
      } else if (dto.restrictionType === GlobalRestrictionType.TEMPORARY_SUSPENSION) {
        user.status = AccountStatus.SUSPENDED;
        await m.getRepository(User).save(user);
      }
      // Stop push to the person's phones; they register again after signing back in.
      await m.query('DELETE FROM push_devices WHERE user_id = $1', [user.id]);

      await this.auditService.logEvent(
        {
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
        },
        m,
      );

      return saved;
    });
  }

  private async holdsSuperAdmin(m: EntityManager, userId: string): Promise<boolean> {
    const rows: unknown[] = await m.query(
      `SELECT 1 FROM membership_role_grants g
       JOIN organization_memberships om ON om.id = g.membership_id
       WHERE om.user_id = $1 AND g.role = $2 AND g.status = $3 LIMIT 1`,
      [userId, UserRole.SUPER_ADMIN, RoleGrantStatus.ACTIVE],
    );
    return rows.length > 0;
  }

  /**
   * Refuses a change that would leave no one able to act as Super Admin. Changes are
   * taken one at a time, so two admins cannot remove each other at the same moment.
   */
  private async assertSuperAdminRemains(
    m: EntityManager,
    without: { userId?: string; grantId?: string },
  ): Promise<void> {
    await m.query(`SELECT pg_advisory_xact_lock(hashtext('ktb:super-admins'))`);
    if (!(await this.countSuperAdmins(m, without))) {
      throw new ConflictException(
        'This would leave no active Super Admin. Make someone else a Super Admin first.',
      );
    }
  }

  /** People who can act as Super Admin right now, leaving out a user or one grant. */
  private async countSuperAdmins(
    m: EntityManager,
    without: { userId?: string; grantId?: string },
  ): Promise<number> {
    const rows: { remaining: number }[] = await m.query(
      `SELECT COUNT(DISTINCT om.user_id)::int AS remaining
       FROM membership_role_grants g
       JOIN organization_memberships om ON om.id = g.membership_id
       JOIN users u ON u.id = om.user_id
       WHERE g.role = $1 AND g.status = $2 AND om.status = $3 AND u.status = $4
         AND ($5::uuid IS NULL OR om.user_id <> $5::uuid)
         AND ($6::uuid IS NULL OR g.id <> $6::uuid)
         AND NOT EXISTS (SELECT 1 FROM global_account_restrictions r
           WHERE r.user_id = u.id AND r.status = $7)`,
      [
        UserRole.SUPER_ADMIN,
        RoleGrantStatus.ACTIVE,
        MembershipStatus.APPROVED,
        AccountStatus.ACTIVE,
        without.userId ?? null,
        without.grantId ?? null,
        GlobalRestrictionStatus.ACTIVE,
      ],
    );
    return rows[0]?.remaining ?? 0;
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

    if (restriction.userId === adminId) {
      throw new ForbiddenException('Cannot resolve a restriction on your own account');
    }
    const authority = await this.authorizationService.evaluateGlobalAccess(adminId);
    if (!authority.isSuperAdmin) {
      throw new ForbiddenException('Current Super Admin authority required');
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
    if (dto.userId === adminId) {
      throw new ForbiddenException('Cannot grant roles to yourself');
    }

    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) {
      throw new NotFoundException('Target user not found');
    }
    const restricted = await this.restrictionRepo.count({
      where: { userId: dto.userId, status: GlobalRestrictionStatus.ACTIVE },
    });
    if (user.status !== AccountStatus.ACTIVE || restricted > 0) {
      throw new ConflictException('This account is suspended, banned or restricted');
    }

    // SECURITY: Validate role hierarchy - Super Admins can grant any role
    // but the role must be valid for organization workflows
    this.roleHierarchyService.assertCanGrantRole(UserRole.SUPER_ADMIN, dto.role);

    // SECURITY: Prevent self-escalation
    this.authorizationService.assertNoSelfEscalation(adminId, dto.userId, dto.role);

    // Find or create membership for this organization
    let membership = await this.membershipRepo.findOne({
      where: { organizationId: orgId, userId: dto.userId },
      relations: ['roleGrants'],
    });

    if (!membership) {
      // A new staff membership gets a member number like any approved member.
      const [counter]: { membership_sequence: number }[] = await this.orgRepo.query(
        `UPDATE organizations SET membership_sequence = membership_sequence + 1
         WHERE id = $1 RETURNING membership_sequence`,
        [orgId],
      );
      const sequence = String(counter?.membership_sequence ?? 0).padStart(4, '0');
      membership = this.membershipRepo.create({
        organizationId: orgId,
        userId: dto.userId,
        status: MembershipStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: adminId,
        membershipNumber: `${org.code}-${new Date().getFullYear()}-${sequence}`,
      });
      membership = await this.membershipRepo.save(membership);
    } else if (membership.status !== MembershipStatus.APPROVED) {
      // A refused, suspended or unreviewed membership is decided in the member review,
      // not silently approved by giving it a role.
      const state: Record<string, string> = {
        [MembershipStatus.APPLIED]: 'is still waiting for review',
        [MembershipStatus.PENDING_REVIEW]: 'is still waiting for review',
        [MembershipStatus.REJECTED]: 'was refused',
        [MembershipStatus.SUSPENDED]: 'is suspended',
        [MembershipStatus.REVOKED]: 'was removed',
      };
      throw new ConflictException(
        `This membership ${state[membership.status] ?? 'is not approved'}. Decide it in the member review first.`,
      );
    }

    // Check if role is already granted and active
    const activeGrant = await this.roleGrantRepo.findOne({
      where: {
        membershipId: membership.id,
        role: dto.role,
        status: In([RoleGrantStatus.ACTIVE, RoleGrantStatus.PENDING_APPROVAL]),
      },
    });

    if (activeGrant) {
      throw new ConflictException(
        'User already has an active grant for this role in this organization',
      );
    }

    // A new Super Admin needs a second Super Admin's approval, unless the one asking is
    // the only Super Admin there is: then nobody else could ever approve it.
    const needsSecondApproval =
      dto.role === UserRole.SUPER_ADMIN &&
      (await this.countSuperAdmins(this.userRepo.manager, { userId: adminId })) > 0;
    const newGrant = this.roleGrantRepo.create({
      membershipId: membership.id,
      role: dto.role,
      status: needsSecondApproval ? RoleGrantStatus.PENDING_APPROVAL : RoleGrantStatus.ACTIVE,
      grantedBy: adminId,
    });
    const saved = await this.roleGrantRepo.save(newGrant);

    await this.auditService.logEvent({
      eventType: needsSecondApproval ? 'SUPER_ADMIN_APPROVAL_REQUESTED' : 'MEMBERSHIP_ROLE_GRANTED',
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
    return this.roleGrantRepo.manager.transaction(async (m) => {
      const grants = m.getRepository(MembershipRoleGrant);
      const grant = await grants.findOne({
        where: { id: roleGrantId },
        lock: { mode: 'pessimistic_write' },
      });
      const membership = grant
        ? await m.getRepository(OrganizationMembership).findOne({
            where: { id: grant.membershipId },
          })
        : null;

      if (!grant || membership?.organizationId !== orgId) {
        throw new NotFoundException('Role grant not found for this organization');
      }

      if (grant.status === RoleGrantStatus.REVOKED) {
        throw new BadRequestException('Role grant is already revoked');
      }
      if (grant.role === UserRole.SUPER_ADMIN && grant.status === RoleGrantStatus.ACTIVE) {
        await this.assertSuperAdminRemains(m, { grantId: grant.id });
      }

      grant.status = RoleGrantStatus.REVOKED;
      grant.revokedAt = new Date();
      grant.revokedBy = adminId;
      grant.revocationReason = dto.reason ?? 'Revoked by Super Admin';
      const saved = await grants.save(grant);

      await this.auditService.logEvent(
        {
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
        },
        m,
      );

      return saved;
    });
  }

  /** A second Super Admin turns a waiting Super Admin grant on. */
  async approveOrganizationRole(
    orgId: string,
    roleGrantId: string,
    adminId: string,
    ipAddress?: string,
  ): Promise<MembershipRoleGrant> {
    return this.roleGrantRepo.manager.transaction(async (m) => {
      const grants = m.getRepository(MembershipRoleGrant);
      const grant = await grants.findOne({
        where: { id: roleGrantId },
        lock: { mode: 'pessimistic_write' },
      });
      const membership = grant
        ? await m.getRepository(OrganizationMembership).findOne({
            where: { id: grant.membershipId },
          })
        : null;
      if (!grant || !membership || membership.organizationId !== orgId) {
        throw new NotFoundException('Role grant not found for this organization');
      }
      if (grant.status !== RoleGrantStatus.PENDING_APPROVAL) {
        throw new ConflictException('This role is not waiting for approval');
      }
      if (grant.grantedBy === adminId) {
        throw new ForbiddenException('A different Super Admin must approve this');
      }
      if (membership.userId === adminId) {
        throw new ForbiddenException('You cannot approve your own Super Admin role');
      }
      const authority = await this.authorizationService.evaluateGlobalAccess(adminId, m);
      if (!authority.isSuperAdmin) {
        throw new ForbiddenException('Current Super Admin authority required');
      }
      const user = await m.getRepository(User).findOne({ where: { id: membership.userId } });
      const restricted = await m.getRepository(GlobalAccountRestriction).count({
        where: { userId: membership.userId, status: GlobalRestrictionStatus.ACTIVE },
      });
      if (
        user?.status !== AccountStatus.ACTIVE ||
        restricted > 0 ||
        membership.status !== MembershipStatus.APPROVED
      ) {
        throw new ConflictException('This account is no longer active');
      }

      grant.status = RoleGrantStatus.ACTIVE;
      const saved = await grants.save(grant);
      await this.auditService.logEvent(
        {
          eventType: 'MEMBERSHIP_ROLE_GRANTED',
          actorId: adminId,
          targetId: saved.id,
          targetType: 'MEMBERSHIP_ROLE_GRANT',
          organizationId: orgId,
          ipAddress,
          payload: {
            userId: membership.userId,
            role: grant.role,
            membershipId: membership.id,
            requestedBy: grant.grantedBy,
            approvedBy: adminId,
          },
        },
        m,
      );
      return saved;
    });
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
