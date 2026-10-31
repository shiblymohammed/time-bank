import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@ktb/shared-types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthorizationService, EvaluatedMembershipContext } from '../authorization.service';

/**
 * RolesGuard
 * Checks if the caller possesses at least one of the roles declared via `@Roles(...)`.
 * Expects `request.organizationMembership` to have been populated by `OrganizationAccessGuard`.
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

    const membershipContext: EvaluatedMembershipContext | undefined =
      request.organizationMembership;

    if (!membershipContext) {
      const userId = request.user?.id;
      if (!userId) {
        throw new ForbiddenException('Authentication required');
      }
      const current = await this.authorizationService.evaluateGlobalAccess(userId);
      const hasRole = requiredRoles.some((role) => current.roles.includes(role));
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
