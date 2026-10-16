import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Foundation (1729118400001)
 *
 * Creates the audit_events table required from day one.
 * BR-09: Ledger transactions and corrections are append-only with auditability;
 *        never rewrite historical financial-like records.
 * NFR-09: Auditable privileged operations.
 */
export class Foundation1729118400001 implements MigrationInterface {
  name = 'Foundation1729118400001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pgcrypto for UUID generation (gen_random_uuid())
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // Immutable audit log — append-only, no UPDATE or DELETE ever granted
    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
        "event_type"   VARCHAR(100) NOT NULL,
        "actor_id"     UUID,
        "target_id"    UUID,
        "target_type"  VARCHAR(100),
        "municipality_id" UUID,
        "payload"      JSONB        NOT NULL DEFAULT '{}',
        "ip_address"   INET,
        "created_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_audit_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_audit_events_actor_id" ON "audit_events" ("actor_id")
      WHERE "actor_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_audit_events_created_at" ON "audit_events" ("created_at")
    `);

    await queryRunner.query(`
      COMMENT ON TABLE "audit_events" IS
      'Immutable audit log. BR-09: append-only. Never grant UPDATE/DELETE on this table.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_events"`);
  }
}
