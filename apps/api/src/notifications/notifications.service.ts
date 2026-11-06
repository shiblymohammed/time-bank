import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, LessThan, LessThanOrEqual, Repository } from 'typeorm';
import { NotificationOutbox, NotificationStatus } from './entities/notification-outbox.entity';
import { PushDevice } from './entities/push-device.entity';
import { PushSender } from './push-sender.service';

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;

export interface NewNotification {
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  expiresAt: Date;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(PushDevice)
    private readonly deviceRepo: Repository<PushDevice>,
    private readonly dataSource: DataSource,
    private readonly sender: PushSender,
  ) {}

  /** Joins the caller's transaction, so the message exists only if the event commits. */
  async enqueue(manager: EntityManager, notification: NewNotification): Promise<void> {
    await manager.getRepository(NotificationOutbox).insert(notification);
  }

  /** A token follows whoever signed in last on that phone. */
  async registerDevice(userId: string, token: string, platform: string): Promise<void> {
    await this.deviceRepo.upsert({ userId, token, platform }, ['token']);
  }

  async removeDevice(userId: string, token: string): Promise<void> {
    await this.deviceRepo.delete({ userId, token });
  }

  /** Sends one batch and returns how many messages it handled. */
  async deliverDue(): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const outbox = manager.getRepository(NotificationOutbox);
      const now = new Date();
      await outbox.update(
        { status: NotificationStatus.PENDING, expiresAt: LessThan(now) },
        { status: NotificationStatus.EXPIRED },
      );
      if (!this.sender.configured) return 0;
      // SKIP LOCKED lets several API instances share the queue without sending twice.
      const batch = await outbox.find({
        where: { status: NotificationStatus.PENDING, nextAttemptAt: LessThanOrEqual(now) },
        order: { createdAt: 'ASC' },
        take: BATCH_SIZE,
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      });
      for (const notification of batch) await this.deliver(manager, notification);
      return batch.length;
    });
  }

  private async deliver(manager: EntityManager, notification: NotificationOutbox) {
    const devices = await manager.getRepository(PushDevice).find({
      where: { userId: notification.userId },
    });
    if (devices.length === 0) {
      notification.status = NotificationStatus.NO_DEVICE;
      await manager.save(notification);
      return;
    }
    let delivered = 0;
    let stale: string[] = [];
    let error: string | undefined;
    try {
      const result = await this.sender.send(
        devices.map((device) => device.token),
        notification,
      );
      delivered = result.delivered;
      stale = result.staleTokens;
      error = result.error;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Push delivery failed';
    }
    if (stale.length > 0) await manager.delete(PushDevice, { token: In(stale) });
    notification.attempts += 1;
    notification.lastError = error?.slice(0, 300) ?? null;
    if (delivered > 0) {
      notification.status = NotificationStatus.SENT;
      notification.sentAt = new Date();
    } else if (!error) {
      notification.status = NotificationStatus.NO_DEVICE;
    } else if (notification.attempts >= MAX_ATTEMPTS) {
      notification.status = NotificationStatus.FAILED;
    } else {
      notification.nextAttemptAt = new Date(Date.now() + 2 ** notification.attempts * 60_000);
    }
    await manager.save(notification);
  }
}
