import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationOutbox } from './entities/notification-outbox.entity';
import { PushDevice } from './entities/push-device.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsWorker } from './notifications.worker';
import { PushSender } from './push-sender.service';

@Module({
  imports: [TypeOrmModule.forFeature([PushDevice, NotificationOutbox])],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsWorker, PushSender],
  exports: [NotificationsService],
})
export class NotificationsModule {}
