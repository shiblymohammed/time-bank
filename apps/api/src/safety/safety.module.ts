import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { BeneficiariesModule } from '../beneficiaries/beneficiaries.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SafetyController } from './safety.controller';
import { SafetyService } from './safety.service';

@Module({
  imports: [AuditModule, AuthorizationModule, BeneficiariesModule, NotificationsModule],
  controllers: [SafetyController],
  providers: [SafetyService],
})
export class SafetyModule {}
