import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { EvaluatedMembershipContext } from '../authorization.service';

/**
 * Injects the authenticated user ID from the request.
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.id ?? request.userId;
  },
);

/**
 * Injects the evaluated organization membership context from OrganizationAccessGuard.
 */
export const CurrentMembership = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): EvaluatedMembershipContext | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.organizationMembership;
  },
);
