import { MigrationInterface, QueryRunner } from 'typeorm';

export class VolunteerCreditRequests1729118400041 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE service_requests
        ADD COLUMN credit_payer_user_id uuid REFERENCES users(id),
        ADD COLUMN credit_limit numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN credit_remaining numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN credit_charged numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN credit_released numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN credit_uncovered numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN credit_policy jsonb,
        ADD CONSTRAINT chk_request_credit_reservation CHECK (
          credit_limit >= 0 AND credit_remaining >= 0 AND credit_charged >= 0
          AND credit_released >= 0 AND credit_uncovered >= 0
          AND credit_limit = credit_remaining + credit_charged + credit_released
          AND ((credit_payer_user_id IS NULL AND credit_limit = 0 AND credit_policy IS NULL)
            OR (credit_payer_user_id IS NOT NULL AND credit_limit > 0 AND credit_policy IS NOT NULL))
        );
      CREATE INDEX idx_request_credit_reservations ON service_requests(credit_payer_user_id)
        WHERE credit_remaining > 0;
      ALTER TABLE time_credit_ledger DROP CONSTRAINT chk_ledger_sign,
        ADD CONSTRAINT chk_ledger_sign CHECK (
          (tx_type IN ('DONATION_SENT','ASSISTANCE_SPENT','FRAUD_HELD','CREDIT_CORRECTED','ESTATE_SENT','REQUEST_RESERVED','REQUEST_CREDITS_SPENT') AND amount < 0) OR
          (tx_type IN ('SERVICE_EARNED','DONATION_RECEIVED','FRAUD_RELEASED','FROZEN_RELEASED','ESTATE_RECEIVED','REQUEST_RESERVE_APPLIED','REQUEST_RESERVE_RELEASED') AND amount > 0)
        ),
        ADD CONSTRAINT chk_ledger_request_credit_reference CHECK (
          tx_type NOT IN ('REQUEST_RESERVED','REQUEST_CREDITS_SPENT','REQUEST_RESERVE_APPLIED','REQUEST_RESERVE_RELEASED')
          OR (wallet_id IS NOT NULL AND service_request_id IS NOT NULL AND NOT held AND frozen_delta=0
            AND (tx_type NOT IN ('REQUEST_CREDITS_SPENT','REQUEST_RESERVE_APPLIED') OR volunteer_assignment_id IS NOT NULL))
        );
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    const [row] = await q.query(
      'SELECT count(*) AS count FROM service_requests WHERE credit_payer_user_id IS NOT NULL',
    );
    if (Number(row.count))
      throw new Error('Credit-backed requests exist; roll forward to preserve their accounting.');
    await q.query(`ALTER TABLE time_credit_ledger DROP CONSTRAINT chk_ledger_request_credit_reference,
      DROP CONSTRAINT chk_ledger_sign,
      ADD CONSTRAINT chk_ledger_sign CHECK (
        (tx_type IN ('DONATION_SENT','ASSISTANCE_SPENT','FRAUD_HELD','CREDIT_CORRECTED','ESTATE_SENT') AND amount < 0) OR
        (tx_type IN ('SERVICE_EARNED','DONATION_RECEIVED','FRAUD_RELEASED','FROZEN_RELEASED','ESTATE_RECEIVED') AND amount > 0)
      );
      ALTER TABLE service_requests
      DROP CONSTRAINT chk_request_credit_reservation,
      DROP COLUMN credit_payer_user_id, DROP COLUMN credit_limit, DROP COLUMN credit_remaining,
      DROP COLUMN credit_charged, DROP COLUMN credit_released, DROP COLUMN credit_uncovered,
      DROP COLUMN credit_policy`);
  }
}
