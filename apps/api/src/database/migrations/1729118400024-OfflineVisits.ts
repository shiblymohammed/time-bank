import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Offline visits (FR-OFF-01 to FR-OFF-03, NFR-11). A phone can save start, finish and leave while
 * it has no signal and send them later with the time they were tapped.
 *
 * visit_operations remembers each phone-chosen operation ID, so a retry is never done twice and a
 * reused ID with different details is refused. The *_received_at columns are set only when an
 * action reached the server late, so staff can see it was recorded offline.
 */
export class OfflineVisits1729118400024 implements MigrationInterface {
  name = 'OfflineVisits1729118400024';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE visit_operations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        volunteer_membership_id UUID NOT NULL
          REFERENCES organization_memberships(id) ON DELETE RESTRICT,
        client_operation_id VARCHAR(100) NOT NULL,
        action VARCHAR(10) NOT NULL CHECK (action IN ('START', 'FINISH', 'LEAVE')),
        assignment_id UUID NOT NULL REFERENCES volunteer_assignments(id) ON DELETE CASCADE,
        fingerprint CHAR(64) NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL,
        received_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (volunteer_membership_id, client_operation_id)
      );
    `);
    await q.query(
      `CREATE INDEX idx_visit_operations_assignment ON visit_operations (assignment_id);`,
    );
    await q.query(`
      ALTER TABLE volunteer_assignments
        ADD COLUMN start_received_at TIMESTAMPTZ,
        ADD COLUMN finish_received_at TIMESTAMPTZ;
    `);
    await q.query(`ALTER TABLE safety_alerts ADD COLUMN raised_on_phone_at TIMESTAMPTZ;`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE safety_alerts DROP COLUMN raised_on_phone_at;`);
    await q.query(`
      ALTER TABLE volunteer_assignments
        DROP COLUMN finish_received_at,
        DROP COLUMN start_received_at;
    `);
    await q.query(`DROP TABLE visit_operations;`);
  }
}
