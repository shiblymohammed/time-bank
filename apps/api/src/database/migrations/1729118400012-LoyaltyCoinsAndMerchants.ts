import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Milestone 6 — Loyalty Coins & Merchants (FR-LOY-01 – FR-LOY-06, D#3, D#4, D#20–D#23).
 *
 * Tables created:
 *   loyalty_coin_wallets    — one per user per org (municipality-scoped)
 *   loyalty_coin_ledger     — append-only coin earn/spend ledger
 *   organization_merchants  — merchant registry per org
 *   merchant_offers         — offers proposed by merchants, approved by Municipality Admin
 *   loyalty_redemptions     — records of offer redemptions with unique one-time codes
 */
export class LoyaltyCoinsAndMerchants1729118400012 implements MigrationInterface {
  name = 'LoyaltyCoinsAndMerchants1729118400012';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ─── 1. LOYALTY COIN WALLETS ──────────────────────────────────────────────
    // One wallet per user per org (municipality-scoped, not universal like time credits).
    await queryRunner.query(`
      CREATE TABLE "loyalty_coin_wallets" (
        "id"              UUID           NOT NULL DEFAULT gen_random_uuid(),
        "user_id"         UUID           NOT NULL,
        "organization_id" UUID           NOT NULL,
        "balance_coins"   NUMERIC(12, 2) NOT NULL DEFAULT 0,
        "status"          VARCHAR(20)    NOT NULL DEFAULT 'ACTIVE',
        "created_at"      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_loyalty_coin_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "uq_loyalty_wallet_user_org" UNIQUE ("user_id", "organization_id"),
        CONSTRAINT "fk_loyalty_wallet_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_loyalty_wallet_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_loyalty_wallet_balance" CHECK ("balance_coins" >= 0),
        CONSTRAINT "chk_loyalty_wallet_status" CHECK ("status" IN ('ACTIVE', 'FROZEN', 'CLOSED'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_loyalty_wallet_user" ON "loyalty_coin_wallets" ("user_id");
      CREATE INDEX "idx_loyalty_wallet_org" ON "loyalty_coin_wallets" ("organization_id");
    `);

    // ─── 2. LOYALTY COIN LEDGER ───────────────────────────────────────────────
    // Append-only (enforced by trigger below). Every coin movement is recorded here.
    await queryRunner.query(`
      CREATE TABLE "loyalty_coin_ledger" (
        "id"                  UUID           NOT NULL DEFAULT gen_random_uuid(),
        "wallet_id"           UUID           NOT NULL,
        "organization_id"     UUID           NOT NULL,
        "amount"              NUMERIC(10, 2) NOT NULL,
        "balance_after"       NUMERIC(12, 2) NOT NULL,
        "tx_type"             VARCHAR(30)    NOT NULL,
        "service_request_id"  UUID,
        "assignment_id"       UUID,
        "redemption_id"       UUID,
        "reference"           VARCHAR(200),
        "created_at"          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_loyalty_coin_ledger" PRIMARY KEY ("id"),
        CONSTRAINT "fk_lcl_wallet" FOREIGN KEY ("wallet_id")
          REFERENCES "loyalty_coin_wallets"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_lcl_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_lcl_request" FOREIGN KEY ("service_request_id")
          REFERENCES "service_requests"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_lcl_assignment" FOREIGN KEY ("assignment_id")
          REFERENCES "volunteer_assignments"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_lcl_amount_nonzero" CHECK ("amount" <> 0),
        CONSTRAINT "chk_lcl_balance_nonneg" CHECK ("balance_after" >= 0),
        CONSTRAINT "chk_lcl_tx_type" CHECK ("tx_type" IN (
          'SERVICE_EARNED', 'OFFER_REDEEMED', 'ADMIN_ADJUSTMENT'
        ))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_lcl_wallet_created" ON "loyalty_coin_ledger" ("wallet_id", "created_at" DESC);
      CREATE UNIQUE INDEX "uq_lcl_assignment_earned"
        ON "loyalty_coin_ledger" ("assignment_id")
        WHERE "tx_type" = 'SERVICE_EARNED' AND "assignment_id" IS NOT NULL;
    `);
    // Append-only trigger — rejects UPDATE and DELETE on loyalty_coin_ledger
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION trg_loyalty_coin_ledger_append_only()
      RETURNS TRIGGER LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'loyalty_coin_ledger rows are append-only';
      END;
      $$;
      CREATE TRIGGER trg_lcl_append_only
        BEFORE UPDATE OR DELETE ON "loyalty_coin_ledger"
        FOR EACH ROW EXECUTE FUNCTION trg_loyalty_coin_ledger_append_only();
    `);

    // ─── 3. ORGANIZATION MERCHANTS ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "organization_merchants" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" UUID         NOT NULL,
        "merchant_name"   VARCHAR(200) NOT NULL,
        "phone"           VARCHAR(20)  NOT NULL,
        "address"         TEXT         NOT NULL,
        "category"        VARCHAR(100),
        "status"          VARCHAR(30)  NOT NULL DEFAULT 'PENDING_APPROVAL',
        "approved_by"     UUID,
        "approved_at"     TIMESTAMPTZ,
        "notes"           TEXT,
        "created_by"      UUID         NOT NULL,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_organization_merchants" PRIMARY KEY ("id"),
        CONSTRAINT "fk_merchant_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_merchant_approver" FOREIGN KEY ("approved_by")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "fk_merchant_creator" FOREIGN KEY ("created_by")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_merchant_status" CHECK ("status" IN (
          'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED'
        ))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_merchant_org_status" ON "organization_merchants" ("organization_id", "status");
    `);

    // ─── 4. MERCHANT OFFERS ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "merchant_offers" (
        "id"                  UUID           NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"     UUID           NOT NULL,
        "merchant_id"         UUID           NOT NULL,
        "title"               VARCHAR(200)   NOT NULL,
        "description"         TEXT           NOT NULL,
        "coin_cost"           NUMERIC(8, 2)  NOT NULL,
        "max_redemptions"     INT,
        "redemptions_count"   INT            NOT NULL DEFAULT 0,
        "valid_from"          TIMESTAMPTZ    NOT NULL,
        "valid_until"         TIMESTAMPTZ    NOT NULL,
        "status"              VARCHAR(30)    NOT NULL DEFAULT 'PENDING_REVIEW',
        "proposed_by"         UUID           NOT NULL,
        "reviewed_by"         UUID,
        "reviewed_at"         TIMESTAMPTZ,
        "rejection_reason"    TEXT,
        "created_at"          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        "updated_at"          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_merchant_offers" PRIMARY KEY ("id"),
        CONSTRAINT "fk_offer_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_offer_merchant" FOREIGN KEY ("merchant_id")
          REFERENCES "organization_merchants"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_offer_proposer" FOREIGN KEY ("proposed_by")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_offer_reviewer" FOREIGN KEY ("reviewed_by")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "chk_offer_coin_cost" CHECK ("coin_cost" > 0),
        CONSTRAINT "chk_offer_dates" CHECK ("valid_until" > "valid_from"),
        CONSTRAINT "chk_offer_redemptions" CHECK ("max_redemptions" IS NULL OR "max_redemptions" > 0),
        CONSTRAINT "chk_offer_status" CHECK ("status" IN (
          'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'EXPIRED', 'WITHDRAWN'
        ))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_offer_org_status" ON "merchant_offers" ("organization_id", "status");
      CREATE INDEX "idx_offer_merchant" ON "merchant_offers" ("merchant_id");
      CREATE INDEX "idx_offer_active" ON "merchant_offers" ("organization_id", "valid_until")
        WHERE "status" = 'ACTIVE';
    `);

    // ─── 5. LOYALTY REDEMPTIONS ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "loyalty_redemptions" (
        "id"              UUID           NOT NULL DEFAULT gen_random_uuid(),
        "organization_id" UUID           NOT NULL,
        "offer_id"        UUID           NOT NULL,
        "merchant_id"     UUID           NOT NULL,
        "user_id"         UUID           NOT NULL,
        "wallet_id"       UUID           NOT NULL,
        "coins_spent"     NUMERIC(8, 2)  NOT NULL,
        "one_time_code"   VARCHAR(12)    NOT NULL,
        "redeemed_at"     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_loyalty_redemptions" PRIMARY KEY ("id"),
        CONSTRAINT "uq_redemption_code" UNIQUE ("one_time_code"),
        CONSTRAINT "fk_redemption_org" FOREIGN KEY ("organization_id")
          REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_redemption_offer" FOREIGN KEY ("offer_id")
          REFERENCES "merchant_offers"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_redemption_merchant" FOREIGN KEY ("merchant_id")
          REFERENCES "organization_merchants"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_redemption_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_redemption_wallet" FOREIGN KEY ("wallet_id")
          REFERENCES "loyalty_coin_wallets"("id") ON DELETE RESTRICT,
        CONSTRAINT "chk_redemption_coins" CHECK ("coins_spent" > 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_redemption_org" ON "loyalty_redemptions" ("organization_id", "redeemed_at" DESC);
      CREATE INDEX "idx_redemption_user" ON "loyalty_redemptions" ("user_id");
      CREATE INDEX "idx_redemption_merchant" ON "loyalty_redemptions" ("merchant_id");
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_redemption_merchant"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_redemption_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_redemption_org"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty_redemptions"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_offer_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_offer_merchant"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_offer_org_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "merchant_offers"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_merchant_org_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_merchants"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_lcl_append_only ON "loyalty_coin_ledger"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS trg_loyalty_coin_ledger_append_only`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_lcl_assignment_earned"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_lcl_wallet_created"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty_coin_ledger"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_loyalty_wallet_org"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_loyalty_wallet_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "loyalty_coin_wallets"`);
  }
}
