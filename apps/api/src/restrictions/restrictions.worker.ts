import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RestrictionsService } from './restrictions.service';

/** Reminds staff when a suspension reaches its review date. It never restores anyone (D#81). */
@Injectable()
export class RestrictionsWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RestrictionsWorker.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly restrictions: RestrictionsService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get('BACKGROUND_WORKERS_ENABLED') === 'false') return;
    const seconds = Number(this.config.get('RESTRICTION_REVIEW_INTERVAL_SECONDS') ?? 900);
    this.timer = setInterval(() => void this.tick(), seconds * 1000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    try {
      await this.restrictions.sendDueReviewReminders();
    } catch (error) {
      this.logger.error('Could not send review reminders', error);
    }
  }
}
