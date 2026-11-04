import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { OutboxEventStatus } from '@ktb/shared-types';
import { OutboxEvent } from './entities/outbox-event.entity';

/**
 * OutboxService — transactional outbox pattern (FR-OFF-02, D#99).
 *
 * Producers write events atomically with their business state change:
 *   await outboxService.publish(manager, { eventType, aggregateId, ... })
 *
 * The OutboxProcessorService polls PENDING events every 10 seconds and
 * invokes registered handlers, retrying failed events with exponential back-off.
 *
 * Currently all events emit to the audit log and can trigger external webhooks/
 * push notifications when those are implemented (M9+).
 */
@Injectable()
export class OutboxService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OutboxService.name);

  /** Registry of event handlers. Handlers are registered at startup. */
  private readonly handlers = new Map<
    string,
    (event: OutboxEvent) => Promise<void>
  >();

  // Flag to prevent concurrent processing runs
  private processingRunning = false;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
    private readonly dataSource: DataSource,
  ) {}

  onApplicationBootstrap(): void {
    this.logger.log('Outbox processor started — polling every 10s');
  }

  // ─── Producer API ─────────────────────────────────────────────────────────

  /**
   * Publish an event inside an existing transaction. The event row is committed
   * atomically with the business state change — zero risk of phantom events.
   */
  async publish(
    manager: EntityManager,
    input: {
      eventType: string;
      aggregateId: string;
      aggregateType: string;
      organizationId?: string | null;
      payload?: Record<string, unknown>;
    },
  ): Promise<OutboxEvent> {
    const event = manager.create(OutboxEvent, {
      eventType: input.eventType,
      aggregateId: input.aggregateId,
      aggregateType: input.aggregateType,
      organizationId: input.organizationId ?? null,
      payload: input.payload ?? {},
      status: OutboxEventStatus.PENDING,
      attemptCount: 0,
      maxAttempts: 5,
      nextRetryAt: new Date(),
    });
    return manager.save(OutboxEvent, event);
  }

  /**
   * Register a handler for an event type.
   * Multiple event types can share a handler; call this once per type.
   */
  registerHandler(eventType: string, handler: (event: OutboxEvent) => Promise<void>): void {
    this.handlers.set(eventType, handler);
    this.logger.debug(`Outbox handler registered for: ${eventType}`);
  }

  // ─── Processor (cron-driven) ──────────────────────────────────────────────

  /** Every 10 seconds — process up to 50 pending outbox events. */
  @Cron('*/10 * * * * *', { name: 'outbox-processor' })
  async processOutbox(): Promise<void> {
    if (this.processingRunning) return;
    this.processingRunning = true;

    try {
      const now = new Date();
      const pending = await this.outboxRepo.find({
        where: [
          { status: OutboxEventStatus.PENDING, nextRetryAt: LessThanOrEqual(now) },
          { status: OutboxEventStatus.PROCESSING, nextRetryAt: LessThanOrEqual(now) },
        ],
        order: { nextRetryAt: 'ASC' },
        take: 50,
      });

      if (pending.length === 0) return;

      this.logger.debug(`Processing ${pending.length} outbox event(s)`);

      for (const event of pending) {
        await this.deliverEvent(event);
      }
    } catch (err: unknown) {
      this.logger.error(`Outbox processor sweep failed: ${errMsg(err)}`);
    } finally {
      this.processingRunning = false;
    }
  }

  private async deliverEvent(event: OutboxEvent): Promise<void> {
    // Claim the event atomically to prevent duplicate delivery by concurrent workers
    const claimed = await this.outboxRepo
      .createQueryBuilder()
      .update(OutboxEvent)
      .set({ status: OutboxEventStatus.PROCESSING })
      .where('id = :id AND status IN (:...claimable)', {
        id: event.id,
        claimable: [OutboxEventStatus.PENDING, OutboxEventStatus.PROCESSING],
      })
      .execute();

    if (!claimed.affected || claimed.affected === 0) return; // another worker claimed it

    const handler = this.handlers.get(event.eventType);

    if (!handler) {
      // No handler registered — mark as delivered (log-only path)
      await this.outboxRepo.update(event.id, {
        status: OutboxEventStatus.DELIVERED,
        deliveredAt: new Date(),
      });
      return;
    }

    try {
      await handler(event);
      await this.outboxRepo.update(event.id, {
        status: OutboxEventStatus.DELIVERED,
        deliveredAt: new Date(),
        lastError: null,
      });
    } catch (err: unknown) {
      const newAttemptCount = event.attemptCount + 1;
      const isExhausted = newAttemptCount >= event.maxAttempts;

      // Exponential back-off: 10s, 30s, 90s, 270s, 810s
      const backoffSeconds = Math.min(10 * Math.pow(3, event.attemptCount), 900);
      const nextRetry = new Date(Date.now() + backoffSeconds * 1000);

      await this.outboxRepo.update(event.id, {
        status: isExhausted ? OutboxEventStatus.FAILED : OutboxEventStatus.PENDING,
        attemptCount: newAttemptCount,
        nextRetryAt: nextRetry,
        lastError: errMsg(err),
      });

      this.logger.warn(
        `Outbox event ${event.id} (${event.eventType}) delivery failed ` +
        `(attempt ${newAttemptCount}/${event.maxAttempts}): ${errMsg(err)}`,
      );
    }
  }

  /** Returns recent outbox stats — useful for health/monitoring (M9). */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    recentDelivered: number;
  }> {
    const [pending, processing, failed, recentDelivered] = await Promise.all([
      this.outboxRepo.count({ where: { status: OutboxEventStatus.PENDING } }),
      this.outboxRepo.count({ where: { status: OutboxEventStatus.PROCESSING } }),
      this.outboxRepo.count({ where: { status: OutboxEventStatus.FAILED } }),
      this.outboxRepo.count({
        where: {
          status: OutboxEventStatus.DELIVERED,
          deliveredAt: LessThanOrEqual(new Date(Date.now() - 60 * 60 * 1000)),
        },
      }),
    ]);
    return { pending, processing, failed, recentDelivered };
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
