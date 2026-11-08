import { MigrationInterface, QueryRunner } from 'typeorm';

/** Staff email addresses, and the emailed code a staff sign-in must pass before staff powers. */
export class StaffEmailCode1729118400014 implements MigrationInterface {
  name = 'StaffEmailCode1729118400014';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE users ADD COLUMN email VARCHAR(254);
      CREATE UNIQUE INDEX uq_users_email ON users (lower(email)) WHERE email IS NOT NULL;
      ALTER TABLE authentication_sessions
        ADD COLUMN staff_verified_at TIMESTAMPTZ,
        ADD COLUMN staff_code_hash VARCHAR(128),
        ADD COLUMN staff_code_expires_at TIMESTAMPTZ,
        ADD COLUMN staff_code_sent_at TIMESTAMPTZ,
        ADD COLUMN staff_code_attempts INT NOT NULL DEFAULT 0;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE authentication_sessions
        DROP COLUMN staff_code_attempts,
        DROP COLUMN staff_code_sent_at,
        DROP COLUMN staff_code_expires_at,
        DROP COLUMN staff_code_hash,
        DROP COLUMN staff_verified_at;
      DROP INDEX IF EXISTS uq_users_email;
      ALTER TABLE users DROP COLUMN email;
    `);
  }
}
