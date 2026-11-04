import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { SyncOperationStatus } from '@ktb/shared-types';
import { SyncService } from './sync.service';
import { SyncOperation } from './entities/sync-operation.entity';

const mockSyncRepo = {
  findOne: jest.fn().mockResolvedValue(null),
  find: jest.fn().mockResolvedValue([]),
};

async function buildService() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      SyncService,
      { provide: getRepositoryToken(SyncOperation), useValue: mockSyncRepo },
    ],
  }).compile();
  return module.get(SyncService);
}

beforeEach(() => jest.clearAllMocks());

describe('SyncService — recordOperation', () => {
  it('creates a PENDING operation when none exists', async () => {
    const manager = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((d: any) => d),
        save: jest.fn(async (e: any) => ({ id: 'sync-1', ...e })),
      })),
    };

    const service = await buildService();
    const result = await service.recordOperation(manager as any, {
      clientOperationId: 'client-op-abc',
      userId: 'user-1',
      operationType: 'CREATE_REQUEST',
    });

    expect(result.existing).toBe(false);
    expect(result.operation.status).toBe(SyncOperationStatus.PENDING);
  });

  it('returns existing=true when operation already committed', async () => {
    const existing = {
      id: 'sync-1',
      clientOperationId: 'client-op-abc',
      status: SyncOperationStatus.SUCCESS,
      resultEntityId: 'req-1',
    };
    const manager = {
      getRepository: jest.fn(() => ({
        findOne: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        save: jest.fn(),
      })),
    };

    const service = await buildService();
    const result = await service.recordOperation(manager as any, {
      clientOperationId: 'client-op-abc',
      userId: 'user-1',
      operationType: 'CREATE_REQUEST',
    });

    expect(result.existing).toBe(true);
    expect(result.operation.resultEntityId).toBe('req-1');
  });
});

describe('SyncService — markSuccess', () => {
  it('updates operation status to SUCCESS', async () => {
    const manager = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const service = await buildService();

    await service.markSuccess(manager as any, 'client-op-xyz', 'user-1', 'req-1', 'service_requests');

    expect(manager.update).toHaveBeenCalledWith(
      SyncOperation,
      { clientOperationId: 'client-op-xyz', userId: 'user-1' },
      expect.objectContaining({ status: SyncOperationStatus.SUCCESS, resultEntityId: 'req-1' }),
    );
  });
});

describe('SyncService — markFailed', () => {
  it('updates operation status to FAILED with error message', async () => {
    const manager = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const service = await buildService();

    await service.markFailed(manager as any, 'client-op-xyz', 'user-1', 'Quota exceeded');

    expect(manager.update).toHaveBeenCalledWith(
      SyncOperation,
      { clientOperationId: 'client-op-xyz', userId: 'user-1' },
      expect.objectContaining({ status: SyncOperationStatus.FAILED, errorMessage: 'Quota exceeded' }),
    );
  });
});

describe('SyncService — getOperationState', () => {
  it('returns the operation when found', async () => {
    const op = { id: 'sync-1', clientOperationId: 'op-abc', status: SyncOperationStatus.SUCCESS };
    mockSyncRepo.findOne.mockResolvedValue(op);

    const service = await buildService();
    const result = await service.getOperationState('op-abc', 'user-1');

    expect(result.status).toBe(SyncOperationStatus.SUCCESS);
  });

  it('throws NotFoundException when operation not found or belongs to another user', async () => {
    mockSyncRepo.findOne.mockResolvedValue(null);
    const service = await buildService();
    await expect(service.getOperationState('ghost-op', 'user-1')).rejects.toThrow(NotFoundException);
  });
});

describe('SyncService — listRecentOperations', () => {
  it('returns a list of recent operations for the user', async () => {
    const ops = [{ id: '1', status: SyncOperationStatus.SUCCESS }, { id: '2', status: SyncOperationStatus.PENDING }];
    mockSyncRepo.find.mockResolvedValue(ops);

    const service = await buildService();
    const result = await service.listRecentOperations('user-1');

    expect(result).toHaveLength(2);
  });

  it('caps limit at 100', async () => {
    mockSyncRepo.find.mockResolvedValue([]);
    const service = await buildService();
    await service.listRecentOperations('user-1', 999);
    expect(mockSyncRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });
});
