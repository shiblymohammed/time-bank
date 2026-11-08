import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, LessThan, LessThanOrEqual, Repository } from 'typeorm';
import { NotificationOutbox, NotificationStatus } from './entities/notification-outbox.entity';
import { PushDevice } from './entities/push-device.entity';
import { PushSender } from './push-sender.service';

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;
const BOOKING_NOTICE_LIFETIME_MS = 24 * 60 * 60 * 1000;

export interface NewNotification {
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  expiresAt: Date;
}

/** A change to a booking. Text stays generic: push messages show on locked screens. */
export interface BookingNotice {
  organizationId: string;
  requestId: string;
  type: string;
  title: string;
  body: string;
}

/** The people who asked for a request. */
export interface RequestOwners {
  beneficiaryMembershipId: string;
  createdByUserId?: string | null;
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

  async notifyUsers(
    manager: EntityManager,
    userIds: (string | null | undefined)[],
    notice: BookingNotice,
  ): Promise<void> {
    const { organizationId, requestId, ...message } = notice;
    const recipients = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    for (const userId of recipients) {
      await this.enqueue(manager, {
        ...message,
        userId,
        data: { organizationId, requestId },
        expiresAt: new Date(Date.now() + BOOKING_NOTICE_LIFETIME_MS),
      });
    }
  }

  async notifyMemberships(
    manager: EntityManager,
    membershipIds: string[],
    notice: BookingNotice,
  ): Promise<void> {
    if (membershipIds.length === 0) return;
    const members: { user_id: string }[] = await manager.query(
      'SELECT user_id FROM organization_memberships WHERE id = ANY($1)',
      [membershipIds],
    );
    await this.notifyUsers(
      manager,
      members.map((member) => member.user_id),
      notice,
    );
  }

  /** The beneficiary, and a caregiver who booked for them. The person acting is left out. */
  async notifyRequestOwners(
    manager: EntityManager,
    request: RequestOwners,
    notice: BookingNotice,
    exceptUserId?: string,
  ): Promise<void> {
    const [beneficiary]: { user_id: string }[] = await manager.query(
      'SELECT user_id FROM organization_memberships WHERE id = $1',
      [request.beneficiaryMembershipId],
    );
    await this.notifyUsers(
      manager,
      [beneficiary?.user_id, request.createdByUserId].filter((id) => id !== exceptUserId),
      notice,
    );
  }

  async notifyCoordinators(manager: EntityManager, notice: BookingNotice): Promise<void> {
    const staff: { user_id: string }[] = await manager.query(
      `SELECT DISTINCT m.user_id FROM organization_memberships m
       JOIN membership_role_grants g ON g.membership_id = m.id
       WHERE m.organization_id = $1 AND m.status = 'APPROVED' AND g.status = 'ACTIVE'
         AND g.role IN ('COORDINATOR', 'MUNICIPALITY_ADMIN')`,
      [notice.organizationId],
    );
    await this.notifyUsers(
      manager,
      staff.map((member) => member.user_id),
      notice,
    );
  }

  /** A token follows whoever signed in last on that phone. */
  async registerDevice(
    userId: string,
    token: string,
    platform: string,
    organizationId: string | null = null,
  ): Promise<void> {
    await this.deviceRepo.upsert({ userId, token, platform, organizationId }, ['token']);
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
    // A banned, suspended or restricted account, or one signed out everywhere, gets nothing:
    // its phone may already belong to someone else.
    const reachable = await manager.query(
      `SELECT 1 FROM users u
       WHERE u.id = $1 AND u.status = 'ACTIVE'
         AND NOT EXISTS (SELECT 1 FROM global_account_restrictions r
           WHERE r.user_id = u.id AND r.status = 'ACTIVE')
         AND EXISTS (SELECT 1 FROM authentication_sessions s
           WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now())`,
      [notification.userId],
    );
    // A community's message goes only to that community's app (AT-15). Someone in two communities
    // has one app for each, and a phone with only the other app is told nothing.
    const community = notification.data?.['organizationId'];
    const devices =
      reachable.length === 0
        ? []
        : (
            await manager.getRepository(PushDevice).find({
              where: { userId: notification.userId },
            })
          ).filter(
            (device) =>
              !community || !device.organizationId || device.organizationId === community,
          );
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
