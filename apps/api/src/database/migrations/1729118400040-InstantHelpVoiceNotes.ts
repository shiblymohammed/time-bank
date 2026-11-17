import { MigrationInterface, QueryRunner } from 'typeorm';

export class InstantHelpVoiceNotes1729118400040 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE instant_help_voice_notes (
        session_id uuid PRIMARY KEY REFERENCES instant_help_sessions(id),
        audio bytea NOT NULL CHECK (octet_length(audio) BETWEEN 46 AND 1440044),
        duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 1 AND 45000)
      );
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE instant_help_voice_notes');
  }
}
