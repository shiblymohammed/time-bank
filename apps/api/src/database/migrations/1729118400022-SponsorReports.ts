import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Saved sponsor reports (FR-REPORT-03, D#54, D#57).
 *
 * Sponsors receive the figures as they stood when saved. Each save is a new version, and a trigger
 * refuses any change afterwards, so a report already sent can always be produced again unchanged.
 * Only counts live here, with small ones already hidden.
 */
export class SponsorReports1729118400022 implements MigrationInterface {
  name = 'SponsorReports1729118400022';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE sponsor_reports (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        period_month CHAR(7) NOT NULL CHECK (period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
        version INTEGER NOT NULL CHECK (version > 0),
        figures JSONB NOT NULL,
        source VARCHAR(16) NOT NULL CHECK (source IN ('MONTHLY_JOB', 'STAFF')),
        generated_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_sponsor_reports_version UNIQUE (organization_id, period_month, version),
        CONSTRAINT chk_sponsor_reports_author CHECK ((source = 'STAFF') = (generated_by_user_id IS NOT NULL))
      );
    `);
    await q.query(`
      CREATE FUNCTION reject_sponsor_report_change() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'sponsor_reports is append-only';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await q.query(`
      CREATE TRIGGER trg_sponsor_reports_append_only
        BEFORE UPDATE OR DELETE ON sponsor_reports
        FOR EACH ROW EXECUTE FUNCTION reject_sponsor_report_change();
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER trg_sponsor_reports_append_only ON sponsor_reports;`);
    await q.query(`DROP FUNCTION reject_sponsor_report_change();`);
    await q.query(`DROP TABLE sponsor_reports;`);
  }
}
