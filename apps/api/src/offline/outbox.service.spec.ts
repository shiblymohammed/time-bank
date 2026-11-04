import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OutboxEventStatus } from '@ktb/shared-types';
import { OutboxService } from './outbox.service';
import { OutboxEvent } from './entities/outbox-event.entity';

const mockOutboxRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
  count: jest.fn().mockResolvedValue(0),
  save: jest.fn(async (e: any) => e),
  createQueryBuilder: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  })),
};

const mockDataSource = { transaction: jest.fn() };

async function buildService() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      OutboxService,
      { provide: getRepositoryToken(OutboxEvent), useValue: mockOutboxRepo },
      { provide: DataSource, useValue: mockDataSource },
    ],
  }).compile();
  return module.get(OutboxService);
}

beforeEach(() => jest.clearAllMocks());

describe('OutboxService — publish', () => {
  it('creates a PENDING outbox event in the given transaction manager', async () => {
    const manager = {
      create: jest.fn((_, data) => data),
      save: jest.fn(async (_, e) => ({ id: 'evt-1', ...e })),
    };

    const service = await buildService();
    const result = await service.publish(manager as any, {
      eventType: 'SERVICE_REQUEST_CREATED',
      aggregateId: 'req-1',
      aggregateType: 'service_requests',
      organizationId: 'org-1',
    });

    expect(result.status).toBe(OutboxEventStatus.PENDING);
    expect(manager.save).toHaveBeenCalled();
  });
});

describe('OutboxService — processOutbox', () => {
  it('delivers a pending event to its registered handler', async () => {
    const event: Partial<OutboxEvent> = {
      id: 'evt-1',
      eventType: 'TEST_EVENT',
      status: OutboxEventStatus.PENDING,
      attemptCount: 0,
      maxAttempts: 5,
      nextRetryAt: new Date(Date.now() - 1000),
    };
    mockOutboxRepo.find.mockResolvedValue([event]);

    const service = await buildService();
    const handler = jest.fn().mockResolvedValue(undefined);
    service.registerHandler('TEST_EVENT', handler);

    await service.processOutbox();

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt-1' }));
    expect(mockOutboxRepo.update).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({ status: OutboxEventStatus.DELIVERED }),
    );
  });

  it('retries with back-off on handler failure', async () => {
    const event: Partial<OutboxEvent> = {
      id: 'evt-fail',
      eventType: 'FAIL_EVENT',
      status: OutboxEventStatus.PENDING,
      attemptCount: 0,
      maxAttempts: 5,
      nextRetryAt: new Date(Date.now() - 1000),
    };
    mockOutboxRepo.find.mockResolvedValue([event]);

    const service = await buildService();
    service.registerHandler('FAIL_EVENT', async () => { throw new Error('downstream down'); });

    await service.processOutbox();

    expect(mockOutboxRepo.update).toHaveBeenCalledWith(
      'evt-fail',
      expect.objectContaining({
        status: OutboxEventStatus.PENDING, // not exhausted yet
        attemptCount: 1,
        lastError: 'downstream down',
      }),
    );
  });

  it('marks event FAILED after exhausting max attempts', async () => {
    const event: Partial<OutboxEvent> = {
      id: 'evt-exhaust',
      eventType: 'FAIL_EVENT',
      status: OutboxEventStatus.PENDING,
      attemptCount: 4, // one more = 5 = maxAttempts
      maxAttempts: 5,
      nextRetryAt: new Date(Date.now() - 1000),
    };
    mockOutboxRepo.find.mockResolvedValue([event]);

    const service = await buildService();
    service.registerHandler('FAIL_EVENT', async () => { throw new Error('still failing'); });

    await service.processOutbox();

    expect(mockOutboxRepo.update).toHaveBeenCalledWith(
      'evt-exhaust',
      expect.objectContaining({ status: OutboxEventStatus.FAILED }),
    );
  });

  it('delivers events with no registered handler as DELIVERED (log-only)', async () => {
    const event: Partial<OutboxEvent> = {
      id: 'evt-no-handler',
      eventType: 'UNKNOWN_EVENT',
      status: OutboxEventStatus.PENDING,
      attemptCount: 0,
      maxAttempts: 5,
      nextRetryAt: new Date(Date.now() - 1000),
    };
    mockOutboxRepo.find.mockResolvedValue([event]);

    const service = await buildService();
    // No handler registered for UNKNOWN_EVENT

    await service.processOutbox();

    expect(mockOutboxRepo.update).toHaveBeenCalledWith(
      'evt-no-handler',
      expect.objectContaining({ status: OutboxEventStatus.DELIVERED }),
    );
  });

  it('skips if already running (overlap guard)', async () => {
    mockOutboxRepo.find.mockResolvedValue([]);
    const service = await buildService();

    // Simulate a running sweep
    (service as any).processingRunning = true;
    await service.processOutbox();

    expect(mockOutboxRepo.find).not.toHaveBeenCalled();
    (service as any).processingRunning = false;
  });
});

describe('OutboxService — getStats', () => {
  it('returns queue statistics', async () => {
    mockOutboxRepo.count
      .mockResolvedValueOnce(3)  // pending
      .mockResolvedValueOnce(1)  // processing
      .mockResolvedValueOnce(0)  // failed
      .mockResolvedValueOnce(42); // recent delivered

    const service = await buildService();
    const stats = await service.getStats();

    expect(stats.pending).toBe(3);
    expect(stats.processing).toBe(1);
    expect(stats.failed).toBe(0);
    expect(stats.recentDelivered).toBe(42);
  });
});
