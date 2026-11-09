import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ComplaintsModule } from '../complaints/complaints.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RequestsModule } from '../requests/requests.module';
import { TimeLedgerModule } from '../time-ledger/time-ledger.module';
import { AppealsService } from './appeals.service';
import {
  CentralRestrictionsController,
  CommunityAppealsController,
  MyRestrictionController,
  RestrictionCasesController,
} from './restrictions.controller';
import { RestrictionsService } from './restrictions.service';
import { RestrictionsWorker } from './restrictions.worker';

@Module({
  imports: [
    AuditModule,
    AuthorizationModule,
    ComplaintsModule,
    NotificationsModule,
    RequestsModule,
    TimeLedgerModule,
  ],
  controllers: [
    RestrictionCasesController,
    CommunityAppealsController,
    CentralRestrictionsController,
    MyRestrictionController,
  ],
  providers: [RestrictionsService, AppealsService, RestrictionsWorker],
  exports: [RestrictionsService],
})
export class RestrictionsModule {}
