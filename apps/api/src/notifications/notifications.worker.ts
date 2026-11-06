import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { PushSender } from './push-sender.service';

@Injectable()
export class NotificationsWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationsWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly notifications: NotificationsService,
    private readonly sender: PushSender,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get('BACKGROUND_WORKERS_ENABLED') === 'false') return;
    if (!this.sender.configured)
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON is not set; push messages will not be sent.');
    const seconds = Number(this.config.get('NOTIFICATION_WORKER_INTERVAL_SECONDS') ?? 15);
    this.timer = setInterval(() => void this.tick(), seconds * 1000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  /** A slow run must not overlap the next, and one failure must not stop the timer. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.notifications.deliverDue();
    } catch (error) {
      this.logger.error('Notification delivery failed', error);
    } finally {
      this.running = false;
    }
  }
}
