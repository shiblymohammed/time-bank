import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SafetyAlert } from './entities/safety-alert.entity';
import { Complaint } from './entities/complaint.entity';
import { Appeal } from './entities/appeal.entity';
import { DeathNominee } from './entities/death-nominee.entity';
import { AccountClosure } from './entities/account-closure.entity';
import { User } from '../identity/entities/user.entity';
import { UniversalTimeWallet } from '../identity/entities/universal-time-wallet.entity';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { ServiceRequest } from '../requests/entities/service-request.entity';

import { GovernanceService } from './governance.service';
import {
  GovernanceController,
  GlobalReportsController,
  NomineeController,
} from './governance.controller';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SafetyAlert,
      Complaint,
      Appeal,
      DeathNominee,
      AccountClosure,
      User,
      UniversalTimeWallet,
      GlobalAccountRestriction,
      OrganizationMembership,
      ServiceRequest,
    ]),
    AuditModule,
    AuthorizationModule,
  ],
  controllers: [GovernanceController, GlobalReportsController, NomineeController],
  providers: [GovernanceService],
  exports: [GovernanceService],
})
export class GovernanceModule {}
