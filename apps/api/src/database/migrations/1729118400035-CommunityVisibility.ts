import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunityVisibility1729118400035 implements MigrationInterface {
  name = 'CommunityVisibility1729118400035';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE community_visibility (
      organization_id uuid NOT NULL,
      membership_id uuid NOT NULL,
      display_name varchar(60),
      shared_photo_id uuid,
      PRIMARY KEY (organization_id, membership_id),
      FOREIGN KEY (organization_id, membership_id) REFERENCES organization_memberships(organization_id,id) ON DELETE CASCADE,
      CHECK (display_name IS NULL OR length(trim(display_name)) > 0)
    )`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE community_visibility');
  }
}
