import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditEvent } from './entities/audit-event.entity';

export interface CreateAuditEventInput {
  eventType: string;
  actorId?: string | null | undefined;
  targetId?: string | null | undefined;
  targetType?: string | null | undefined;
  organizationId?: string | null | undefined;
  municipalityId?: string | null | undefined;
  payload?: Record<string, unknown> | undefined;
  ipAddress?: string | null | undefined;
}

export interface QueryAuditEventsInput {
  eventType?: string | undefined;
  actorId?: string | undefined;
  organizationId?: string | undefined;
  targetId?: string | undefined;
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEvent)
    private readonly auditRepo: Repository<AuditEvent>,
  ) {}

  /**
   * Appends an immutable audit event to the database (BR-09, NFR-09).
   */
  async logEvent(input: CreateAuditEventInput, manager?: EntityManager): Promise<AuditEvent> {
    const repository = manager?.getRepository(AuditEvent) ?? this.auditRepo;
    const event = repository.create({
      eventType: input.eventType,
      actorId: input.actorId ?? null,
      targetId: input.targetId ?? null,
      targetType: input.targetType ?? null,
      organizationId: input.organizationId ?? input.municipalityId ?? null,
      municipalityId: input.municipalityId ?? input.organizationId ?? null,
      payload: input.payload ?? {},
      ipAddress: input.ipAddress ?? null,
    });

    return repository.save(event);
  }

  /**
   * Search and paginate audit events with multi-criteria filtering (M2-13).
   */
  async queryEvents(
    input: QueryAuditEventsInput,
  ): Promise<{ events: AuditEvent[]; total: number }> {
    const qb = this.auditRepo.createQueryBuilder('audit');

    if (input.eventType) {
      qb.andWhere('audit.eventType = :eventType', { eventType: input.eventType });
    }
    if (input.actorId) {
      qb.andWhere('audit.actorId = :actorId', { actorId: input.actorId });
    }
    if (input.organizationId) {
      qb.andWhere('audit.organizationId = :organizationId', {
        organizationId: input.organizationId,
      });
    }
    if (input.targetId) {
      qb.andWhere('audit.targetId = :targetId', { targetId: input.targetId });
    }
    if (input.startDate) {
      qb.andWhere('audit.createdAt >= :startDate', { startDate: input.startDate });
    }
    if (input.endDate) {
      qb.andWhere('audit.createdAt <= :endDate', { endDate: input.endDate });
    }

    qb.orderBy('audit.createdAt', 'DESC');
    qb.take(Math.min(input.limit ?? 50, 100));
    qb.skip(input.offset ?? 0);

    const [events, total] = await qb.getManyAndCount();
    return { events, total };
  }

  /**
   * Query recent audit events for an organization or actor.
   */
  async getEventsByOrganization(organizationId: string, limit = 50): Promise<AuditEvent[]> {
    return this.auditRepo.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async getEventsByActor(actorId: string, limit = 50): Promise<AuditEvent[]> {
    return this.auditRepo.find({
      where: { actorId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
