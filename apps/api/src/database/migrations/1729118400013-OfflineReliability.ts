import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Milestone 8 — Offline Reliability (FR-OFF-01–05, D#47, D#99, NFR-11)
 *
 * Tables created:
 *   outbox_events       — transactional outbox for post-commit side effects
 *   sync_operations     — client-side operation tracking (pending/success/failed)
 */
export class OfflineReliability1729118400013 implements MigrationInterface {
  name = 'OfflineReliability1729118400013';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ─── 1. OUTBOX EVENTS ─────────────────────────────────────────────────────
    // Transactional outbox pattern: operations that need durable retry (matching
    // dispatch, notifications, ledger events) write a row here in the same transaction
    // as the business state change. A background worker delivers them and marks DELIVERED.
    // If delivery fails, the worker retries with exponential back-off up to max_attempts.
    await queryRunner.query(`
      CREATE TABLE "outbox_events" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "event_type"      VARCHAR(100) NOT NULL,
        "aggregate_id"    UUID         NOT NULL,
        "aggregate_type"  VARCHAR(50)  NOT NULL,
        "organization_id" UUID,
        "payload"         JSONB        NOT NULL DEFAULT '{}',
        "status"          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
        "attempt_count"   INT          NOT NULL DEFAULT 0,
        "max_attempts"    INT          NOT NULL DEFAULT 5,
        "next_retry_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "last_error"      TEXT,
        "delivered_at"    TIMESTAMPTZ,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_outbox_events" PRIMARY KEY ("id"),
        CONSTRAINT "chk_outbox_status" CHECK ("status" IN (
          'PENDING', 'PROCESSING', 'DELIVERED', 'FAILED'
        ))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_outbox_pending" ON "outbox_events" ("next_retry_at", "attempt_count")
        WHERE "status" IN ('PENDING', 'PROCESSING');
      CREATE INDEX "idx_outbox_aggregate" ON "outbox_events" ("aggregate_id", "aggregate_type");
    `);

    // ─── 2. SYNC OPERATIONS ───────────────────────────────────────────────────
    // Tracks client-initiated mutations by client_operation_id so the Flutter app
    // can query the server state of any previously submitted operation after a
    // network interruption (FR-OFF-02, FR-OFF-03, D#99).
    await queryRunner.query(`
      CREATE TABLE "sync_operations" (
        "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
        "client_operation_id"  VARCHAR(100) NOT NULL,
        "user_id"              UUID         NOT NULL,
        "organization_id"      UUID,
        "operation_type"       VARCHAR(60)  NOT NULL,
        "status"               VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
        "result_entity_id"     UUID,
        "result_entity_type"   VARCHAR(50),
        "error_message"        TEXT,
        "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_sync_operations" PRIMARY KEY ("id"),
        CONSTRAINT "uq_sync_op_client_id" UNIQUE ("user_id", "client_operation_id"),
        CONSTRAINT "fk_sync_op_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_sync_op_status" CHECK ("status" IN (
          'PENDING', 'SUCCESS', 'FAILED'
        ))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_sync_ops_user" ON "sync_operations" ("user_id", "updated_at" DESC);
      CREATE INDEX "idx_sync_ops_pending" ON "sync_operations" ("status", "created_at")
        WHERE "status" = 'PENDING';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sync_ops_pending"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sync_ops_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sync_operations"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_outbox_aggregate"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_outbox_pending"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "outbox_events"`);
  }
}
