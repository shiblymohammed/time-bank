import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from './entities/audit-event.entity';

export interface CreateAuditEventInput {
  eventType: string;
  actorId?: string | null;
  targetId?: string | null;
  targetType?: string | null;
  organizationId?: string | null;
  municipalityId?: string | null;
  payload?: Record<string, unknown>;
  ipAddress?: string | null;
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
  async logEvent(input: CreateAuditEventInput): Promise<AuditEvent> {
    const event = this.auditRepo.create({
      eventType: input.eventType,
      actorId: input.actorId ?? null,
      targetId: input.targetId ?? null,
      targetType: input.targetType ?? null,
      organizationId: input.organizationId ?? input.municipalityId ?? null,
      municipalityId: input.municipalityId ?? input.organizationId ?? null,
      payload: input.payload ?? {},
      ipAddress: input.ipAddress ?? null,
    });

    return this.auditRepo.save(event);
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
