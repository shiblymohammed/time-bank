import { MigrationInterface, QueryRunner } from 'typeorm';

export class InstantHelp1729118400038 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE instant_help_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        user_id uuid NOT NULL REFERENCES users(id),
        membership_id uuid NOT NULL REFERENCES organization_memberships(id),
        start_key varchar(100) NOT NULL,
        start_fingerprint varchar(64) NOT NULL,
        description varchar(500) NOT NULL,
        location_label varchar(300) NOT NULL,
        location_lat double precision,
        location_lng double precision,
        status varchar(20) NOT NULL DEFAULT 'RUNNING' CHECK(status IN ('RUNNING','PENDING','NEEDS_INFO','APPROVED','REJECTED')),
        started_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz,
        reported_minutes integer,
        completion_notes varchar(2000),
        approved_minutes integer,
        review_notes varchar(2000),
        reviewed_by uuid REFERENCES users(id),
        reviewed_at timestamptz,
        version integer NOT NULL DEFAULT 1,
        UNIQUE(user_id,start_key),
        CHECK ((location_lat IS NULL AND location_lng IS NULL) OR (location_lat IS NOT NULL AND location_lng IS NOT NULL AND location_lat BETWEEN -90 AND 90 AND location_lng BETWEEN -180 AND 180)),
        CHECK (status = 'RUNNING' OR (finished_at IS NOT NULL AND reported_minutes >= 1)),
        CHECK (status <> 'APPROVED' OR (approved_minutes BETWEEN 1 AND 720 AND approved_minutes <= reported_minutes AND reviewed_by IS NOT NULL)),
        CHECK (finished_at IS NULL OR finished_at >= started_at)
      );
      CREATE UNIQUE INDEX uq_instant_help_running_user ON instant_help_sessions(user_id) WHERE status='RUNNING';
      CREATE INDEX idx_instant_help_review ON instant_help_sessions(organization_id,status,started_at DESC);
      CREATE TABLE instant_help_photos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES instant_help_sessions(id),
        photo bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE time_credit_ledger ADD COLUMN instant_help_session_id uuid REFERENCES instant_help_sessions(id);
      CREATE UNIQUE INDEX uq_instant_help_earning ON time_credit_ledger(instant_help_session_id) WHERE tx_type='SERVICE_EARNED';
      ALTER TABLE time_credit_ledger DROP CONSTRAINT chk_ledger_service_earning;
      ALTER TABLE time_credit_ledger ADD CONSTRAINT chk_ledger_service_earning CHECK (
        tx_type <> 'SERVICE_EARNED' OR (amount > 0 AND minutes > 0 AND ((volunteer_assignment_id IS NOT NULL AND service_request_id IS NOT NULL AND instant_help_session_id IS NULL) OR (instant_help_session_id IS NOT NULL AND volunteer_assignment_id IS NULL AND service_request_id IS NULL)))
      );
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS(SELECT 1 FROM time_credit_ledger WHERE instant_help_session_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Instant help has immutable ledger entries; retain this migration'; END IF; END $$;`);
    await q.query(`ALTER TABLE time_credit_ledger DROP CONSTRAINT chk_ledger_service_earning;
      ALTER TABLE time_credit_ledger ADD CONSTRAINT chk_ledger_service_earning CHECK(tx_type <> 'SERVICE_EARNED' OR (amount>0 AND minutes>0 AND volunteer_assignment_id IS NOT NULL AND service_request_id IS NOT NULL));
      DROP INDEX uq_instant_help_earning;
      ALTER TABLE time_credit_ledger DROP COLUMN instant_help_session_id;
      DROP TABLE instant_help_photos; DROP TABLE instant_help_sessions;`);
  }
}
