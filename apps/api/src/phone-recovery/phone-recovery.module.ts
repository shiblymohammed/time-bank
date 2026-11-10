import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RestrictionsModule } from '../restrictions/restrictions.module';
import {
  CentralPhoneRecoveriesController,
  CommunityPhoneRecoveriesController,
  MyPhoneRecoveryController,
} from './phone-recovery.controller';
import { PhoneRecoveryService } from './phone-recovery.service';

@Module({
  imports: [AuditModule, AuthorizationModule, NotificationsModule, RestrictionsModule],
  controllers: [
    CommunityPhoneRecoveriesController,
    CentralPhoneRecoveriesController,
    MyPhoneRecoveryController,
  ],
  providers: [PhoneRecoveryService],
})
export class PhoneRecoveryModule {}
