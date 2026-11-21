import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunityPostEvents1729118400039 implements MigrationInterface {
  name = 'CommunityPostEvents1729118400039';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE community_posts ADD COLUMN event_id uuid,
        ADD CONSTRAINT fk_community_post_event_org FOREIGN KEY (organization_id,event_id)
          REFERENCES community_events(organization_id,id);
      CREATE INDEX idx_community_post_event ON community_posts(organization_id,event_id)
        WHERE event_id IS NOT NULL;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX idx_community_post_event;
      ALTER TABLE community_posts DROP CONSTRAINT fk_community_post_event_org, DROP COLUMN event_id;
    `);
  }
}
