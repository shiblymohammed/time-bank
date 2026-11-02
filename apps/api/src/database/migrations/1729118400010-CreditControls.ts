import { MigrationInterface, QueryRunner } from 'typeorm';

/** M4: independently reviewed corrections and voluntary assistance funding. */
export class CreditControls1729118400010 implements MigrationInterface {
  name = 'CreditControls1729118400010';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE credit_reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        source_entry_id UUID NOT NULL REFERENCES time_credit_ledger(id) ON DELETE RESTRICT,
        wallet_id UUID REFERENCES universal_time_wallets(id) ON DELETE RESTRICT,
        pool_id UUID REFERENCES community_credit_pools(id) ON DELETE RESTRICT,
        amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
        held_amount NUMERIC(10,2) NOT NULL CHECK (held_amount >= 0 AND held_amount <= amount),
        from_frozen BOOLEAN NOT NULL DEFAULT false,
        pre_frozen_amount NUMERIC(10,2) NOT NULL DEFAULT 0
          CHECK (pre_frozen_amount >= 0 AND pre_frozen_amount <= held_amount),
        parent_review_id UUID REFERENCES credit_reviews(id) ON DELETE RESTRICT,
        reason VARCHAR(1000) NOT NULL,
        opened_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        investigation VARCHAR(2000),
        investigated_by UUID REFERENCES users(id) ON DELETE RESTRICT,
        decision VARCHAR(20) CHECK (decision IN ('RELEASE','CORRECT')),
        resolution VARCHAR(2000),
        resolved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
        idempotency_key VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        CONSTRAINT uq_credit_review_key UNIQUE (opened_by, idempotency_key),
        CONSTRAINT chk_review_account CHECK ((wallet_id IS NULL) <> (pool_id IS NULL)),
        CONSTRAINT chk_review_investigator CHECK ((investigation IS NULL) = (investigated_by IS NULL)),
        CONSTRAINT chk_review_resolution CHECK (
          (decision IS NULL AND resolved_at IS NULL AND resolved_by IS NULL AND resolution IS NULL) OR
          (decision IS NOT NULL AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL
           AND resolution IS NOT NULL AND investigated_by IS NOT NULL
           AND resolved_by <> investigated_by AND resolved_by <> opened_by)
        )
      );
      CREATE INDEX idx_credit_review_account ON credit_reviews(wallet_id, pool_id) WHERE resolved_at IS NULL;
      CREATE INDEX idx_credit_review_parent ON credit_reviews(parent_review_id);
      ALTER TABLE community_credit_pools ADD COLUMN frozen_credits NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (frozen_credits >= 0);

      CREATE TABLE credit_operations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        kind VARCHAR(30) NOT NULL CHECK (kind IN ('ASSISTANCE_SPENT','FROZEN_RELEASED')),
        wallet_id UUID REFERENCES universal_time_wallets(id) ON DELETE RESTRICT,
        pool_id UUID REFERENCES community_credit_pools(id) ON DELETE RESTRICT,
        service_request_id UUID REFERENCES service_requests(id) ON DELETE RESTRICT,
        amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
        idempotency_key VARCHAR(100) NOT NULL,
        reason VARCHAR(1000) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_credit_operation_key UNIQUE(actor_id, idempotency_key),
        CONSTRAINT chk_operation_account CHECK ((wallet_id IS NULL) <> (pool_id IS NULL)),
        CONSTRAINT chk_operation_request CHECK ((kind = 'ASSISTANCE_SPENT') = (service_request_id IS NOT NULL))
      );
      CREATE FUNCTION reject_credit_operation_change() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'credit_operations is append-only';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_credit_operations_append_only BEFORE UPDATE OR DELETE ON credit_operations
        FOR EACH ROW EXECUTE FUNCTION reject_credit_operation_change();
      CREATE UNIQUE INDEX uq_assistance_funding ON credit_operations(service_request_id)
        WHERE kind = 'ASSISTANCE_SPENT';
      CREATE UNIQUE INDEX uq_wallet_control_key ON audit_events(actor_id,target_id,(payload->>'idempotencyKey'))
        WHERE event_type='TIME_WALLET_STATUS_CHANGED';

      ALTER TABLE time_credit_ledger
        DROP CONSTRAINT chk_ledger_sign,
        ADD COLUMN frozen_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN review_id UUID REFERENCES credit_reviews(id) ON DELETE RESTRICT,
        ADD COLUMN operation_id UUID REFERENCES credit_operations(id) ON DELETE RESTRICT,
        ADD CONSTRAINT uq_ledger_review_leg UNIQUE(review_id, tx_type),
        ADD CONSTRAINT uq_ledger_operation UNIQUE(operation_id),
        ADD CONSTRAINT chk_ledger_sign CHECK (
          (tx_type IN ('DONATION_SENT','ASSISTANCE_SPENT','FRAUD_HELD','CREDIT_CORRECTED') AND amount < 0) OR
          (tx_type IN ('SERVICE_EARNED','DONATION_RECEIVED','FRAUD_RELEASED','FROZEN_RELEASED') AND amount > 0)
        ),
        ADD CONSTRAINT chk_ledger_control_reference CHECK (
          (tx_type NOT IN ('FRAUD_HELD','FRAUD_RELEASED','CREDIT_CORRECTED') OR review_id IS NOT NULL) AND
          (tx_type NOT IN ('ASSISTANCE_SPENT','FROZEN_RELEASED') OR operation_id IS NOT NULL)
        ),
        ADD CONSTRAINT chk_ledger_control_movement CHECK (
          (tx_type NOT IN ('FRAUD_HELD','FRAUD_RELEASED','FROZEN_RELEASED') OR (NOT held AND frozen_delta=-amount)) AND
          (tx_type <> 'CREDIT_CORRECTED' OR (held AND frozen_delta=amount)) AND
          (tx_type <> 'ASSISTANCE_SPENT' OR (NOT held AND frozen_delta=0))
        );
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    // Never drop financial history to make an old binary fit.
    await q.query(`DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM credit_reviews) OR EXISTS(SELECT 1 FROM credit_operations) THEN
        RAISE EXCEPTION 'Credit controls rollback requires empty review and operation tables';
      END IF;
    END $$;
    DROP INDEX uq_wallet_control_key;
    ALTER TABLE time_credit_ledger
      DROP CONSTRAINT chk_ledger_control_movement,
      DROP CONSTRAINT chk_ledger_control_reference,
      DROP CONSTRAINT chk_ledger_sign,
      DROP CONSTRAINT uq_ledger_review_leg,
      DROP CONSTRAINT uq_ledger_operation,
      DROP COLUMN frozen_delta, DROP COLUMN review_id, DROP COLUMN operation_id,
      ADD CONSTRAINT chk_ledger_sign CHECK ((tx_type = 'DONATION_SENT') = (amount < 0));
    ALTER TABLE community_credit_pools DROP COLUMN frozen_credits;
    DROP TABLE credit_operations;
    DROP FUNCTION reject_credit_operation_change();
    DROP TABLE credit_reviews;`);
  }
}
