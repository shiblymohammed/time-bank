import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MatchingService } from './matching.service';

/** Moves unfilled requests through matching rounds without a coordinator acting on each one. */
@Injectable()
export class MatchingWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MatchingWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly matching: MatchingService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get('BACKGROUND_WORKERS_ENABLED') === 'false') return;
    const seconds = Number(this.config.get('MATCHING_WORKER_INTERVAL_SECONDS') ?? 30);
    this.timer = setInterval(() => void this.tick(), seconds * 1000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  /** Each request is handled alone, so one bad request cannot hold up the rest. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // First, so a visit whose time has passed is not sent to another matching round.
      await this.matching.recoverBookings();
    } catch (error) {
      this.logger.error('Could not recover bookings', error);
    }
    try {
      const due = await this.matching.findRequestsDueForProgression();
      for (const request of due) {
        try {
          await this.matching.evaluateRoundProgression(request.organizationId, request.id);
        } catch (error) {
          this.logger.error(`Could not advance request ${request.id}`, error);
        }
      }
    } catch (error) {
      this.logger.error('Could not load requests due for matching', error);
    } finally {
      this.running = false;
    }
  }
}
