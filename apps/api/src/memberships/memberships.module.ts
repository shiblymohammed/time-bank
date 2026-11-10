import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Organization } from '../organizations/entities/organization.entity';
import { User } from '../identity/entities/user.entity';
import { OrganizationMembership } from './entities/organization-membership.entity';
import { MembershipRoleGrant } from './entities/membership-role-grant.entity';
import { MembershipApproval } from './entities/membership-approval.entity';
import { MembershipDocument } from './entities/membership-document.entity';

import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { Ward } from '../wards/entities/ward.entity';
import { WardsService } from '../wards/wards.service';
import { WardNocController, WardsController } from '../wards/wards.controller';
import { DocumentStorage } from '../wards/noc-storage';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      User,
      OrganizationMembership,
      MembershipRoleGrant,
      MembershipApproval,
      MembershipDocument,
      Ward,
    ]),
  ],
  controllers: [MembershipsController, WardsController, WardNocController],
  providers: [MembershipsService, WardsService, DocumentStorage],
  exports: [MembershipsService, WardsService],
})
export class MembershipsModule {}
