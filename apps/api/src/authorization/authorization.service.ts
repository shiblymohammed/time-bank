import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AccountStatus,
  MembershipStatus,
  RoleGrantStatus,
  UserRole,
  OrganizationStatus,
  GlobalRestrictionStatus,
} from '@ktb/shared-types';
import { User } from '../identity/entities/user.entity';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { MembershipRoleGrant } from '../memberships/entities/membership-role-grant.entity';

export interface EvaluatedMembershipContext {
  userId: string;
  organizationId: string;
  membershipId: string;
  membershipStatus: MembershipStatus;
  roles: UserRole[];
  isSuperAdmin: boolean;
}

@Injectable()
export class AuthorizationService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationMembership)
    private readonly membershipRepo: Repository<OrganizationMembership>,
    @InjectRepository(MembershipRoleGrant)
    private readonly roleGrantRepo: Repository<MembershipRoleGrant>,
    @InjectRepository(GlobalAccountRestriction)
    private readonly restrictionRepo: Repository<GlobalAccountRestriction>,
  ) {}

  /** Validates platform administration against current account and role records. */
  async assertGlobalSuperAdmin(userId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Active account required');
    }
    const restriction = await this.restrictionRepo.findOne({
      where: { userId, status: GlobalRestrictionStatus.ACTIVE },
    });
    if (restriction) throw new ForbiddenException('Global account restriction active');
    const grant = await this.roleGrantRepo
      .createQueryBuilder('grant')
      .innerJoin('grant.membership', 'm')
      .where('m.userId = :userId', { userId })
      .andWhere('grant.role = :role', { role: UserRole.SUPER_ADMIN })
      .andWhere('grant.status = :status', { status: RoleGrantStatus.ACTIVE })
      .andWhere('m.status = :mStatus', { mStatus: MembershipStatus.APPROVED })
      .getOne();
    if (!grant) throw new ForbiddenException('Super Admin access required');
  }

  /**
   * Evaluates if a user has access to an organization.
   * Enforces:
   *  - User must exist and not be globally suspended/banned
   *  - Organization must exist and be ACTIVE
   *  - User must have an APPROVED membership in the organization (unless Super Admin)
   */
  async evaluateOrganizationAccess(
    userId: string,
    organizationId: string,
  ): Promise<EvaluatedMembershipContext> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new ForbiddenException('User identity not found');
    }

    // 1. Check account lifecycle status
    if (user.status !== AccountStatus.ACTIVE) {
      throw new ForbiddenException(`Global account is ${user.status.toLowerCase()}`);
    }

    // 2. Check active global account restrictions
    const activeRestriction = await this.restrictionRepo.findOne({
      where: {
        userId,
        status: GlobalRestrictionStatus.ACTIVE,
      },
    });

    if (activeRestriction) {
      throw new ForbiddenException(
        `Global account restriction active: ${activeRestriction.restrictionType}`,
      );
    }

    // 3. Check organization exists and is ACTIVE
    const organization = await this.orgRepo.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new ForbiddenException('Organization not found');
    }

    if (organization.status !== OrganizationStatus.ACTIVE) {
      throw new ForbiddenException(`Organization is ${organization.status.toLowerCase()}`);
    }

    // 4. Check if user is a Super Admin (Super Admins have universal platform access)
    const superAdminGrant = await this.roleGrantRepo
      .createQueryBuilder('grant')
      .innerJoin('grant.membership', 'm')
      .where('m.userId = :userId', { userId })
      .andWhere('grant.role = :role', { role: UserRole.SUPER_ADMIN })
      .andWhere('grant.status = :status', { status: RoleGrantStatus.ACTIVE })
      .andWhere('m.status = :mStatus', { mStatus: MembershipStatus.APPROVED })
      .getOne();

    const isSuperAdmin = Boolean(superAdminGrant);

    // 5. Look up organization membership
    const membership = await this.membershipRepo.findOne({
      where: { userId, organizationId },
      relations: ['roleGrants'],
    });

    if (!membership && !isSuperAdmin) {
      throw new ForbiddenException('Not a member of this organization');
    }

    if (membership && membership.status !== MembershipStatus.APPROVED && !isSuperAdmin) {
      throw new ForbiddenException(
        `Membership in this organization is ${membership.status.toLowerCase()}`,
      );
    }

    // 6. Collect active roles scoped to this organization
    const activeRoles: UserRole[] = (membership?.roleGrants ?? [])
      .filter((rg) => rg.status === RoleGrantStatus.ACTIVE)
      .map((rg) => rg.role);

    if (isSuperAdmin && !activeRoles.includes(UserRole.SUPER_ADMIN)) {
      activeRoles.push(UserRole.SUPER_ADMIN);
    }

    return {
      userId,
      organizationId,
      membershipId: membership?.id ?? 'super-admin-bypass',
      membershipStatus: membership?.status ?? MembershipStatus.APPROVED,
      roles: activeRoles,
      isSuperAdmin,
    };
  }

  /**
   * Verifies if a user has at least one of the specified roles in an organization.
   */
  async hasRoleInOrganization(
    userId: string,
    organizationId: string,
    allowedRoles: UserRole[],
  ): Promise<boolean> {
    const context = await this.evaluateOrganizationAccess(userId, organizationId);

    if (context.isSuperAdmin) {
      return true;
    }

    return allowedRoles.some((role) => context.roles.includes(role));
  }

  /**
   * Checks for self-escalation attempt.
   * A user cannot grant themselves roles or approve their own membership/promotions (Section 5, AT-M2-09).
   */
  assertNoSelfEscalation(actorId: string, targetUserId: string, attemptedRole?: UserRole): void {
    if (actorId === targetUserId) {
      throw new ForbiddenException(
        `Self-escalation denied: cannot grant or approve privileges for own identity${
          attemptedRole ? ` (${attemptedRole})` : ''
        }`,
      );
    }
  }
}
