import { MigrationInterface, QueryRunner } from 'typeorm';

/** M6 coins are local, append-only and never part of the universal time wallet. */
export class LoyaltyAndMerchants1729118400023 implements MigrationInterface {
  name = 'LoyaltyAndMerchants1729118400023';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE loyalty_policies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        version BIGSERIAL UNIQUE NOT NULL,
        enabled BOOLEAN NOT NULL,
        coins_per_hour INTEGER NOT NULL CHECK (coins_per_hour BETWEEN 0 AND 1000000),
        engagement_cap INTEGER NOT NULL CHECK (engagement_cap BETWEEN 0 AND 1000000),
        campaign_cap_per_hour INTEGER NOT NULL CHECK (campaign_cap_per_hour BETWEEN 0 AND 1000000),
        milestones JSONB NOT NULL CHECK (jsonb_typeof(milestones)='array'),
        created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE loyalty_programs (
        organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE RESTRICT,
        enabled BOOLEAN NOT NULL DEFAULT false,
        leaderboard_enabled BOOLEAN NOT NULL DEFAULT false,
        updated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE loyalty_wallets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        balance_coins NUMERIC(14,0) NOT NULL DEFAULT 0 CHECK (balance_coins>=0),
        frozen_coins NUMERIC(14,0) NOT NULL DEFAULT 0 CHECK (frozen_coins>=0),
        verified_minutes BIGINT NOT NULL DEFAULT 0 CHECK (verified_minutes>=0),
        status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CLOSED','RETIRED')),
        leaderboard_opt_in BOOLEAN NOT NULL DEFAULT false,
        display_name VARCHAR(60),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (organization_id,user_id),
        UNIQUE (id,organization_id,user_id)
      );
      CREATE TABLE loyalty_service_awards (
        assignment_id UUID PRIMARY KEY REFERENCES volunteer_assignments(id) ON DELETE RESTRICT,
        request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE RESTRICT,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        policy_id UUID REFERENCES loyalty_policies(id) ON DELETE RESTRICT,
        confirmed_minutes INTEGER NOT NULL CHECK (confirmed_minutes>0),
        coins INTEGER NOT NULL CHECK (coins>=0),
        held BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE loyalty_campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        title VARCHAR(120) NOT NULL,
        bonus_per_hour INTEGER NOT NULL CHECK (bonus_per_hour BETWEEN 1 AND 1000000),
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at>starts_at),
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REFUSED')),
        proposed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        decided_by UUID REFERENCES users(id) ON DELETE RESTRICT,
        decided_at TIMESTAMPTZ,
        client_operation_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (organization_id,proposed_by,client_operation_id)
      );
      CREATE TABLE loyalty_engagement_awards (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        coins INTEGER NOT NULL CHECK (coins BETWEEN 1 AND 1000000),
        reason VARCHAR(500) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REFUSED')),
        proposed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        decided_by UUID REFERENCES users(id) ON DELETE RESTRICT,
        decided_at TIMESTAMPTZ,
        client_operation_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (organization_id,proposed_by,client_operation_id)
      );
      CREATE TABLE organization_merchants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        name VARCHAR(150) NOT NULL,
        address VARCHAR(500) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','SUSPENDED')),
        decided_by UUID REFERENCES users(id) ON DELETE RESTRICT,
        decided_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (organization_id,owner_user_id),
        UNIQUE (id,organization_id)
      );
      CREATE TABLE merchant_offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        merchant_id UUID NOT NULL,
        previous_offer_id UUID REFERENCES merchant_offers(id) ON DELETE RESTRICT,
        title VARCHAR(150) NOT NULL,
        description VARCHAR(1500) NOT NULL,
        terms VARCHAR(1500) NOT NULL,
        coins INTEGER NOT NULL CHECK (coins BETWEEN 1 AND 1000000),
        starts_at TIMESTAMPTZ NOT NULL,
        ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at>starts_at),
        redemption_limit INTEGER NOT NULL CHECK (redemption_limit BETWEEN 1 AND 1000000),
        redeemed_count INTEGER NOT NULL DEFAULT 0 CHECK (redeemed_count BETWEEN 0 AND redemption_limit),
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN')),
        proposed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        decided_by UUID REFERENCES users(id) ON DELETE RESTRICT,
        decided_at TIMESTAMPTZ,
        client_operation_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        FOREIGN KEY (merchant_id,organization_id) REFERENCES organization_merchants(id,organization_id) ON DELETE RESTRICT,
        UNIQUE (organization_id,proposed_by,client_operation_id),
        UNIQUE (id,merchant_id,organization_id)
      );
      CREATE TABLE loyalty_redemptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        user_id UUID NOT NULL,
        wallet_id UUID NOT NULL,
        merchant_id UUID NOT NULL,
        offer_id UUID NOT NULL,
        coins INTEGER NOT NULL CHECK (coins>0),
        token_hash CHAR(64) UNIQUE NOT NULL,
        code_hash CHAR(64) UNIQUE NOT NULL,
        client_operation_id UUID NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','REDEEMED','CANCELLED')),
        expires_at TIMESTAMPTZ NOT NULL,
        redeemed_at TIMESTAMPTZ,
        redeemed_by UUID REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        FOREIGN KEY (wallet_id,organization_id,user_id) REFERENCES loyalty_wallets(id,organization_id,user_id) ON DELETE RESTRICT,
        FOREIGN KEY (offer_id,merchant_id,organization_id) REFERENCES merchant_offers(id,merchant_id,organization_id) ON DELETE RESTRICT,
        UNIQUE (organization_id,user_id,client_operation_id)
      );
      CREATE TABLE loyalty_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_id UUID NOT NULL,
        organization_id UUID NOT NULL,
        user_id UUID NOT NULL,
        amount NUMERIC(14,0) NOT NULL,
        frozen_delta NUMERIC(14,0) NOT NULL DEFAULT 0,
        balance_after NUMERIC(14,0) NOT NULL CHECK (balance_after>=0),
        frozen_after NUMERIC(14,0) NOT NULL CHECK (frozen_after>=0),
        tx_type VARCHAR(30) NOT NULL CHECK (tx_type IN ('SERVICE_EARNED','MILESTONE_EARNED','ENGAGEMENT_EARNED','FROZEN_RELEASED','REDEEMED','RETIRED','RESTORED')),
        event_key VARCHAR(180) NOT NULL,
        policy_id UUID REFERENCES loyalty_policies(id) ON DELETE RESTRICT,
        assignment_id UUID REFERENCES volunteer_assignments(id) ON DELETE RESTRICT,
        closure_id UUID REFERENCES account_closures(id) ON DELETE RESTRICT,
        redemption_id UUID REFERENCES loyalty_redemptions(id) ON DELETE RESTRICT,
        details JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        FOREIGN KEY (wallet_id,organization_id,user_id) REFERENCES loyalty_wallets(id,organization_id,user_id) ON DELETE RESTRICT,
        UNIQUE (wallet_id,event_key),
        CHECK (amount<>0 OR frozen_delta<>0 OR tx_type='MILESTONE_EARNED')
      );
      CREATE INDEX idx_loyalty_ledger_wallet ON loyalty_ledger(wallet_id,created_at DESC,id);
      CREATE INDEX idx_loyalty_wallet_user ON loyalty_wallets(user_id,organization_id);
      CREATE INDEX idx_loyalty_awards_user ON loyalty_service_awards(user_id,organization_id);
      CREATE INDEX idx_loyalty_redemptions_merchant ON loyalty_redemptions(merchant_id,created_at DESC);
      CREATE FUNCTION reject_loyalty_history_change() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'loyalty history is append-only'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_loyalty_ledger_append_only BEFORE UPDATE OR DELETE ON loyalty_ledger
        FOR EACH ROW EXECUTE FUNCTION reject_loyalty_history_change();
      CREATE TRIGGER trg_loyalty_policy_append_only BEFORE UPDATE OR DELETE ON loyalty_policies
        FOR EACH ROW EXECUTE FUNCTION reject_loyalty_history_change();
      CREATE TRIGGER trg_loyalty_awards_append_only BEFORE UPDATE OR DELETE ON loyalty_service_awards
        FOR EACH ROW EXECUTE FUNCTION reject_loyalty_history_change();
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM loyalty_ledger) OR EXISTS(SELECT 1 FROM loyalty_policies)
          OR EXISTS(SELECT 1 FROM organization_merchants) OR EXISTS(SELECT 1 FROM loyalty_campaigns)
          OR EXISTS(SELECT 1 FROM loyalty_engagement_awards) OR EXISTS(SELECT 1 FROM loyalty_service_awards)
        THEN RAISE EXCEPTION 'M6 has records; restore a backup rather than discard loyalty history'; END IF;
      END; $$;
      DROP TABLE loyalty_ledger,loyalty_redemptions,merchant_offers,organization_merchants,
        loyalty_engagement_awards,loyalty_campaigns,loyalty_service_awards,loyalty_wallets,
        loyalty_programs,loyalty_policies;
      DROP FUNCTION reject_loyalty_history_change();
    `);
  }
}
