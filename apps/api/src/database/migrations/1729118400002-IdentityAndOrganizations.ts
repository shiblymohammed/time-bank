import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Identity and Organizations (1729118400002)
 *
 * Establishes the foundational schema for Milestone 2:
 *  - Global users, verified identities, identity documents
 *  - OTP challenges and global authentication sessions
 *  - Platform-wide global account restrictions
 *  - Universal time wallets contract (User 1-to-1 Wallet)
 *  - Organizations, branding, app release builds
 *  - Organization memberships, scoped role grants, approvals, documents
 *  - Multi-tenant audit trail support
 *
 * Implements PRD v2.0 & Milestone 2 Blueprint:
 *  - ITB-001 through ITB-012
 *  - D#1, D#2, D#17, D#39, D#42, D#80, D#82, D#103
 */
export class IdentityAndOrganizations1729118400002 implements MigrationInterface {
  name = 'IdentityAndOrganizations1729118400002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── 1. ORGANIZATIONS ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "code"        VARCHAR(50)  NOT NULL,
        "name"        VARCHAR(200) NOT NULL,
        "type"        VARCHAR(50)  NOT NULL DEFAULT 'MUNICIPALITY',
        "status"      VARCHAR(30)  NOT NULL DEFAULT 'ACTIVE',
        "state_code"  VARCHAR(10)  NOT NULL DEFAULT 'KL',
        "district"    VARCHAR(100) NOT NULL,
        "created_by"  UUID,
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_organizations" PRIMARY KEY ("id"),
        CONSTRAINT "uq_organizations_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_organizations_status" ON "organizations" ("status");
    `);

    // ─── 2. USERS (Global Identity) ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "phone_e164"      VARCHAR(20)  NOT NULL,
        "status"          VARCHAR(30)  NOT NULL DEFAULT 'ACTIVE',
        "primary_org_id"  UUID,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_phone_e164" UNIQUE ("phone_e164"),
        CONSTRAINT "fk_users_primary_org" FOREIGN KEY ("primary_org_id")
          REFERENCES "organizations"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_users_status" ON "users" ("status");
    `);

    // Add foreign key constraint for created_by in organizations
    await queryRunner.query(`
      ALTER TABLE "organizations"
        ADD CONSTRAINT "fk_organizations_created_by"
        FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL;
    `);

    // ─── 3. VERIFIED IDENTITIES ─────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "verified_identities" (
        "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"             UUID         NOT NULL,
        "verification_status" VARCHAR(30)  NOT NULL DEFAULT 'UNVERIFIED',
        "verification_level"  VARCHAR(30)  NOT NULL DEFAULT 'BASIC',
        "verified_at"         TIMESTAMPTZ,
        "verified_by"         UUID,
        "rejection_reason"    TEXT,
        "created_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_verified_identities" PRIMARY KEY ("id"),
        CONSTRAINT "uq_verified_identities_user_id" UNIQUE ("user_id"),
        CONSTRAINT "fk_verified_identities_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_verified_identities_verifier" FOREIGN KEY ("verified_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_verified_identities_status" ON "verified_identities" ("verification_status");
    `);

    // ─── 4. IDENTITY DOCUMENTS ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "identity_documents" (
        "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"        UUID         NOT NULL,
        "document_type"  VARCHAR(50)  NOT NULL,
        "storage_key"    VARCHAR(255) NOT NULL,
        "review_status"  VARCHAR(30)  NOT NULL DEFAULT 'PENDING',
        "reviewed_at"    TIMESTAMPTZ,
        "reviewed_by"    UUID,
        "notes"          TEXT,
        "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_identity_documents" PRIMARY KEY ("id"),
        CONSTRAINT "fk_identity_documents_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_identity_documents_reviewer" FOREIGN KEY ("reviewed_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_identity_documents_user_id" ON "identity_documents" ("user_id");
      CREATE INDEX "idx_identity_documents_review_status" ON "identity_documents" ("review_status");
    `);

    // ─── 5. OTP CHALLENGES ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "otp_challenges" (
        "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
        "phone_hash"    VARCHAR(64)  NOT NULL,
        "code_hash"     VARCHAR(128) NOT NULL,
        "expires_at"    TIMESTAMPTZ  NOT NULL,
        "attempt_count" INT          NOT NULL DEFAULT 0,
        "max_attempts"  INT          NOT NULL DEFAULT 3,
        "consumed_at"   TIMESTAMPTZ,
        "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_otp_challenges" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_otp_challenges_phone_expires" ON "otp_challenges" ("phone_hash", "expires_at");
    `);

    // ─── 6. AUTHENTICATION SESSIONS ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "authentication_sessions" (
        "id"                 UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"            UUID         NOT NULL,
        "refresh_token_hash" VARCHAR(128) NOT NULL,
        "active_org_id"      UUID,
        "device_info"        JSONB        NOT NULL DEFAULT '{}',
        "expires_at"         TIMESTAMPTZ  NOT NULL,
        "revoked_at"         TIMESTAMPTZ,
        "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_authentication_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_auth_sessions_token_hash" UNIQUE ("refresh_token_hash"),
        CONSTRAINT "fk_auth_sessions_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_auth_sessions_org" FOREIGN KEY ("active_org_id")
          REFERENCES "organizations"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_auth_sessions_user_id" ON "authentication_sessions" ("user_id");
      CREATE INDEX "idx_auth_sessions_expires_at" ON "authentication_sessions" ("expires_at");
    `);

    // ─── 7. GLOBAL ACCOUNT RESTRICTIONS ─────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "global_account_restrictions" (
        "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"          UUID         NOT NULL,
        "restriction_type" VARCHAR(50)  NOT NULL,
        "reason_code"      VARCHAR(100) NOT NULL,
        "status"           VARCHAR(30)  NOT NULL DEFAULT 'ACTIVE',
        "authorized_by"    UUID         NOT NULL,
        "resolved_at"      TIMESTAMPTZ,
        "resolved_by"      UUID,
        "resolution_notes" TEXT,
        "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_global_account_restrictions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_global_restrictions_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_global_restrictions_authorizer" FOREIGN KEY ("authorized_by")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_global_restrictions_resolver" FOREIGN KEY ("resolved_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_global_restrictions_user_status" ON "global_account_restrictions" ("user_id", "status");
    `);

    // ─── 8. UNIVERSAL TIME WALLETS CONTRACT ─────────────────────────────────
    // D#17: Single lifetime wallet belonging to global user, NOT to an organization
    await queryRunner.query(`
      CREATE TABLE "universal_time_wallets" (
        "id"              UUID           NOT NULL DEFAULT gen_random_uuid(),
        "user_id"         UUID           NOT NULL,
        "balance_credits" NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        "frozen_credits"  NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        "status"          VARCHAR(30)    NOT NULL DEFAULT 'ACTIVE',
        "created_at"      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_universal_time_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "uq_universal_time_wallets_user_id" UNIQUE ("user_id"),
        CONSTRAINT "fk_universal_time_wallets_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    // ─── 9. ORGANIZATION BRANDING ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "organization_branding" (
        "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"  UUID         NOT NULL,
        "app_display_name" VARCHAR(100) NOT NULL,
        "logo_key"         VARCHAR(255),
        "primary_color"    VARCHAR(20)  NOT NULL DEFAULT '#0D5C75',
        "secondary_color"  VARCHAR(20)  NOT NULL DEFAULT '#F59E0B',
        "theme_config"     JSONB        NOT NULL DEFAULT '{}',
        "support_email"    VARCHAR(255),
        "version"          INT          NOT NULL DEFAULT 1,
        "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_organization_branding" PRIMARY KEY ("id"),
        CONSTRAINT "uq_org_branding_org_id" UNIQUE ("organization_id"),
        CONSTRAINT "fk_org_branding_organization" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);

    // ─── 10. ORGANIZATION APP BUILDS ────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "organization_app_builds" (
        "id"                    UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"       UUID         NOT NULL,
        "platform"              VARCHAR(20)  NOT NULL DEFAULT 'ANDROID',
        "application_id"        VARCHAR(255) NOT NULL,
        "build_version"         VARCHAR(50)  NOT NULL DEFAULT '1.0.0',
        "min_supported_version" VARCHAR(50)  NOT NULL DEFAULT '1.0.0',
        "release_status"        VARCHAR(30)  NOT NULL DEFAULT 'DRAFT',
        "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_organization_app_builds" PRIMARY KEY ("id"),
        CONSTRAINT "uq_org_app_builds_platform_app_id" UNIQUE ("platform", "application_id"),
        CONSTRAINT "fk_org_app_builds_organization" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);

    // ─── 11. ORGANIZATION MEMBERSHIPS ───────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "organization_memberships" (
        "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"   UUID         NOT NULL,
        "user_id"           UUID         NOT NULL,
        "membership_number" VARCHAR(50),
        "status"            VARCHAR(30)  NOT NULL DEFAULT 'APPLIED',
        "applied_at"        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "approved_at"       TIMESTAMPTZ,
        "approved_by"       UUID,
        "rejection_reason"  TEXT,
        "created_at"        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_organization_memberships" PRIMARY KEY ("id"),
        CONSTRAINT "uq_org_memberships_org_user" UNIQUE ("organization_id", "user_id"),
        CONSTRAINT "fk_org_memberships_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_org_memberships_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_org_memberships_approver" FOREIGN KEY ("approved_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_org_memberships_org_status" ON "organization_memberships" ("organization_id", "status");
      CREATE INDEX "idx_org_memberships_user_id" ON "organization_memberships" ("user_id");
    `);

    // ─── 12. MEMBERSHIP ROLE GRANTS ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "membership_role_grants" (
        "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
        "membership_id"     UUID         NOT NULL,
        "role"              VARCHAR(50)  NOT NULL,
        "status"            VARCHAR(30)  NOT NULL DEFAULT 'ACTIVE',
        "granted_at"        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "granted_by"        UUID         NOT NULL,
        "revoked_at"        TIMESTAMPTZ,
        "revoked_by"        UUID,
        "revocation_reason" TEXT,
        CONSTRAINT "pk_membership_role_grants" PRIMARY KEY ("id"),
        CONSTRAINT "fk_role_grants_membership" FOREIGN KEY ("membership_id")
          REFERENCES "organization_memberships"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_role_grants_granter" FOREIGN KEY ("granted_by")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_role_grants_revoker" FOREIGN KEY ("revoked_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // Prevent duplicate active grants of the same role within a membership
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_role_grants_active_role"
        ON "membership_role_grants" ("membership_id", "role")
        WHERE "status" = 'ACTIVE';
    `);

    // ─── 13. MEMBERSHIP APPROVALS (Audit Trail) ─────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "membership_approvals" (
        "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
        "membership_id" UUID         NOT NULL,
        "action"        VARCHAR(50)  NOT NULL,
        "actor_id"      UUID         NOT NULL,
        "notes"         TEXT,
        "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_membership_approvals" PRIMARY KEY ("id"),
        CONSTRAINT "fk_membership_approvals_membership" FOREIGN KEY ("membership_id")
          REFERENCES "organization_memberships"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_membership_approvals_actor" FOREIGN KEY ("actor_id")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_membership_approvals_membership_id" ON "membership_approvals" ("membership_id");
    `);

    // ─── 14. MEMBERSHIP DOCUMENTS ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "membership_documents" (
        "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
        "membership_id" UUID         NOT NULL,
        "storage_key"   VARCHAR(255) NOT NULL,
        "document_type" VARCHAR(50)  NOT NULL,
        "review_status" VARCHAR(30)  NOT NULL DEFAULT 'PENDING',
        "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_membership_documents" PRIMARY KEY ("id"),
        CONSTRAINT "fk_membership_documents_membership" FOREIGN KEY ("membership_id")
          REFERENCES "organization_memberships"("id") ON DELETE CASCADE
      )
    `);

    // ─── 15. UPDATE AUDIT_EVENTS (Multi-Tenant Organization column) ─────────
    await queryRunner.query(`
      ALTER TABLE "audit_events"
        ADD COLUMN IF NOT EXISTS "organization_id" UUID;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_events_organization_id" ON "audit_events" ("organization_id")
      WHERE "organization_id" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_events_organization_id"`);
    await queryRunner.query(`ALTER TABLE "audit_events" DROP COLUMN IF EXISTS "organization_id"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "membership_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "membership_approvals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "membership_role_grants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_memberships"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_app_builds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_branding"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "universal_time_wallets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "global_account_restrictions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "authentication_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "otp_challenges"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "identity_documents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "verified_identities"`);

    await queryRunner.query(`
      ALTER TABLE "organizations" DROP CONSTRAINT IF EXISTS "fk_organizations_created_by"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations"`);
  }
}
