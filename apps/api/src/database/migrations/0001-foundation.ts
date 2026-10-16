import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: 0001 - Foundation
 *
 * Creates the audit_events table required from day one.
 * BR-09: Ledger transactions and corrections are append-only with auditability;
 *        never rewrite historical financial-like records.
 * NFR-09: Auditable privileged operations.
 *
 * NOTE: This is the only migration in Milestone 1.
 * Business-domain tables (users, wallets, etc.) are added in Milestone 2+.
 */
export class Foundation0001 implements MigrationInterface {
  name = 'Foundation0001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pgcrypto for UUID generation (gen_random_uuid())
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // Immutable audit log — append-only, no UPDATE or DELETE ever granted
    // BR-09: Never rewrite historical financial-like records
    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
        "event_type"   VARCHAR(100) NOT NULL,
        "actor_id"     UUID,
        "target_id"    UUID,
        "target_type"  VARCHAR(100),
        "municipality_id" UUID,
        "payload"      JSONB       NOT NULL DEFAULT '{}',
        "ip_address"   INET,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_audit_events" PRIMARY KEY ("id")
      )
    `);

    // Index for efficient actor lookups in investigation workflows
    await queryRunner.query(`
      CREATE INDEX "idx_audit_events_actor_id" ON "audit_events" ("actor_id")
      WHERE "actor_id" IS NOT NULL
    `);

    // Index for time-range scans (NFR-06: monitoring and reporting)
    await queryRunner.query(`
      CREATE INDEX "idx_audit_events_created_at" ON "audit_events" ("created_at")
    `);

    // Comment so DBA/future developer understands the immutability requirement
    await queryRunner.query(`
      COMMENT ON TABLE "audit_events" IS
      'Immutable audit log. BR-09: append-only. Never grant UPDATE/DELETE on this table.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // DOWN exists for dev-environment rollback only.
    // NEVER run down migrations against production data (NFR-17).
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_events"`);
  }
}
