import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@ktb/shared-types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthorizationService, EvaluatedMembershipContext } from '../authorization.service';

/**
 * RolesGuard
 * Checks if the caller possesses at least one of the roles declared via `@Roles(...)`.
 * Tenant roles require OrganizationAccessGuard; global Super Admin routes validate current DB grants.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles specified, allow through
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Central Super Admin override
    if (request.user?.isSuperAdmin) {
      return true;
    }

    const membershipContext: EvaluatedMembershipContext | undefined =
      request.organizationMembership;

    if (
      !membershipContext &&
      requiredRoles.length === 1 &&
      requiredRoles[0] === UserRole.SUPER_ADMIN
    ) {
      const userId = request.user?.id;
      if (!userId) throw new ForbiddenException('Authentication required');
      await this.authorizationService.assertGlobalSuperAdmin(userId);
      return true;
    }

    if (!membershipContext) {
      const userRoles: UserRole[] = request.user?.roles ?? [];
      const hasRole = requiredRoles.some((role) => userRoles.includes(role));
      if (hasRole) {
        return true;
      }
      throw new ForbiddenException(
        'Insufficient role permissions. Super Admin or approved organization membership required.',
      );
    }

    // Super Admin has universal override within org context
    if (membershipContext.isSuperAdmin) {
      return true;
    }

    const hasRole = requiredRoles.some((role) => membershipContext.roles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient role permissions in this organization. Required: [${requiredRoles.join(
          ', ',
        )}]. Current: [${membershipContext.roles.join(', ')}]`,
      );
    }

    return true;
  }
}
