import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { OutboxService } from './outbox.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUserId } from '../authorization/decorators/current-user.decorator';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { Roles } from '../authorization/decorators/roles.decorator';
import { UserRole } from '@ktb/shared-types';

@ApiTags('Offline Sync')
@ApiBearerAuth('JWT-auth')
@Controller('sync')
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly outboxService: OutboxService,
  ) {}

  /**
   * After a network recovery, the Flutter client queries this endpoint to check
   * whether a previously submitted mutation was committed (FR-OFF-02, D#99).
   */
  @Get('operations/:clientOperationId')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Check the server commit status of a client operation (FR-OFF-02)' })
  @ApiResponse({ status: 200, description: 'Operation state returned' })
  @ApiResponse({ status: 404, description: 'Operation not found or does not belong to caller' })
  async getOperationState(
    @Param('clientOperationId') clientOperationId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.syncService.getOperationState(clientOperationId, userId);
  }

  /**
   * Returns the caller's recent sync operations so the Flutter client can
   * reconcile its entire local queue after coming back online.
   */
  @Get('operations')
  @UseGuards(AuthGuard)
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({ summary: 'List recent sync operations for reconciliation (FR-OFF-02)' })
  async listOperations(
    @CurrentUserId() userId: string,
    @Query('limit') limit?: string,
  ) {
    return this.syncService.listRecentOperations(userId, limit ? parseInt(limit, 10) : 50);
  }

  /**
   * Outbox health — Super Admin can inspect the outbox queue stats.
   * Used for monitoring and debugging delivery failures (M9 monitoring).
   */
  @Get('outbox/stats')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Outbox queue health stats (Super Admin only)' })
  async getOutboxStats() {
    return this.outboxService.getStats();
  }
}
