import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from './entities/organization.entity';
import { OrganizationBranding } from './entities/organization-branding.entity';
import { OrganizationAppBuild } from './entities/organization-app-build.entity';
import { User } from '../identity/entities/user.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { MembershipRoleGrant } from '../memberships/entities/membership-role-grant.entity';
import { MembershipApproval } from '../memberships/entities/membership-approval.entity';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      OrganizationBranding,
      OrganizationAppBuild,
      User,
      OrganizationMembership,
      MembershipRoleGrant,
      MembershipApproval,
    ]),
  ],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
