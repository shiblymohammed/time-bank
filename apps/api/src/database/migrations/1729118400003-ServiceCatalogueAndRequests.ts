import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Service Catalogue, Requests & Volunteer Matching (1729118400003)
 *
 * Establishes the foundational schema for Milestone 3:
 *  - Global service categories and canonical service definitions (Super Admin governed)
 *  - Organization-scoped service catalogue enablement and municipal proposals
 *  - Beneficiary eligibility tracking, review dates, and monthly quotas
 *  - Caregiver authorizations with explicit permissions and revocability
 *  - Volunteer verified skills and availability / transient location preferences
 *  - Service requests with mandatory manual location entry (D#59)
 *  - Volunteer assignments with multi-position support (D#64) and sequential replacements (BR-06)
 *  - Request cancellation logs and rescheduling history for reliability auditing
 *
 * Implements PRD v2.0 & Milestone 3 Architecture Spec:
 *  - ITB-001 through ITB-012
 *  - D#6, D#7, D#8, D#9, D#10, D#11, D#12, D#13, D#24, D#25, D#26, D#29, D#31, D#33, D#58, D#59, D#60, D#61, D#62, D#64
 */
export class ServiceCatalogueAndRequests1729118400003 implements MigrationInterface {
  name = 'ServiceCatalogueAndRequests1729118400003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── 1. SERVICE CATEGORIES (Global Taxonomy) ─────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "service_categories" (
        "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
        "code"           VARCHAR(50)  NOT NULL,
        "name_en"        VARCHAR(100) NOT NULL,
        "name_ml"        VARCHAR(100) NOT NULL,
        "description_en" TEXT,
        "description_ml" TEXT,
        "icon_key"       VARCHAR(100),
        "is_active"      BOOLEAN      NOT NULL DEFAULT true,
        "display_order"  INT          NOT NULL DEFAULT 0,
        "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_service_categories" PRIMARY KEY ("id"),
        CONSTRAINT "uq_service_categories_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_service_categories_active" ON "service_categories" ("is_active", "display_order");
    `);

    // ─── 2. GLOBAL SERVICE DEFINITIONS (Central Catalogue) ───────────────────
    await queryRunner.query(`
      CREATE TABLE "global_service_definitions" (
        "id"                           UUID         NOT NULL DEFAULT gen_random_uuid(),
        "category_id"                  UUID         NOT NULL,
        "code"                         VARCHAR(60)  NOT NULL,
        "name_en"                      VARCHAR(150) NOT NULL,
        "name_ml"                      VARCHAR(150) NOT NULL,
        "description_en"               TEXT,
        "description_ml"               TEXT,
        "default_min_volunteers"       INT          NOT NULL DEFAULT 1,
        "default_preferred_volunteers" INT          NOT NULL DEFAULT 1,
        "is_hazardous_physical"        BOOLEAN      NOT NULL DEFAULT false,
        "requires_skills"              BOOLEAN      NOT NULL DEFAULT false,
        "required_skill_codes"         JSONB        NOT NULL DEFAULT '[]',
        "is_emergency_prohibited"      BOOLEAN      NOT NULL DEFAULT true,
        "base_credit_rate_hourly"      NUMERIC(4, 2) NOT NULL DEFAULT 1.00,
        "credit_multiplier"            NUMERIC(3, 2) NOT NULL DEFAULT 1.00,
        "allow_partial_hours"          BOOLEAN      NOT NULL DEFAULT true,
        "is_active"                    BOOLEAN      NOT NULL DEFAULT true,
        "created_by"                   UUID,
        "created_at"                   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"                   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_global_service_definitions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_global_service_definitions_code" UNIQUE ("code"),
        CONSTRAINT "fk_global_service_category" FOREIGN KEY ("category_id")
          REFERENCES "service_categories"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_global_service_creator" FOREIGN KEY ("created_by")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_global_min_volunteers" CHECK ("default_min_volunteers" >= 1),
        CONSTRAINT "chk_global_pref_volunteers" CHECK ("default_preferred_volunteers" >= "default_min_volunteers")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_global_services_category" ON "global_service_definitions" ("category_id", "is_active");
    `);

    // ─── 3. ORGANIZATION SERVICE CATALOGUE (Tenant-Scoped Enablement) ────────
    await queryRunner.query(`
      CREATE TABLE "organization_service_catalog" (
        "id"                            UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"               UUID         NOT NULL,
        "global_service_id"             UUID         NOT NULL,
        "custom_label_en"               VARCHAR(150),
        "custom_label_ml"               VARCHAR(150),
        "is_enabled"                    BOOLEAN      NOT NULL DEFAULT true,
        "min_volunteers"                INT          NOT NULL DEFAULT 1,
        "preferred_volunteers"          INT          NOT NULL DEFAULT 1,
        "requires_coordinator_dispatch" BOOLEAN      NOT NULL DEFAULT false,
        "local_instructions_en"         TEXT,
        "local_instructions_ml"         TEXT,
        "created_at"                    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"                    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_org_service_catalog" PRIMARY KEY ("id"),
        CONSTRAINT "uq_org_service_catalog" UNIQUE ("organization_id", "global_service_id"),
        CONSTRAINT "fk_org_service_catalog_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_org_service_catalog_global" FOREIGN KEY ("global_service_id")
          REFERENCES "global_service_definitions"("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_org_service_min_volunteers" CHECK ("min_volunteers" >= 1),
        CONSTRAINT "chk_org_service_pref_volunteers" CHECK ("preferred_volunteers" >= "min_volunteers")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_org_service_catalog_org_enabled" ON "organization_service_catalog" ("organization_id", "is_enabled");
    `);

    // ─── 4. ORGANIZATION SERVICE PROPOSALS ───────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "organization_service_proposals" (
        "id"                          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"             UUID         NOT NULL,
        "proposed_by_user_id"         UUID         NOT NULL,
        "proposed_name"               VARCHAR(150) NOT NULL,
        "category_id"                 UUID         NOT NULL,
        "description"                 TEXT         NOT NULL,
        "justification"               TEXT         NOT NULL,
        "suggested_min_volunteers"    INT          NOT NULL DEFAULT 1,
        "is_hazardous_physical"       BOOLEAN      NOT NULL DEFAULT false,
        "status"                      VARCHAR(30)  NOT NULL DEFAULT 'PENDING_REVIEW',
        "reviewed_by_user_id"         UUID,
        "reviewed_at"                 TIMESTAMPTZ,
        "rejection_reason"            TEXT,
        "resulting_global_service_id" UUID,
        "created_at"                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_org_service_proposals" PRIMARY KEY ("id"),
        CONSTRAINT "fk_org_proposals_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_org_proposals_proposer" FOREIGN KEY ("proposed_by_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_org_proposals_category" FOREIGN KEY ("category_id")
          REFERENCES "service_categories"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_org_proposals_reviewer" FOREIGN KEY ("reviewed_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_org_proposals_resulting_service" FOREIGN KEY ("resulting_global_service_id")
          REFERENCES "global_service_definitions"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_org_proposals_status" ON "organization_service_proposals" ("status");
      CREATE INDEX "idx_org_proposals_org_id" ON "organization_service_proposals" ("organization_id");
    `);

    // ─── 5. BENEFICIARY ELIGIBILITIES ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "beneficiary_eligibilities" (
        "id"                             UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"                UUID         NOT NULL,
        "membership_id"                  UUID         NOT NULL,
        "eligibility_type"               VARCHAR(30)  NOT NULL DEFAULT 'ONGOING',
        "status"                         VARCHAR(30)  NOT NULL DEFAULT 'ACTIVE',
        "approved_assistance_categories" JSONB        NOT NULL DEFAULT '["*"]',
        "review_due_at"                  TIMESTAMPTZ  NOT NULL,
        "approved_by_user_id"            UUID         NOT NULL,
        "approved_at"                    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "monthly_request_quota"          INT          NOT NULL DEFAULT 8,
        "quota_override_reason"          TEXT,
        "created_at"                     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"                     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_beneficiary_eligibilities" PRIMARY KEY ("id"),
        CONSTRAINT "uq_beneficiary_eligibility" UNIQUE ("organization_id", "membership_id"),
        CONSTRAINT "fk_beneficiary_eligibility_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_beneficiary_eligibility_membership" FOREIGN KEY ("membership_id")
          REFERENCES "organization_memberships"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_beneficiary_eligibility_approver" FOREIGN KEY ("approved_by_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_beneficiary_eligibility_status" ON "beneficiary_eligibilities" ("organization_id", "status");
    `);

    // ─── 6. CAREGIVER AUTHORIZATIONS ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "caregiver_authorizations" (
        "id"                         UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"            UUID         NOT NULL,
        "beneficiary_membership_id"  UUID         NOT NULL,
        "caregiver_membership_id"    UUID         NOT NULL,
        "relationship_type"          VARCHAR(50)  NOT NULL DEFAULT 'FAMILY_CHILD',
        "status"                     VARCHAR(30)  NOT NULL DEFAULT 'PENDING_REVIEW',
        "authorization_document_id"  UUID,
        "can_initiate_requests"      BOOLEAN      NOT NULL DEFAULT true,
        "can_verify_completions"     BOOLEAN      NOT NULL DEFAULT true,
        "approved_by_user_id"        UUID,
        "approved_at"                TIMESTAMPTZ,
        "revoked_at"                 TIMESTAMPTZ,
        "revoked_by_user_id"         UUID,
        "revocation_reason"          TEXT,
        "created_at"                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_caregiver_authorizations" PRIMARY KEY ("id"),
        CONSTRAINT "uq_caregiver_authorization" UNIQUE ("organization_id", "beneficiary_membership_id", "caregiver_membership_id"),
        CONSTRAINT "fk_caregiver_auth_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_caregiver_auth_beneficiary" FOREIGN KEY ("beneficiary_membership_id")
          REFERENCES "organization_memberships"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_caregiver_auth_caregiver" FOREIGN KEY ("caregiver_membership_id")
          REFERENCES "organization_memberships"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_caregiver_auth_document" FOREIGN KEY ("authorization_document_id")
          REFERENCES "membership_documents"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_caregiver_auth_approver" FOREIGN KEY ("approved_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_caregiver_auth_revoker" FOREIGN KEY ("revoked_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_caregiver_auth_beneficiary" ON "caregiver_authorizations" ("beneficiary_membership_id", "status");
      CREATE INDEX "idx_caregiver_auth_caregiver" ON "caregiver_authorizations" ("caregiver_membership_id", "status");
    `);

    // ─── 7. VOLUNTEER SKILLS ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "volunteer_skills" (
        "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"     UUID         NOT NULL,
        "membership_id"       UUID         NOT NULL,
        "skill_code"          VARCHAR(50)  NOT NULL,
        "status"              VARCHAR(30)  NOT NULL DEFAULT 'PENDING_VERIFICATION',
        "verification_notes"  TEXT,
        "verified_by_user_id" UUID,
        "verified_at"         TIMESTAMPTZ,
        "document_id"         UUID,
        "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_volunteer_skills" PRIMARY KEY ("id"),
        CONSTRAINT "uq_volunteer_skills" UNIQUE ("membership_id", "skill_code"),
        CONSTRAINT "fk_volunteer_skills_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_volunteer_skills_membership" FOREIGN KEY ("membership_id")
          REFERENCES "organization_memberships"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_volunteer_skills_verifier" FOREIGN KEY ("verified_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_volunteer_skills_document" FOREIGN KEY ("document_id")
          REFERENCES "membership_documents"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_volunteer_skills_lookup" ON "volunteer_skills" ("organization_id", "skill_code", "status");
    `);

    // ─── 8. VOLUNTEER AVAILABILITIES ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "volunteer_availabilities" (
        "id"                     UUID          NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"        UUID          NOT NULL,
        "membership_id"          UUID          NOT NULL,
        "is_available_immediate" BOOLEAN       NOT NULL DEFAULT true,
        "max_travel_radius_km"   NUMERIC(4, 1) NOT NULL DEFAULT 5.0,
        "preferred_ward_numbers" JSONB         NOT NULL DEFAULT '[]',
        "transient_lat"          NUMERIC(10, 7),
        "transient_lng"          NUMERIC(10, 7),
        "transient_updated_at"   TIMESTAMPTZ,
        "created_at"             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "updated_at"             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_volunteer_availabilities" PRIMARY KEY ("id"),
        CONSTRAINT "uq_volunteer_availability" UNIQUE ("organization_id", "membership_id"),
        CONSTRAINT "fk_volunteer_availability_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_volunteer_availability_membership" FOREIGN KEY ("membership_id")
          REFERENCES "organization_memberships"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_volunteer_availabilities_org" ON "volunteer_availabilities" ("organization_id", "is_available_immediate");
    `);

    // ─── 9. SERVICE REQUESTS ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "service_requests" (
        "id"                          UUID           NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"             UUID           NOT NULL,
        "request_number"              VARCHAR(50)    NOT NULL,
        "idempotency_key"             VARCHAR(100),
        "beneficiary_membership_id"   UUID           NOT NULL,
        "service_catalog_id"          UUID           NOT NULL,
        "created_by_user_id"          UUID           NOT NULL,
        "creation_channel"            VARCHAR(30)    NOT NULL DEFAULT 'DIRECT_BENEFICIARY',
        "caregiver_authorization_id"  UUID,
        "urgency"                     VARCHAR(20)    NOT NULL DEFAULT 'IMMEDIATE',
        "status"                      VARCHAR(30)    NOT NULL DEFAULT 'MATCHING_ACTIVE',
        "scheduled_start_time"        TIMESTAMPTZ    NOT NULL,
        "expected_duration_minutes"   INT            NOT NULL DEFAULT 60,
        "min_volunteers"              INT            NOT NULL DEFAULT 1,
        "preferred_volunteers"        INT            NOT NULL DEFAULT 1,
        "location_address_text"       TEXT           NOT NULL,
        "location_ward_number"        VARCHAR(20)    NOT NULL,
        "location_landmark"           VARCHAR(255),
        "location_postal_code"        VARCHAR(10)    NOT NULL,
        "location_lat"                NUMERIC(10, 7),
        "location_lng"                NUMERIC(10, 7),
        "beneficiary_notes"           TEXT,
        "matching_radius_km"          NUMERIC(4, 1)  NOT NULL DEFAULT 3.0,
        "matching_tier"               INT            NOT NULL DEFAULT 1,
        "escalated_at"                TIMESTAMPTZ,
        "assigned_coordinator_id"     UUID,
        "allows_cross_org_volunteers" BOOLEAN        NOT NULL DEFAULT false,
        "created_at"                  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        "updated_at"                  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_service_requests" PRIMARY KEY ("id"),
        CONSTRAINT "uq_service_requests_org_number" UNIQUE ("organization_id", "request_number"),
        CONSTRAINT "fk_service_requests_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_service_requests_beneficiary" FOREIGN KEY ("beneficiary_membership_id")
          REFERENCES "organization_memberships"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_service_requests_catalog" FOREIGN KEY ("service_catalog_id")
          REFERENCES "organization_service_catalog"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_service_requests_creator" FOREIGN KEY ("created_by_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_service_requests_caregiver_auth" FOREIGN KEY ("caregiver_authorization_id")
          REFERENCES "caregiver_authorizations"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_service_requests_coordinator" FOREIGN KEY ("assigned_coordinator_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_service_requests_min_volunteers" CHECK ("min_volunteers" >= 1),
        CONSTRAINT "chk_service_requests_pref_volunteers" CHECK ("preferred_volunteers" >= "min_volunteers")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_service_requests_org_status" ON "service_requests" ("organization_id", "status");
      CREATE INDEX "idx_service_requests_matching" ON "service_requests" ("status", "scheduled_start_time", "urgency")
        WHERE "status" IN ('MATCHING_ACTIVE', 'PARTIALLY_ACCEPTED');
      CREATE INDEX "idx_service_requests_beneficiary" ON "service_requests" ("beneficiary_membership_id");
      CREATE UNIQUE INDEX "uq_service_requests_idempotency" ON "service_requests" ("organization_id", "idempotency_key")
        WHERE "idempotency_key" IS NOT NULL;
    `);

    // ─── 10. VOLUNTEER ASSIGNMENTS ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "volunteer_assignments" (
        "id"                         UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"            UUID         NOT NULL,
        "service_request_id"         UUID         NOT NULL,
        "volunteer_membership_id"    UUID         NOT NULL,
        "slot_number"                INT          NOT NULL DEFAULT 1,
        "status"                     VARCHAR(30)  NOT NULL DEFAULT 'OFFERED',
        "offered_at"                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "offer_expires_at"           TIMESTAMPTZ  NOT NULL,
        "accepted_at"                TIMESTAMPTZ,
        "declined_at"                TIMESTAMPTZ,
        "decline_reason"             TEXT,
        "withdrawn_at"               TIMESTAMPTZ,
        "withdrawal_reason"          TEXT,
        "replaced_by_assignment_id"  UUID,
        "assigned_by_coordinator_id" UUID,
        "created_at"                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_volunteer_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "fk_vol_assignments_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_vol_assignments_request" FOREIGN KEY ("service_request_id")
          REFERENCES "service_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_vol_assignments_volunteer" FOREIGN KEY ("volunteer_membership_id")
          REFERENCES "organization_memberships"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_vol_assignments_replacement" FOREIGN KEY ("replaced_by_assignment_id")
          REFERENCES "volunteer_assignments"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_vol_assignments_coordinator" FOREIGN KEY ("assigned_by_coordinator_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_volunteer_assignments_lookup" ON "volunteer_assignments" ("volunteer_membership_id", "status");
      CREATE INDEX "idx_volunteer_assignments_request" ON "volunteer_assignments" ("service_request_id", "status");
      CREATE UNIQUE INDEX "uq_active_volunteer_assignment"
        ON "volunteer_assignments" ("service_request_id", "volunteer_membership_id")
        WHERE "status" IN ('OFFERED', 'ACCEPTED', 'IN_PROGRESS');
    `);

    // ─── 11. REQUEST CANCELLATIONS ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "request_cancellations" (
        "id"                   UUID          NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"      UUID          NOT NULL,
        "service_request_id"   UUID          NOT NULL,
        "cancelled_by_user_id" UUID          NOT NULL,
        "canceller_role"       VARCHAR(30)   NOT NULL,
        "reason_code"          VARCHAR(50)   NOT NULL,
        "notes"                TEXT          NOT NULL,
        "cancelled_at"         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        "hours_before_start"   NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
        CONSTRAINT "pk_request_cancellations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_req_cancellations_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_req_cancellations_request" FOREIGN KEY ("service_request_id")
          REFERENCES "service_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_req_cancellations_user" FOREIGN KEY ("cancelled_by_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_request_cancellations_request" ON "request_cancellations" ("service_request_id");
    `);

    // ─── 12. REQUEST RESCHEDULES ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "request_reschedules" (
        "id"                     UUID        NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"        UUID        NOT NULL,
        "service_request_id"     UUID        NOT NULL,
        "rescheduled_by_user_id" UUID        NOT NULL,
        "previous_start_time"    TIMESTAMPTZ NOT NULL,
        "new_start_time"         TIMESTAMPTZ NOT NULL,
        "reason"                 TEXT        NOT NULL,
        "created_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_request_reschedules" PRIMARY KEY ("id"),
        CONSTRAINT "fk_req_reschedules_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_req_reschedules_request" FOREIGN KEY ("service_request_id")
          REFERENCES "service_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_req_reschedules_user" FOREIGN KEY ("rescheduled_by_user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_request_reschedules_request" ON "request_reschedules" ("service_request_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "request_reschedules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "request_cancellations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "volunteer_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "service_requests"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "volunteer_availabilities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "volunteer_skills"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "caregiver_authorizations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "beneficiary_eligibilities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_service_proposals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_service_catalog"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "global_service_definitions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "service_categories"`);
  }
}
