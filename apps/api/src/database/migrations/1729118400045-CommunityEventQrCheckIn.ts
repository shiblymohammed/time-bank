import { MigrationInterface, QueryRunner } from 'typeorm';
/**
 * QR check-in for community events.
 *
 * Every event gets a secret check-in code. Staff show it as a QR code at the venue, and a
 * member proves they are there by scanning it (the server still checks their location).
 * The code is never part of a member-facing event response.
 *
 * Existing events receive a code too, so a running event keeps working after this migration.
 * New events get one from the column default, so publishing code does not need to change.
 */
export class CommunityEventQrCheckIn1729118400045 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE community_events ADD COLUMN checkin_token text;
      UPDATE community_events
        SET checkin_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
      ALTER TABLE community_events
        ALTER COLUMN checkin_token
          SET DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
        ALTER COLUMN checkin_token SET NOT NULL,
        ADD CONSTRAINT chk_event_checkin_token CHECK (checkin_token ~ '^[0-9a-f]{64}$');
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE community_events
        DROP CONSTRAINT chk_event_checkin_token,
        DROP COLUMN checkin_token;
    `);
  }
}
