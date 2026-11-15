import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunityPostEditingAndPhotos1729118400034 implements MigrationInterface {
  name = 'CommunityPostEditingAndPhotos1729118400034';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE community_posts ADD COLUMN content_version integer NOT NULL DEFAULT 1,
        ADD COLUMN last_edit_key varchar(80), ADD COLUMN last_edit_fingerprint varchar(64);
      CREATE TABLE community_post_photos (
        post_id uuid PRIMARY KEY REFERENCES community_posts(id) ON DELETE CASCADE,
        jpeg bytea NOT NULL CHECK (octet_length(jpeg) BETWEEN 1 AND 5242880)
      );
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE community_post_photos;
      ALTER TABLE community_posts DROP COLUMN content_version, DROP COLUMN last_edit_key,
        DROP COLUMN last_edit_fingerprint;
    `);
  }
}
