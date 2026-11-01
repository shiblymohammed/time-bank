import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@ktb/shared-types';

/**
 * Role hierarchy and authorization service.
 *
 * Enforces the role hierarchy defined in PRD §2 (D#2):
 *   SUPER_ADMIN → MUNICIPALITY_ADMIN → COORDINATOR → VOLUNTEER/BENEFICIARY/CAREGIVER/MERCHANT
 *
 * Critical security boundary: prevents privilege escalation attacks where lower-privileged
 * users attempt to grant themselves or others higher privileges (Finding #1 from security audit).
 */
@Injectable()
export class RoleHierarchyService {
  /**
   * Global administrative roles that should NEVER be granted through
   * organization membership workflows. These can only be granted by
   * Super Admins through the dedicated admin endpoints.
   */
  private readonly GLOBAL_ADMIN_ROLES = new Set<UserRole>([UserRole.SUPER_ADMIN]);

  /**
   * Organization administrative roles that can only be granted by
   * Super Admins, never by Municipality Admins or Coordinators.
   */
  private readonly ORG_ADMIN_ROLES = new Set<UserRole>([UserRole.MUNICIPALITY_ADMIN]);

  /**
   * Operational roles that can be granted by Coordinators and Municipality Admins
   * during normal membership workflows.
   */
  private readonly OPERATIONAL_ROLES = new Set<UserRole>([
    UserRole.COORDINATOR,
    UserRole.VOLUNTEER,
    UserRole.BENEFICIARY,
    UserRole.CAREGIVER,
    UserRole.MERCHANT,
  ]);

  /**
   * Validates whether the granter has authority to assign the target role.
   *
   * Hierarchy rules:
   * - SUPER_ADMIN: Can grant any role
   * - MUNICIPALITY_ADMIN: Can grant COORDINATOR, VOLUNTEER, BENEFICIARY, CAREGIVER, MERCHANT
   *   (Cannot grant SUPER_ADMIN or MUNICIPALITY_ADMIN)
   * - COORDINATOR: Can grant VOLUNTEER, BENEFICIARY, CAREGIVER, MERCHANT
   *   (Cannot grant SUPER_ADMIN, MUNICIPALITY_ADMIN, or COORDINATOR)
   *
   * @param granterRole - The role of the user attempting to grant privileges
   * @param targetRole - The role being granted
   * @throws ForbiddenException if the granter lacks authority
   */
  assertCanGrantRole(granterRole: UserRole, targetRole: UserRole): void {
    if (!Object.values(UserRole).includes(targetRole)) {
      throw new ForbiddenException('Unrecognized role');
    }
    // Super Admins can grant any role
    if (granterRole === UserRole.SUPER_ADMIN) {
      return;
    }

    // SUPER_ADMIN can never be granted through organization workflows
    if (this.GLOBAL_ADMIN_ROLES.has(targetRole)) {
      throw new ForbiddenException(
        `${targetRole} is a global administrative role and cannot be granted through organization workflows`,
      );
    }

    // Municipality Admins can grant operational roles and coordinators, but not other admins
    if (granterRole === UserRole.MUNICIPALITY_ADMIN) {
      if (this.ORG_ADMIN_ROLES.has(targetRole)) {
        throw new ForbiddenException(
          `${granterRole} cannot grant ${targetRole} - only SUPER_ADMIN can grant administrative roles`,
        );
      }
      // Can grant operational roles and coordinators
      return;
    }

    // Coordinators can only grant operational roles (not COORDINATOR itself)
    if (granterRole === UserRole.COORDINATOR) {
      if (targetRole === UserRole.COORDINATOR) {
        throw new ForbiddenException(
          `${granterRole} cannot grant COORDINATOR role - requires MUNICIPALITY_ADMIN or SUPER_ADMIN`,
        );
      }

      if (this.ORG_ADMIN_ROLES.has(targetRole) || this.GLOBAL_ADMIN_ROLES.has(targetRole)) {
        throw new ForbiddenException(`${granterRole} cannot grant administrative roles`);
      }

      // Can grant volunteer, beneficiary, caregiver, merchant
      return;
    }

    // No other roles can grant privileges
    throw new ForbiddenException(`${granterRole} does not have authority to grant roles`);
  }

  /**
   * Validates that the target role is appropriate for organization membership workflows.
   *
   * Used during membership approval to ensure coordinators don't attempt to grant
   * administrative roles through the initial approval flow.
   *
   * @param role - The role to validate
   * @throws ForbiddenException if the role is not valid for membership workflows
   */
  assertValidMembershipRole(role: UserRole): void {
    if (this.GLOBAL_ADMIN_ROLES.has(role)) {
      throw new ForbiddenException(
        `${role} is a global administrative role and cannot be granted during membership approval`,
      );
    }

    if (!this.OPERATIONAL_ROLES.has(role) && !this.ORG_ADMIN_ROLES.has(role)) {
      throw new ForbiddenException(`${role} is not a valid organization membership role`);
    }
  }

  /**
   * Returns whether a role is an operational (non-administrative) role.
   * Useful for UI filtering and workflow logic.
   */
  isOperationalRole(role: UserRole): boolean {
    return this.OPERATIONAL_ROLES.has(role);
  }

  /**
   * Returns whether a role requires Super Admin privileges to grant.
   */
  requiresSuperAdminToGrant(role: UserRole): boolean {
    return this.GLOBAL_ADMIN_ROLES.has(role) || this.ORG_ADMIN_ROLES.has(role);
  }
}
