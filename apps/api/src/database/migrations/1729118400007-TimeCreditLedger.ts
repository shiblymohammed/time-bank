import { MigrationInterface, QueryRunner } from 'typeorm';

// Append-only ledger of universal time-credit movements (FR-TIME-04, ITB-009).
// A confirmed volunteer assignment can be paid only once.
export class TimeCreditLedger1729118400007 implements MigrationInterface {
  name = 'TimeCreditLedger1729118400007';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE time_credit_ledger (
        id                      UUID           NOT NULL DEFAULT gen_random_uuid(),
        wallet_id               UUID           NOT NULL,
        amount                  NUMERIC(10, 2) NOT NULL,
        balance_after           NUMERIC(10, 2) NOT NULL,
        held                    BOOLEAN        NOT NULL DEFAULT false,
        tx_type                 VARCHAR(30)    NOT NULL,
        originating_org_id      UUID           NOT NULL,
        service_request_id      UUID,
        volunteer_assignment_id UUID,
        minutes                 INT,
        reference               VARCHAR(255),
        created_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_time_credit_ledger PRIMARY KEY (id),
        CONSTRAINT fk_ledger_wallet FOREIGN KEY (wallet_id)
          REFERENCES universal_time_wallets(id) ON DELETE RESTRICT,
        CONSTRAINT fk_ledger_origin_org FOREIGN KEY (originating_org_id)
          REFERENCES organizations(id) ON DELETE RESTRICT,
        CONSTRAINT fk_ledger_request FOREIGN KEY (service_request_id)
          REFERENCES service_requests(id) ON DELETE RESTRICT,
        CONSTRAINT fk_ledger_assignment FOREIGN KEY (volunteer_assignment_id)
          REFERENCES volunteer_assignments(id) ON DELETE RESTRICT,
        CONSTRAINT uq_ledger_assignment_payment UNIQUE (volunteer_assignment_id, tx_type),
        CONSTRAINT chk_ledger_amount_nonzero CHECK (amount <> 0),
        CONSTRAINT chk_ledger_balance_nonnegative CHECK (balance_after >= 0),
        CONSTRAINT chk_ledger_service_earning CHECK (
          tx_type <> 'SERVICE_EARNED' OR (
            amount > 0 AND volunteer_assignment_id IS NOT NULL
            AND service_request_id IS NOT NULL AND minutes > 0
          )
        )
      );
      CREATE INDEX idx_ledger_wallet_created ON time_credit_ledger(wallet_id, created_at DESC);
      CREATE INDEX idx_ledger_origin_org ON time_credit_ledger(originating_org_id);

      CREATE FUNCTION reject_time_credit_ledger_change() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'time_credit_ledger is append-only';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_time_credit_ledger_append_only
        BEFORE UPDATE OR DELETE ON time_credit_ledger
        FOR EACH ROW EXECUTE FUNCTION reject_time_credit_ledger_change();

      ALTER TABLE universal_time_wallets
        ADD CONSTRAINT chk_wallet_balances_nonnegative
        CHECK (balance_credits >= 0 AND frozen_credits >= 0);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE universal_time_wallets DROP CONSTRAINT chk_wallet_balances_nonnegative;
      DROP TRIGGER trg_time_credit_ledger_append_only ON time_credit_ledger;
      DROP FUNCTION reject_time_credit_ledger_change();
      DROP TABLE time_credit_ledger;
    `);
  }
}
