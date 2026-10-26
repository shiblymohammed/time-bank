import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BeneficiaryEligibility } from './entities/beneficiary-eligibility.entity';
import { CaregiverAuthorization } from './entities/caregiver-authorization.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { ServiceRequest } from '../requests/entities/service-request.entity';

import { BeneficiariesService } from './beneficiaries.service';
import { BeneficiariesController } from './beneficiaries.controller';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BeneficiaryEligibility,
      CaregiverAuthorization,
      OrganizationMembership,
      ServiceRequest,
    ]),
    AuditModule,
    AuthorizationModule,
  ],
  controllers: [BeneficiariesController],
  providers: [BeneficiariesService],
  exports: [BeneficiariesService],
})
export class BeneficiariesModule {}
