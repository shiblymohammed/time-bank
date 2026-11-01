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
    if (!organizationId) throw new ForbiddenException('Organization context required');
    const { isSuperAdmin } = await this.evaluateGlobalAccess(userId);

    const organization = await this.orgRepo.findOne({ where: { id: organizationId } });
    if (!organization) {
      throw new ForbiddenException('Organization not found');
    }
    if (organization.status !== OrganizationStatus.ACTIVE) {
      throw new ForbiddenException(`Organization is ${organization.status.toLowerCase()}`);
    }

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

    const activeRoles = (membership?.roleGrants ?? [])
      .filter((grant) => grant.status === RoleGrantStatus.ACTIVE)
      .map((grant) => grant.role);
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

  /** Privileged routes use current database authority, never cached JWT role claims. */
  async evaluateGlobalAccess(
    userId: string,
  ): Promise<{ isSuperAdmin: boolean; roles: UserRole[] }> {
    if (typeof userId !== 'string' || !userId.trim()) {
      throw new ForbiddenException('Authentication required');
    }
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
    return { isSuperAdmin, roles: isSuperAdmin ? [UserRole.SUPER_ADMIN] : [] };
  }

  async assertMembershipAccess(
    userId: string,
    organizationId: string,
    membershipId: string,
  ): Promise<void> {
    if (!membershipId) throw new ForbiddenException('Target membership required');
    const context = await this.evaluateOrganizationAccess(userId, organizationId);
    const target = await this.membershipRepo.findOne({
      where: { id: membershipId, organizationId },
    });
    if (!target) {
      throw new ForbiddenException('Membership is not in this organization');
    }
    if (
      context.membershipId !== membershipId &&
      !context.isSuperAdmin &&
      !context.roles.some((role) =>
        [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN].includes(role),
      )
    ) {
      throw new ForbiddenException('Cannot access another member’s private records');
    }
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
