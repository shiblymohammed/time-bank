import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Milestone 7 — Governance & Reporting
 * (FR-SAFE, FR-IDENT-06/07/08, FR-REPORT, D#44–D#46, D#70–D#92)
 *
 * Tables created:
 *   safety_alerts         — volunteers/beneficiaries raise alerts mid-service
 *   complaints            — confidential complaints with auto-escalation routing
 *   appeals               — appeals chain up to Super Admin
 *   death_nominees        — post-death credit transfer nominees (D#44, D#45)
 *   account_closures      — death + duplicate closure workflow (D#46, D#87–D#90)
 */
export class GovernanceAndReporting1729118400013 implements MigrationInterface {
  name = 'GovernanceAndReporting1729118400013';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ─── 1. SAFETY ALERTS ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "safety_alerts" (
        "id"                    UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"       UUID         NOT NULL,
        "service_request_id"    UUID         NOT NULL,
        "raised_by_user_id"     UUID         NOT NULL,
        "raised_by_role"        VARCHAR(20)  NOT NULL,
        "status"                VARCHAR(30)  NOT NULL DEFAULT 'RAISED',
        "description"           TEXT         NOT NULL,
        "coordinator_id"        UUID,
        "acknowledged_at"       TIMESTAMPTZ,
        "service_paused_at"     TIMESTAMPTZ,
        "resolved_at"           TIMESTAMPTZ,
        "resolved_by_user_id"   UUID,
        "resolution_notes"      TEXT,
        "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_safety_alerts" PRIMARY KEY ("id"),
        CONSTRAINT "fk_sa_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_sa_request" FOREIGN KEY ("service_request_id")
          REFERENCES "service_requests"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_sa_raised_by" FOREIGN KEY ("raised_by_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_sa_coordinator" FOREIGN KEY ("coordinator_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_sa_resolved_by" FOREIGN KEY ("resolved_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_sa_status" CHECK ("status" IN (
          'RAISED', 'ACKNOWLEDGED', 'SERVICE_PAUSED', 'RESOLVED', 'DISMISSED'
        )),
        CONSTRAINT "chk_sa_raised_by_role" CHECK ("raised_by_role" IN (
          'VOLUNTEER', 'BENEFICIARY', 'CAREGIVER'
        ))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_safety_alerts_org_status" ON "safety_alerts" ("organization_id", "status");
      CREATE INDEX "idx_safety_alerts_request" ON "safety_alerts" ("service_request_id");
      CREATE INDEX "idx_safety_alerts_coordinator" ON "safety_alerts" ("coordinator_id", "status")
        WHERE "coordinator_id" IS NOT NULL;
    `);

    // ─── 2. COMPLAINTS ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "complaints" (
        "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"     UUID         NOT NULL,
        "complainant_user_id" UUID         NOT NULL,
        "target_user_id"      UUID         NOT NULL,
        "target_role"         VARCHAR(30)  NOT NULL,
        "subject"             VARCHAR(300) NOT NULL,
        "description"         TEXT         NOT NULL,
        "status"              VARCHAR(30)  NOT NULL DEFAULT 'SUBMITTED',
        "assigned_to_user_id" UUID,
        "resolution_notes"    TEXT,
        "resolved_at"         TIMESTAMPTZ,
        "resolved_by_user_id" UUID,
        "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_complaints" PRIMARY KEY ("id"),
        CONSTRAINT "fk_complaint_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_complaint_complainant" FOREIGN KEY ("complainant_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_complaint_target" FOREIGN KEY ("target_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_complaint_assigned" FOREIGN KEY ("assigned_to_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_complaint_resolved_by" FOREIGN KEY ("resolved_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_complaint_status" CHECK ("status" IN (
          'SUBMITTED', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED', 'DISMISSED'
        )),
        CONSTRAINT "chk_complaint_target_role" CHECK ("target_role" IN (
          'COORDINATOR', 'MUNICIPALITY_ADMIN'
        )),
        CONSTRAINT "chk_complaint_no_self" CHECK ("complainant_user_id" <> "target_user_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_complaints_org_status" ON "complaints" ("organization_id", "status");
      CREATE INDEX "idx_complaints_target" ON "complaints" ("target_user_id");
      CREATE INDEX "idx_complaints_assigned" ON "complaints" ("assigned_to_user_id", "status")
        WHERE "assigned_to_user_id" IS NOT NULL;
    `);

    // ─── 3. APPEALS ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "appeals" (
        "id"                    UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"       UUID         NOT NULL,
        "appellant_user_id"     UUID         NOT NULL,
        "subject_type"          VARCHAR(30)  NOT NULL,
        "subject_reference_id"  UUID         NOT NULL,
        "grounds"               TEXT         NOT NULL,
        "status"                VARCHAR(30)  NOT NULL DEFAULT 'SUBMITTED',
        "reviewed_by_user_id"   UUID,
        "reviewed_at"           TIMESTAMPTZ,
        "outcome_notes"         TEXT,
        "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_appeals" PRIMARY KEY ("id"),
        CONSTRAINT "fk_appeal_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_appeal_appellant" FOREIGN KEY ("appellant_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_appeal_reviewer" FOREIGN KEY ("reviewed_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_appeal_status" CHECK ("status" IN (
          'SUBMITTED', 'UNDER_REVIEW', 'UPHELD', 'DISMISSED'
        )),
        CONSTRAINT "chk_appeal_subject_type" CHECK ("subject_type" IN (
          'SUSPENSION', 'BAN', 'MEMBERSHIP_REVOCATION', 'COMPLAINT_RESOLUTION'
        ))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_appeals_org_status" ON "appeals" ("organization_id", "status");
      CREATE INDEX "idx_appeals_appellant" ON "appeals" ("appellant_user_id");
      -- One open appeal per subject reference at a time
      CREATE UNIQUE INDEX "uq_appeals_open_subject"
        ON "appeals" ("subject_reference_id")
        WHERE "status" IN ('SUBMITTED', 'UNDER_REVIEW');
    `);

    // ─── 4. DEATH NOMINEES ────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "death_nominees" (
        "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"          UUID         NOT NULL,
        "nominee_name"     VARCHAR(200) NOT NULL,
        "nominee_phone"    VARCHAR(20)  NOT NULL,
        "nominee_user_id"  UUID,
        "verified"         BOOLEAN      NOT NULL DEFAULT false,
        "updated_by_otp"   BOOLEAN      NOT NULL DEFAULT false,
        "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_death_nominees" PRIMARY KEY ("id"),
        CONSTRAINT "uq_death_nominees_user" UNIQUE ("user_id"),
        CONSTRAINT "fk_nominee_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_nominee_verified_user" FOREIGN KEY ("nominee_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // ─── 5. ACCOUNT CLOSURES ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "account_closures" (
        "id"                       UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"                  UUID         NOT NULL,
        "organization_id"          UUID,
        "closure_type"             VARCHAR(20)  NOT NULL,
        "status"                   VARCHAR(30)  NOT NULL DEFAULT 'PENDING_REVIEW',
        "requested_by_user_id"     UUID         NOT NULL,
        "reviewed_by_user_id"      UUID,
        "reviewed_at"              TIMESTAMPTZ,
        "rejection_reason"         TEXT,
        "duplicate_primary_user_id" UUID,
        "nominee_transfer_tx_id"   UUID,
        "archived_at"              TIMESTAMPTZ,
        "notes"                    TEXT,
        "created_at"               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_account_closures" PRIMARY KEY ("id"),
        CONSTRAINT "uq_account_closure_user" UNIQUE ("user_id"),
        CONSTRAINT "fk_ac_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_ac_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_ac_requested_by" FOREIGN KEY ("requested_by_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_ac_reviewed_by" FOREIGN KEY ("reviewed_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_ac_duplicate_primary" FOREIGN KEY ("duplicate_primary_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_ac_closure_type" CHECK ("closure_type" IN ('DECEASED', 'DUPLICATE')),
        CONSTRAINT "chk_ac_status" CHECK ("status" IN (
          'PENDING_REVIEW', 'APPROVED', 'REJECTED'
        ))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_account_closures_status" ON "account_closures" ("status");
      CREATE INDEX "idx_account_closures_org" ON "account_closures" ("organization_id", "status")
        WHERE "organization_id" IS NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_account_closures_org"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_account_closures_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account_closures"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "death_nominees"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_appeals_open_subject"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_appeals_appellant"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_appeals_org_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "appeals"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_complaints_assigned"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_complaints_target"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_complaints_org_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "complaints"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_safety_alerts_coordinator"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_safety_alerts_request"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_safety_alerts_org_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "safety_alerts"`);
  }
}
