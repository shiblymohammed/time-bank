import { Module } from '@nestjs/common';
import { InstantHelpService } from './instant-help.service';
import { InstantHelpController } from './instant-help.controller';
import { TimeLedgerModule } from '../time-ledger/time-ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
@Module({
  imports: [TimeLedgerModule, NotificationsModule],
  controllers: [InstantHelpController],
  providers: [InstantHelpService],
})
export class InstantHelpModule {}
