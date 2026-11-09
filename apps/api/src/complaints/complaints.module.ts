import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CentralComplaintsController, ComplaintsController } from './complaints.controller';
import { ComplaintsService } from './complaints.service';

@Module({
  imports: [AuditModule, AuthorizationModule, NotificationsModule],
  controllers: [ComplaintsController, CentralComplaintsController],
  providers: [ComplaintsService],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
