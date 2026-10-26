import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Operational Zones, Volunteer Zone Assignments & Matching Rounds (1729118400004)
 *
 * Implements Milestone 3 Phase C:
 *  - Coordinator-managed operational zones and volunteer zone assignments
 *  - Verified residential address fields and consented transient GPS support
 *  - Durable matching rounds and offer records with stable idempotency keys
 *
 * Traceability Baseline: PRD v2.0, Decisions D#7, D#9, D#11, D#12, D#13, D#30, D#58, D#60, D#61, D#64, BR-06
 */
export class OperationalZonesAndMatchingRounds1729118400004 implements MigrationInterface {
  name = 'OperationalZonesAndMatchingRounds1729118400004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── 1. OPERATIONAL ZONES ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "operational_zones" (
        "id"                 UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"    UUID         NOT NULL,
        "code"               VARCHAR(50)  NOT NULL,
        "name"               VARCHAR(100) NOT NULL,
        "description"        TEXT,
        "ward_numbers"       JSONB        NOT NULL DEFAULT '[]',
        "center_lat"         NUMERIC(10, 7),
        "center_lng"         NUMERIC(10, 7),
        "radius_km"          NUMERIC(4, 1) NOT NULL DEFAULT 5.0,
        "is_active"          BOOLEAN      NOT NULL DEFAULT true,
        "created_by_user_id" UUID,
        "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_operational_zones" PRIMARY KEY ("id"),
        CONSTRAINT "uq_operational_zones_org_code" UNIQUE ("organization_id", "code"),
        CONSTRAINT "fk_operational_zones_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_operational_zones_creator" FOREIGN KEY ("created_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_operational_zones_org" ON "operational_zones" ("organization_id", "is_active");
    `);

    // ─── 2. VOLUNTEER ZONE ASSIGNMENTS ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "volunteer_zone_assignments" (
        "id"                  UUID        NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"     UUID        NOT NULL,
        "membership_id"       UUID        NOT NULL,
        "zone_id"             UUID        NOT NULL,
        "is_primary"          BOOLEAN     NOT NULL DEFAULT false,
        "assigned_by_user_id" UUID,
        "assigned_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_volunteer_zone_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "uq_volunteer_zone_assignment" UNIQUE ("membership_id", "zone_id"),
        CONSTRAINT "fk_vol_zone_assignments_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_vol_zone_assignments_membership" FOREIGN KEY ("membership_id")
          REFERENCES "organization_memberships"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_vol_zone_assignments_zone" FOREIGN KEY ("zone_id")
          REFERENCES "operational_zones"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_vol_zone_assignments_coordinator" FOREIGN KEY ("assigned_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_volunteer_zone_lookup" ON "volunteer_zone_assignments" ("membership_id");
      CREATE INDEX "idx_zone_volunteers_lookup" ON "volunteer_zone_assignments" ("zone_id");
    `);

    // ─── 3. MATCHING ROUNDS ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "matching_rounds" (
        "id"                      UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"         UUID         NOT NULL,
        "service_request_id"      UUID         NOT NULL,
        "round_number"            INT          NOT NULL DEFAULT 1,
        "tier"                    INT          NOT NULL DEFAULT 1,
        "search_radius_km"        NUMERIC(4, 1) NOT NULL DEFAULT 3.0,
        "status"                  VARCHAR(30)  NOT NULL DEFAULT 'ACTIVE',
        "started_at"              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "expires_at"              TIMESTAMPTZ  NOT NULL,
        "offers_dispatched_count" INT          NOT NULL DEFAULT 0,
        "offers_accepted_count"   INT          NOT NULL DEFAULT 0,
        "created_at"              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_matching_rounds" PRIMARY KEY ("id"),
        CONSTRAINT "uq_matching_rounds_request_round" UNIQUE ("service_request_id", "round_number"),
        CONSTRAINT "fk_matching_rounds_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_matching_rounds_request" FOREIGN KEY ("service_request_id")
          REFERENCES "service_requests"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_matching_rounds_request" ON "matching_rounds" ("service_request_id", "status");
    `);

    // ─── 4. ALTER VOLUNTEER_AVAILABILITIES (Residential Address & GPS Consent) ─
    await queryRunner.query(`
      ALTER TABLE "volunteer_availabilities"
        ADD COLUMN "is_gps_consented"        BOOLEAN       NOT NULL DEFAULT true,
        ADD COLUMN "residential_address_text" TEXT,
        ADD COLUMN "residential_ward_number" VARCHAR(20),
        ADD COLUMN "residential_postal_code" VARCHAR(10),
        ADD COLUMN "residential_lat"         NUMERIC(10, 7),
        ADD COLUMN "residential_lng"         NUMERIC(10, 7);
    `);

    // ─── 5. ALTER VOLUNTEER_ASSIGNMENTS (Matching Round Link & Idempotency Key) ─
    await queryRunner.query(`
      ALTER TABLE "volunteer_assignments"
        ADD COLUMN "matching_round_id" UUID,
        ADD COLUMN "idempotency_key"   VARCHAR(100);
    `);

    await queryRunner.query(`
      ALTER TABLE "volunteer_assignments"
        ADD CONSTRAINT "fk_vol_assignments_round" FOREIGN KEY ("matching_round_id")
          REFERENCES "matching_rounds"("id") ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_volunteer_assignments_round" ON "volunteer_assignments" ("matching_round_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "volunteer_assignments"
        DROP CONSTRAINT IF EXISTS "fk_vol_assignments_round",
        DROP COLUMN IF EXISTS "matching_round_id",
        DROP COLUMN IF EXISTS "idempotency_key"
    `);

    await queryRunner.query(`
      ALTER TABLE "volunteer_availabilities"
        DROP COLUMN IF EXISTS "residential_lng",
        DROP COLUMN IF EXISTS "residential_lat",
        DROP COLUMN IF EXISTS "residential_postal_code",
        DROP COLUMN IF EXISTS "residential_ward_number",
        DROP COLUMN IF EXISTS "residential_address_text",
        DROP COLUMN IF EXISTS "is_gps_consented"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "matching_rounds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "volunteer_zone_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "operational_zones"`);
  }
}
