import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../identity/entities/user.entity';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { MembershipRoleGrant } from '../memberships/entities/membership-role-grant.entity';
import { AuthorizationService } from './authorization.service';
import { OrganizationAccessGuard } from './guards/organization-access.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Organization,
      OrganizationMembership,
      MembershipRoleGrant,
      GlobalAccountRestriction,
    ]),
  ],
  providers: [AuthorizationService, OrganizationAccessGuard, RolesGuard],
  exports: [AuthorizationService, OrganizationAccessGuard, RolesGuard],
})
export class AuthorizationModule {}
