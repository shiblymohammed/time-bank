import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

import type { HealthCheckResponse } from '@ktb/shared-types';

/**
 * Health check endpoints used by:
 *   - Docker Compose healthcheck (NFR-06, NFR-17)
 *   - Monitoring tooling and deployment readiness checks (UC-30)
 *
 * The /health/ready endpoint verifies the database is reachable.
 * The /health/live endpoint is a lightweight ping (no DB check) for liveness probes.
 */
@ApiTags('Health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  /** Liveness probe — returns 200 as long as the process is alive */
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — process is alive' })
  live(): HealthCheckResponse {
    return {
      status: 'ok',
      version: process.env['npm_package_version'] ?? '0.0.0',
      environment: (process.env['APP_ENV'] ?? 'development') as 'development' | 'production',
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness probe — verifies database connectivity */
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — database reachable' })
  async ready() {
    return this.health.check([() => this.db.pingCheck('database')]);
  }
}
