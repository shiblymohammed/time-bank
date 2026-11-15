import { MigrationInterface, QueryRunner } from 'typeorm';

export class Nearby1729118400029 implements MigrationInterface {
  name = 'Nearby1729118400029';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE operational_zones ADD COLUMN nearby_visible BOOLEAN NOT NULL DEFAULT false`,
    );
    await q.query(
      `ALTER TABLE operational_zones ADD CONSTRAINT uq_nearby_zone_org UNIQUE (organization_id,id)`,
    );
    await q.query(
      `ALTER TABLE organization_memberships ADD CONSTRAINT uq_nearby_member_org UNIQUE (organization_id,id)`,
    );
    await q.query(`CREATE TABLE nearby_availability (
      organization_id UUID NOT NULL,
      membership_id UUID PRIMARY KEY,
      area_id UUID NOT NULL,
      session_id UUID NOT NULL REFERENCES authentication_sessions(id) ON DELETE CASCADE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      FOREIGN KEY (organization_id,membership_id) REFERENCES organization_memberships(organization_id,id) ON DELETE CASCADE,
      FOREIGN KEY (organization_id,area_id) REFERENCES operational_zones(organization_id,id) ON DELETE CASCADE,
      CHECK (expires_at > updated_at AND expires_at <= updated_at + interval '2 hours')
    )`);
    await q.query(
      `CREATE INDEX idx_nearby_active ON nearby_availability(organization_id,area_id,expires_at)`,
    );
    await q.query(`CREATE INDEX idx_nearby_requests ON service_requests(organization_id,scheduled_start_time,location_ward_number)
      WHERE status IN ('MATCHING_ACTIVE','PARTIALLY_ACCEPTED','ESCALATED_TO_COORDINATOR')`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_nearby_requests`);
    await q.query(`DROP TABLE nearby_availability`);
    await q.query(`ALTER TABLE organization_memberships DROP CONSTRAINT uq_nearby_member_org`);
    await q.query(
      `ALTER TABLE operational_zones DROP CONSTRAINT uq_nearby_zone_org, DROP COLUMN nearby_visible`,
    );
  }
}
