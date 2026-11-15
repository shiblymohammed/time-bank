import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunityReportDecisions1729118400031 implements MigrationInterface {
  name = 'CommunityReportDecisions1729118400031';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE community_post_reports ADD COLUMN decision_note varchar(500);
      CREATE INDEX idx_community_reports_open ON community_post_reports(post_id, created_at, id)
        WHERE status = 'OPEN';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX idx_community_reports_open;
      ALTER TABLE community_post_reports DROP COLUMN decision_note;
    `);
  }
}
