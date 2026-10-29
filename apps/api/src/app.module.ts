import { Module } from '@nestjs/common';
import * as path from 'path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';

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
  ],
})
export class AppModule {}
