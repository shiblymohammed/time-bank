import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunityMemberSubmissions1729118400032 implements MigrationInterface {
  name = 'CommunityMemberSubmissions1729118400032';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE community_posts ADD COLUMN submission_key varchar(80);
      CREATE UNIQUE INDEX idx_community_submission_key
        ON community_posts (author_membership_id, submission_key);
      CREATE INDEX idx_community_author_posts
        ON community_posts (organization_id, author_membership_id, created_at DESC, id DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX idx_community_author_posts;
      DROP INDEX idx_community_submission_key;
      ALTER TABLE community_posts DROP COLUMN submission_key;
    `);
  }
}
