import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthorizationService } from '../authorization.service';

/**
 * OrganizationAccessGuard
 * Validates that the calling user has active, approved membership in the organization
 * specified in route parameters (:orgId), query (orgId), or header (x-organization-id).
 *
 * Attaches the evaluated membership context to `request.organizationMembership`.
 */
@Injectable()
export class OrganizationAccessGuard implements CanActivate {
  constructor(private readonly authzService: AuthorizationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const userId = request.user?.id ?? request.userId;
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    // Resolve organization ID from route params, query, or custom header
    const orgId =
      request.params?.orgId ??
      request.params?.organizationId ??
      request.query?.orgId ??
      request.headers['x-organization-id'];

    if (!orgId || typeof orgId !== 'string') {
      throw new BadRequestException('Organization context (:orgId) is required for this endpoint');
    }

    const membershipContext = await this.authzService.evaluateOrganizationAccess(userId, orgId);

    // Attach verified tenant membership context to the request
    request.organizationMembership = membershipContext;
    request.activeOrgId = orgId;

    return true;
  }
}
