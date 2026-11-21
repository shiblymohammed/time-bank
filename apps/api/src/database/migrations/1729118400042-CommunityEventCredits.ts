import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Community events can pay time credits for confirmed attendance.
 *
 * - An organiser chooses, when publishing, whether an event earns credits.
 * - After the event ends, staff confirm each signed-up member's attended minutes.
 * - Each confirmation posts one EVENT_EARNED ledger entry. A partial unique index
 *   pays each wallet at most once per event, and the ledger stays append-only.
 */
export class CommunityEventCredits1729118400042 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE community_events
        ADD COLUMN earns_credits boolean NOT NULL DEFAULT false;

      ALTER TABLE community_event_attendance
        ADD COLUMN attended_minutes integer,
        ADD COLUMN confirmed_at timestamptz,
        ADD COLUMN confirmed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
        ADD CONSTRAINT chk_event_attendance_confirmation CHECK (
          (confirmed_at IS NULL AND attended_minutes IS NULL AND confirmed_by IS NULL)
          OR (confirmed_at IS NOT NULL AND confirmed_by IS NOT NULL
            AND attended_minutes BETWEEN 1 AND 1440)
        );

      ALTER TABLE time_credit_ledger
        ADD COLUMN community_event_id uuid REFERENCES community_events(id) ON DELETE RESTRICT;

      CREATE UNIQUE INDEX uq_ledger_event_earning
        ON time_credit_ledger(community_event_id, wallet_id)
        WHERE tx_type = 'EVENT_EARNED';

      ALTER TABLE time_credit_ledger DROP CONSTRAINT chk_ledger_sign,
        ADD CONSTRAINT chk_ledger_sign CHECK (
          (tx_type IN ('DONATION_SENT','ASSISTANCE_SPENT','FRAUD_HELD','CREDIT_CORRECTED','ESTATE_SENT','REQUEST_RESERVED','REQUEST_CREDITS_SPENT') AND amount < 0) OR
          (tx_type IN ('SERVICE_EARNED','EVENT_EARNED','DONATION_RECEIVED','FRAUD_RELEASED','FROZEN_RELEASED','ESTATE_RECEIVED','REQUEST_RESERVE_APPLIED','REQUEST_RESERVE_RELEASED') AND amount > 0)
        ),
        ADD CONSTRAINT chk_ledger_event_earning CHECK (
          (tx_type <> 'EVENT_EARNED' AND community_event_id IS NULL)
          OR (tx_type = 'EVENT_EARNED' AND community_event_id IS NOT NULL AND wallet_id IS NOT NULL
            AND amount > 0 AND minutes > 0 AND service_request_id IS NULL
            AND volunteer_assignment_id IS NULL AND instant_help_session_id IS NULL)
        );
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    const [row] = await q.query(
      "SELECT count(*) AS count FROM time_credit_ledger WHERE tx_type='EVENT_EARNED'",
    );
    if (Number(row.count))
      throw new Error('Event earnings exist; roll forward to preserve the credit ledger.');
    await q.query(`
      ALTER TABLE time_credit_ledger DROP CONSTRAINT chk_ledger_event_earning,
        DROP CONSTRAINT chk_ledger_sign,
        ADD CONSTRAINT chk_ledger_sign CHECK (
          (tx_type IN ('DONATION_SENT','ASSISTANCE_SPENT','FRAUD_HELD','CREDIT_CORRECTED','ESTATE_SENT','REQUEST_RESERVED','REQUEST_CREDITS_SPENT') AND amount < 0) OR
          (tx_type IN ('SERVICE_EARNED','DONATION_RECEIVED','FRAUD_RELEASED','FROZEN_RELEASED','ESTATE_RECEIVED','REQUEST_RESERVE_APPLIED','REQUEST_RESERVE_RELEASED') AND amount > 0)
        );
      DROP INDEX uq_ledger_event_earning;
      ALTER TABLE time_credit_ledger DROP COLUMN community_event_id;
      ALTER TABLE community_event_attendance DROP CONSTRAINT chk_event_attendance_confirmation,
        DROP COLUMN confirmed_by, DROP COLUMN confirmed_at, DROP COLUMN attended_minutes;
      ALTER TABLE community_events DROP COLUMN earns_credits;
    `);
  }
}
