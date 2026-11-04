import { Module } from '@nestjs/common';
import * as path from 'path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { HealthModule } from './health/health.module';
import { AuditModule } from './audit/audit.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { AdminModule } from './admin/admin.module';
import { MembershipsModule } from './memberships/memberships.module';
import { CatalogueModule } from './catalogue/catalogue.module';
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module';
import { RequestsModule } from './requests/requests.module';
import { MatchingModule } from './matching/matching.module';
import { TimeLedgerModule } from './time-ledger/time-ledger.module';
import { DonationsModule } from './donations/donations.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { GovernanceModule } from './governance/governance.module';
import { OfflineModule } from './offline/offline.module';

/**
 * Root application module.
 *
 * Modules wired:
 *   Milestone 1: HealthModule, AuditModule
 *   Milestone 2: AuthModule, AuthorizationModule, OrganizationsModule, AdminModule, MembershipsModule
 *   Milestone 3: CatalogueModule, BeneficiariesModule, RequestsModule, MatchingModule
 *   Milestone 4: TimeLedgerModule, DonationsModule
 *   ...
 *
 * See PRD §11 (Delivery strategy) and docs/milestones.md for the full plan.
 */
@Module({
  imports: [
    // ─── Configuration ──────────────────────────────────────────────
    // NFR-04: isGlobal=true so ConfigService is injectable everywhere without
    // re-importing. expandVariables=true supports ${VAR} syntax in .env
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [path.resolve(process.cwd(), '.env'), path.resolve(__dirname, '../../../.env')],
      expandVariables: true,
      // In production, all values come from environment — no .env file needed
      ignoreEnvFile: process.env['NODE_ENV'] === 'production',
    }),

    // ─── Database ────────────────────────────────────────────────────
    // NFR-01: PostgreSQL; NFR-05: Database must be recoverable
    // synchronize: false always — schema changes use explicit migrations (NFR-17)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/database/migrations/[0-9]*{.ts,.js}'],
        // CRITICAL: Never true — all schema changes go through migrations
        // (NFR-17: versioned migrations with rollback plans)
        synchronize: false,
        logging: config.get('NODE_ENV') !== 'production',
        ssl: config.get('DATABASE_SSL') === 'true' ? { rejectUnauthorized: true } : false,
      }),
    }),

    // ─── Health checks ───────────────────────────────────────────────
    // NFR-06: Health endpoint used by Docker Compose healthcheck and monitoring
    TerminusModule,
    HealthModule,

    // ─── Scheduler ───────────────────────────────────────────────────
    // Drives automatic matching round progression and offer expiry sweeps.
    // MatchingSchedulerService registers its @Cron jobs via MatchingModule.
    ScheduleModule.forRoot(),

    // ─── Rate limiting (NFR-07, D#98, NFR-03) ────────────────────────
    // 300 req/min per IP globally; auth endpoints use a tighter limit via
    // @Throttle() decorator overrides in their controllers.
    // D#103: OTP endpoints get additional per-phone rate limiting in AuthService.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'global',
            ttl: config.get<number>('THROTTLE_TTL_SECONDS', 60) * 1000,
            limit: config.get<number>('THROTTLE_LIMIT', 300),
          },
        ],
        // Skip throttling for health check endpoints
        skipIf: (context) => {
          const req = context.switchToHttp().getRequest<{ path?: string }>();
          return req.path?.startsWith('/api/health') ?? false;
        },
      }),
    }),

    // ─── Milestone 2 Foundations ─────────────────────────────────────
    AuditModule,
    AuthorizationModule,
    AuthModule,
    OrganizationsModule,
    AdminModule,
    MembershipsModule,

    // ─── Milestone 3 Core Services & Matching ─────────────────────────
    CatalogueModule,
    BeneficiariesModule,
    RequestsModule,
    MatchingModule,

    // ─── Milestone 4 Time Credits ─────────────────────────────────────
    TimeLedgerModule,
    DonationsModule,

    // ─── Milestone 6 Loyalty Coins & Merchants ────────────────────────
    LoyaltyModule,

    // ─── Milestone 7 Governance & Reporting ───────────────────────────
    GovernanceModule,

    // ─── Milestone 8 Offline Reliability ──────────────────────────────
    OfflineModule,
  ],
  // ─── Global rate-limit guard (NFR-03, NFR-07) ──────────────────────
  // Applied to every route; auth and OTP routes use tighter overrides.
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
