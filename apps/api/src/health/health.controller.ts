import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import type { HealthCheckResponse } from '@ktb/shared-types';

/**
 * Health check endpoints used by:
 *   - Docker Compose healthcheck (NFR-06, NFR-17)
 *   - Monitoring tooling and deployment readiness checks (UC-30)
 *   - Production alerting and on-call dashboards (D#102)
 *
 * The /health/ready endpoint verifies the database is reachable.
 * The /health/live endpoint is a lightweight ping (no DB check) for liveness probes.
 * The /health/metrics endpoint exposes runtime statistics for monitoring (NFR-06).
 *
 * All health endpoints skip rate limiting — they must always be reachable.
 */
@ApiTags('Health')
@SkipThrottle()
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

  /**
   * Detailed metrics endpoint for production monitoring (NFR-06, D#102).
   * Returns runtime stats: memory, uptime, Node version, environment.
   * The outbox queue stats come from this endpoint in a production Prometheus
   * scrape setup — wire an OutboxService import when adding /metrics/outbox.
   */
  @Get('metrics')
  @ApiOperation({ summary: 'Runtime metrics for production monitoring (NFR-06, D#102)' })
  metrics() {
    const mem = process.memoryUsage();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(process.uptime()),
        human: formatUptime(process.uptime()),
      },
      process: {
        nodeVersion: process.version,
        platform: process.platform,
        pid: process.pid,
        environment: process.env['APP_ENV'] ?? 'development',
        version: process.env['npm_package_version'] ?? '0.0.0',
      },
      memory: {
        rss: formatBytes(mem.rss),
        heapUsed: formatBytes(mem.heapUsed),
        heapTotal: formatBytes(mem.heapTotal),
        external: formatBytes(mem.external),
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
      },
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [d > 0 ? `${d}d` : null, h > 0 ? `${h}h` : null, m > 0 ? `${m}m` : null, `${s}s`]
    .filter(Boolean)
    .join(' ');
}
