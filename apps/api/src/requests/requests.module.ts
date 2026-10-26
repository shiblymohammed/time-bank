import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ServiceRequest } from './entities/service-request.entity';
import { RequestCancellation } from './entities/request-cancellation.entity';
import { RequestRescheduleHistory } from './entities/request-reschedule.entity';
import { OrganizationServiceCatalog } from '../catalogue/entities/organization-service-catalog.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { VolunteerAssignment } from '../matching/entities/volunteer-assignment.entity';

import { RequestsService } from './requests.service';
import { RequestsController } from './requests.controller';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { BeneficiariesModule } from '../beneficiaries/beneficiaries.module';
import { MatchingModule } from '../matching/matching.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceRequest,
      RequestCancellation,
      RequestRescheduleHistory,
      OrganizationServiceCatalog,
      OrganizationMembership,
      Organization,
      VolunteerAssignment,
    ]),
    AuditModule,
    AuthorizationModule,
    BeneficiariesModule,
    forwardRef(() => MatchingModule),
  ],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
