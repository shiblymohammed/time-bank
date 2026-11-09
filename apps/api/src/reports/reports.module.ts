import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CentralReportsController, CommunityReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsWorker } from './reports.worker';

@Module({
  imports: [AuditModule, AuthorizationModule],
  controllers: [CommunityReportsController, CentralReportsController],
  providers: [ReportsService, ReportsWorker],
})
export class ReportsModule {}
