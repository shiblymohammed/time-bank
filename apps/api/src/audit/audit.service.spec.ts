import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditEvent } from './entities/audit-event.entity';

describe('AuditService', () => {
  let service: AuditService;

  const mockAuditRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AuditEvent), useValue: mockAuditRepo },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  describe('logEvent()', () => {
    it('should create and save an immutable audit event with all tenant metadata', async () => {
      const input = {
        eventType: 'MEMBERSHIP_APPLICATION_APPROVED',
        actorId: 'coordinator-uuid-1',
        targetId: 'user-uuid-2',
        targetType: 'USER',
        organizationId: 'org-kozhikode-uuid',
        payload: { role: 'VOLUNTEER' },
        ipAddress: '192.168.1.1',
      };

      const createdEntity = {
        id: 'audit-event-uuid',
        ...input,
        municipalityId: input.organizationId,
        createdAt: new Date(),
      };

      mockAuditRepo.create.mockReturnValue(createdEntity);
      mockAuditRepo.save.mockResolvedValue(createdEntity);

      const result = await service.logEvent(input);

      expect(mockAuditRepo.create).toHaveBeenCalledWith({
        eventType: input.eventType,
        actorId: input.actorId,
        targetId: input.targetId,
        targetType: input.targetType,
        organizationId: input.organizationId,
        municipalityId: input.organizationId,
        payload: input.payload,
        ipAddress: input.ipAddress,
      });
      expect(mockAuditRepo.save).toHaveBeenCalledWith(createdEntity);
      expect(result.id).toBe('audit-event-uuid');
    });
  });

  describe('getEventsByOrganization()', () => {
    it('should query events scoped strictly to the requested organization', async () => {
      const orgId = 'org-kottakkal-uuid';
      const events = [{ id: '1', organizationId: orgId, eventType: 'ORG_CREATED' }];

      mockAuditRepo.find.mockResolvedValue(events);

      const result = await service.getEventsByOrganization(orgId, 10);

      expect(mockAuditRepo.find).toHaveBeenCalledWith({
        where: { organizationId: orgId },
        order: { createdAt: 'DESC' },
        take: 10,
      });
      expect(result).toEqual(events);
    });
  });
});
