import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Visits left running (FR-SVC). A volunteer who forgets to tap Finish, or whose phone dies, leaves
 * a visit in progress with nobody told. long_visit_reminded_at records the one reminder sent to
 * the volunteer; long_visit_alerted_at records the one alert to coordinators, which also puts the
 * visit on their review list until it is finished or decided.
 */
export class LongVisits1729118400026 implements MigrationInterface {
  name = 'LongVisits1729118400026';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE volunteer_assignments
        ADD COLUMN long_visit_reminded_at TIMESTAMPTZ NULL,
        ADD COLUMN long_visit_alerted_at TIMESTAMPTZ NULL;
    `);
    // The check runs every 30 seconds over visits in progress only.
    await q.query(`
      CREATE INDEX idx_volunteer_assignments_in_progress
        ON volunteer_assignments (started_at) WHERE status = 'IN_PROGRESS';
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_volunteer_assignments_in_progress;`);
    await q.query(`
      ALTER TABLE volunteer_assignments
        DROP COLUMN IF EXISTS long_visit_alerted_at,
        DROP COLUMN IF EXISTS long_visit_reminded_at;
    `);
  }
}
