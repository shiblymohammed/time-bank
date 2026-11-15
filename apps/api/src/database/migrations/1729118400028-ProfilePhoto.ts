import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProfilePhoto1729118400028 implements MigrationInterface {
  name = 'ProfilePhoto1729118400028';

  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE users ADD COLUMN profile_photo_id UUID');
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE users DROP COLUMN profile_photo_id');
  }
}
