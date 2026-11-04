import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OutboxEvent } from './entities/outbox-event.entity';
import { SyncOperation } from './entities/sync-operation.entity';

import { OutboxService } from './outbox.service';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';

/**
 * OfflineModule — Milestone 8 Offline Reliability (FR-OFF-01–05, D#47, D#99).
 *
 * Exports OutboxService and SyncService so other modules can use them without
 * importing the full module (just import OfflineModule in their module imports).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([OutboxEvent, SyncOperation]),
  ],
  controllers: [SyncController],
  providers: [OutboxService, SyncService],
  exports: [OutboxService, SyncService],
})
export class OfflineModule {}
