import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { ServiceRequestStatus } from '@ktb/shared-types';

import { ServiceRequest } from '../requests/entities/service-request.entity';
import { MatchingService } from './matching.service';
import { AuditService } from '../audit/audit.service';

/**
 * MatchingSchedulerService
 *
 * Drives automatic matching progression without requiring coordinator intervention.
 * Runs as NestJS scheduled tasks (cron + immediate bootstrap run).
 *
 * Jobs:
 *  - expireOffersAndAdvanceRounds  (every 2 min) — times out stale offers and
 *    progresses rounds T1→T2→T3→ESCALATED for all active requests.
 *  - markExpiredUnmatched          (every 5 min) — closes requests whose scheduled
 *    start time has passed with zero accepted volunteers.
 *
 * Both jobs are also invoked once at application startup so no requests stall
 * through a deployment restart.
 *
 * Matching workflow ref: APPLICATION_WORKFLOW.md §5
 */
@Injectable()
export class MatchingSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MatchingSchedulerService.name);

  /** Prevents overlapping runs of the round-progression job */
  private advanceRunning = false;

  /** Prevents overlapping runs of the expire-unmatched job */
  private expireRunning = false;

  constructor(
    @InjectRepository(ServiceRequest)
    private readonly requestRepo: Repository<ServiceRequest>,
    private readonly matchingService: MatchingService,
    private readonly auditService: AuditService,
  ) {}

  // ─── Bootstrap: run both jobs immediately after app starts ────────────────

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Running initial matching progression sweep on startup...');
    // Use void + catch so startup is never blocked by transient DB errors
    void this.expireOffersAndAdvanceRounds().catch((err: unknown) =>
      this.logger.error('Startup advance-rounds sweep failed', err),
    );
    void this.markExpiredUnmatched().catch((err: unknown) =>
      this.logger.error('Startup expire-unmatched sweep failed', err),
    );
  }

  // ─── Job 1: Expire offers + advance matching rounds ───────────────────────

  /**
   * Every 2 minutes — for every request in an active matching state:
   *   1. Mark OFFERED assignments whose offer_expires_at has passed → TIMED_OUT
   *   2. Evaluate round progression (T1→T2→T3 or ESCALATED_TO_COORDINATOR)
   *
   * This replaces the requirement for coordinators to manually trigger
   * "evaluate-progression" for every stalled request.
   */
  @Cron('0 */2 * * * *', { name: 'matching-advance-rounds' })
  async expireOffersAndAdvanceRounds(): Promise<void> {
    if (this.advanceRunning) {
      this.logger.debug('advance-rounds: previous run still in progress, skipping');
      return;
    }
    this.advanceRunning = true;

    try {
      const activeRequests = await this.requestRepo.find({
        where: {
          status: In([
            ServiceRequestStatus.MATCHING_ACTIVE,
            ServiceRequestStatus.PARTIALLY_ACCEPTED,
          ]),
        },
        select: ['id', 'organizationId', 'status', 'matchingTier', 'scheduledStartTime'],
      });

      if (activeRequests.length === 0) {
        this.logger.debug('advance-rounds: no active requests to process');
        return;
      }

      this.logger.log(`advance-rounds: processing ${activeRequests.length} active request(s)`);

      let advanced = 0;
      let errors = 0;

      for (const request of activeRequests) {
        try {
          await this.matchingService.evaluateRoundProgression(
            request.organizationId,
            request.id,
          );
          advanced++;
        } catch (err: unknown) {
          errors++;
          this.logger.warn(
            `advance-rounds: failed to progress request ${request.id} — ${errorMessage(err)}`,
          );
        }
      }

      this.logger.log(
        `advance-rounds: done — processed=${advanced} errors=${errors} total=${activeRequests.length}`,
      );
    } catch (err: unknown) {
      this.logger.error(`advance-rounds: sweep failed — ${errorMessage(err)}`);
    } finally {
      this.advanceRunning = false;
    }
  }

  // ─── Job 2: Mark past-due unmatched requests as EXPIRED_UNMATCHED ─────────

  /**
   * Every 5 minutes — finds requests where:
   *   - Status is still MATCHING_ACTIVE or PARTIALLY_ACCEPTED
   *   - scheduled_start_time + grace period (15 min) has passed
   *   - No accepted volunteer assignments exist
   *
   * Marks them EXPIRED_UNMATCHED and writes an audit event.
   * Grace period allows for last-minute acceptances before the service window closes.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'matching-expire-unmatched' })
  async markExpiredUnmatched(): Promise<void> {
    if (this.expireRunning) {
      this.logger.debug('expire-unmatched: previous run still in progress, skipping');
      return;
    }
    this.expireRunning = true;

    try {
      const gracePeriodMs = EXPIRE_GRACE_PERIOD_MINUTES * 60 * 1000;
      const cutoff = new Date(Date.now() - gracePeriodMs);

      const candidates = await this.requestRepo.find({
        where: {
          status: In([
            ServiceRequestStatus.MATCHING_ACTIVE,
            ServiceRequestStatus.PARTIALLY_ACCEPTED,
          ]),
          scheduledStartTime: LessThan(cutoff),
        },
        select: ['id', 'organizationId', 'status', 'scheduledStartTime', 'matchingTier'],
      });

      if (candidates.length === 0) {
        this.logger.debug('expire-unmatched: no past-due requests found');
        return;
      }

      this.logger.log(`expire-unmatched: found ${candidates.length} past-due request(s)`);

      let expired = 0;
      let skipped = 0;
      let errors = 0;

      for (const request of candidates) {
        try {
          // Check if any volunteer has actually accepted (don't expire if someone is on the way)
          const hasAccepted = await this.requestRepo
            .createQueryBuilder('sr')
            .innerJoin('sr.assignments', 'a')
            .where('sr.id = :id', { id: request.id })
            .andWhere('a.status IN (:...acceptedStatuses)', {
              acceptedStatuses: ['ACCEPTED', 'IN_PROGRESS'],
            })
            .getCount();

          if (hasAccepted > 0) {
            skipped++;
            continue;
          }

          // Expire offers first, then mark request EXPIRED_UNMATCHED
          await this.matchingService.processExpiredOffers(request.id);

          await this.requestRepo.update(
            { id: request.id },
            { status: ServiceRequestStatus.EXPIRED_UNMATCHED },
          );

          await this.auditService.logEvent({
            eventType: 'REQUEST_EXPIRED_UNMATCHED',
            actorId: null,
            targetId: request.id,
            targetType: 'service_requests',
            organizationId: request.organizationId,
            payload: {
              scheduledStartTime: request.scheduledStartTime,
              matchingTierReached: request.matchingTier,
              expiredAt: new Date().toISOString(),
              reason: `Scheduled start time passed ${EXPIRE_GRACE_PERIOD_MINUTES} min grace period with no accepted volunteers`,
            },
          });

          expired++;
          this.logger.log(
            `expire-unmatched: marked request ${request.id} (org=${request.organizationId}) as EXPIRED_UNMATCHED`,
          );
        } catch (err: unknown) {
          errors++;
          this.logger.warn(
            `expire-unmatched: failed for request ${request.id} — ${errorMessage(err)}`,
          );
        }
      }

      this.logger.log(
        `expire-unmatched: done — expired=${expired} skipped(has_accepted)=${skipped} errors=${errors}`,
      );
    } catch (err: unknown) {
      this.logger.error(`expire-unmatched: sweep failed — ${errorMessage(err)}`);
    } finally {
      this.expireRunning = false;
    }
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Grace period after scheduled_start_time before a request is marked EXPIRED_UNMATCHED.
 * 15 minutes allows a last-minute acceptance to still count.
 */
const EXPIRE_GRACE_PERIOD_MINUTES = 15;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
