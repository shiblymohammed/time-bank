import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReportsService } from './reports.service';

const FIRST_RUN_DELAY_MS = 30_000;

/** Saves each community's sponsor report once a month has ended, so none depends on a person. */
@Injectable()
export class ReportsWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ReportsWorker.name);
  private first?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly reports: ReportsService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    if (this.config.get('BACKGROUND_WORKERS_ENABLED') === 'false') return;
    const seconds = Number(this.config.get('REPORTS_INTERVAL_SECONDS') ?? 3600);
    // A server restarted often may never reach a full interval, so it also checks soon after start.
    this.first = setTimeout(() => void this.tick(), FIRST_RUN_DELAY_MS);
    this.first.unref();
    this.timer = setInterval(() => void this.tick(), seconds * 1000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearTimeout(this.first);
    clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    try {
      const saved = await this.reports.saveMonthlyReports();
      if (saved > 0) this.logger.log(`Saved ${saved} sponsor reports`);
    } catch (error) {
      this.logger.error('Could not save sponsor reports', error);
    }
  }
}
