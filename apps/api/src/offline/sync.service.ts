import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SyncOperationStatus } from '@ktb/shared-types';
import { SyncOperation } from './entities/sync-operation.entity';

/**
 * SyncService — tracks client-side mutation state (FR-OFF-02, FR-OFF-03, D#99).
 *
 * Every mutation endpoint that accepts a clientOperationId should:
 *   1. Call recordOperation() at the START of its transaction (idempotency check).
 *   2. Call markSuccess() on commit with the resulting entity ID.
 *   3. Call markFailed() if the operation throws (optional — on-crash cleanup).
 *
 * Flutter clients can call GET /sync/operations/:clientOperationId to check
 * whether a previously submitted operation was committed after a network failure.
 */
@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(SyncOperation)
    private readonly syncRepo: Repository<SyncOperation>,
  ) {}

  /**
   * Records a new sync operation (or returns the existing one if already committed).
   * Call this at the START of the mutation, inside the transaction.
   *
   * Returns { existing: true, operation } if a SUCCESS record already exists —
   * the caller should return the existing result immediately (idempotent replay).
   */
  async recordOperation(
    manager: EntityManager,
    input: {
      clientOperationId: string;
      userId: string;
      organizationId?: string | null;
      operationType: string;
    },
  ): Promise<{ existing: boolean; operation: SyncOperation }> {
    const repo = manager.getRepository(SyncOperation);

    // Check for an existing committed operation
    const existing = await repo.findOne({
      where: { userId: input.userId, clientOperationId: input.clientOperationId },
    });

    if (existing) {
      return { existing: true, operation: existing };
    }

    const op = repo.create({
      clientOperationId: input.clientOperationId,
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      operationType: input.operationType,
      status: SyncOperationStatus.PENDING,
    });

    const saved = await repo.save(op);
    return { existing: false, operation: saved };
  }

  /**
   * Mark a sync operation as successfully committed.
   * Call this after the business state change commits.
   */
  async markSuccess(
    manager: EntityManager,
    clientOperationId: string,
    userId: string,
    resultEntityId: string,
    resultEntityType: string,
  ): Promise<void> {
    await manager.update(
      SyncOperation,
      { clientOperationId, userId },
      {
        status: SyncOperationStatus.SUCCESS,
        resultEntityId,
        resultEntityType,
      },
    );
  }

  /**
   * Mark a sync operation as failed.
   * Call this if the operation throws and you need to record the reason.
   */
  async markFailed(
    manager: EntityManager,
    clientOperationId: string,
    userId: string,
    errorMessage: string,
  ): Promise<void> {
    await manager.update(
      SyncOperation,
      { clientOperationId, userId },
      {
        status: SyncOperationStatus.FAILED,
        errorMessage,
      },
    );
  }

  /**
   * Look up the server-side state of a client operation by its ID.
   * Used by Flutter after a network recovery to check commit status (FR-OFF-02).
   */
  async getOperationState(
    clientOperationId: string,
    userId: string,
  ): Promise<SyncOperation> {
    const op = await this.syncRepo.findOne({
      where: { clientOperationId, userId },
    });
    if (!op) throw new NotFoundException('Operation not found or does not belong to you');
    return op;
  }

  /**
   * Lists recent sync operations for a user — useful for the Flutter client
   * to reconcile its local queue after coming back online.
   */
  async listRecentOperations(userId: string, limit = 50): Promise<SyncOperation[]> {
    return this.syncRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      take: Math.min(limit, 100),
    });
  }
}
