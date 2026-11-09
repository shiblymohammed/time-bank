import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Team visits and handovers (FR-TEAM, D#31 to D#34, D#63 to D#69, BR-06, BR-07).
 *
 * arrived_at: a team member is on site and waiting. Timers start once enough have arrived.
 * below_minimum_at: fewer volunteers than the safe minimum are on site during a visit, or the
 * only one has handed over. It clears when enough are back, or a coordinator stops the search.
 */
export class TeamVisits1729118400018 implements MigrationInterface {
  name = 'TeamVisits1729118400018';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE volunteer_assignments
        ADD COLUMN arrived_at TIMESTAMPTZ,
        ADD COLUMN invited_by_membership_id UUID
          REFERENCES organization_memberships(id) ON DELETE SET NULL;
    `);
    await q.query(`
      ALTER TABLE service_requests
        ADD COLUMN below_minimum_at TIMESTAMPTZ,
        ADD COLUMN below_minimum_alerted_at TIMESTAMPTZ,
        ADD COLUMN replacement_escalated_at TIMESTAMPTZ;
    `);
    await q.query(`
      CREATE INDEX idx_requests_below_minimum ON service_requests(below_minimum_at)
        WHERE below_minimum_at IS NOT NULL;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX idx_requests_below_minimum;`);
    await q.query(`
      ALTER TABLE service_requests
        DROP COLUMN replacement_escalated_at,
        DROP COLUMN below_minimum_alerted_at,
        DROP COLUMN below_minimum_at;
    `);
    await q.query(`
      ALTER TABLE volunteer_assignments
        DROP COLUMN invited_by_membership_id,
        DROP COLUMN arrived_at;
    `);
  }
}
