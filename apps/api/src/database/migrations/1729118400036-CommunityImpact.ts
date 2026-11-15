import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunityImpact1729118400036 implements MigrationInterface {
  name = 'CommunityImpact1729118400036';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE community_impact_goals (
        organization_id uuid NOT NULL REFERENCES organizations(id),
        month date NOT NULL CHECK (extract(day FROM month)=1),
        target_hours integer NOT NULL CHECK (target_hours BETWEEN 1 AND 1000000),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (organization_id, month)
      );
      CREATE INDEX idx_community_impact_confirmed ON volunteer_assignments(organization_id, confirmed_at, service_request_id)
        WHERE status='COMPLETED' AND confirmed_at IS NOT NULL AND confirmed_minutes>0;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX idx_community_impact_confirmed; DROP TABLE community_impact_goals;');
  }
}
