import { MigrationInterface, QueryRunner } from 'typeorm';

/** Unique membership numbers from an atomic counter, and refresh token rotation. */
export class SecurityReviewFixes1729118400012 implements MigrationInterface {
  name = 'SecurityReviewFixes1729118400012';

  async up(q: QueryRunner): Promise<void> {
    // Renumbering would change what members already hold, so a person must resolve this.
    await q.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM organization_memberships
          WHERE membership_number IS NOT NULL
          GROUP BY organization_id, membership_number
          HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'Duplicate membership numbers exist. Resolve them, then migrate again.';
        END IF;
      END $$
    `);
    await q.query(
      `ALTER TABLE organizations ADD COLUMN membership_sequence INT NOT NULL DEFAULT 0`,
    );
    await q.query(`
      UPDATE organizations o
      SET membership_sequence = COALESCE((
        SELECT MAX(substring(m.membership_number from '[0-9]+$')::int)
        FROM organization_memberships m
        WHERE m.organization_id = o.id
      ), 0)
    `);
    await q.query(`
      CREATE UNIQUE INDEX uq_membership_number
      ON organization_memberships (organization_id, membership_number)
      WHERE membership_number IS NOT NULL
    `);
    await q.query(
      `ALTER TABLE authentication_sessions ADD COLUMN previous_refresh_token_hash VARCHAR(128)`,
    );
    await q.query(`ALTER TABLE authentication_sessions ADD COLUMN rotated_at TIMESTAMPTZ`);
    await q.query(`
      CREATE INDEX idx_auth_sessions_previous_token
      ON authentication_sessions (previous_refresh_token_hash)
      WHERE previous_refresh_token_hash IS NOT NULL
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX idx_auth_sessions_previous_token`);
    await q.query(`ALTER TABLE authentication_sessions DROP COLUMN rotated_at`);
    await q.query(`ALTER TABLE authentication_sessions DROP COLUMN previous_refresh_token_hash`);
    await q.query(`DROP INDEX uq_membership_number`);
    await q.query(`ALTER TABLE organizations DROP COLUMN membership_sequence`);
  }
}
