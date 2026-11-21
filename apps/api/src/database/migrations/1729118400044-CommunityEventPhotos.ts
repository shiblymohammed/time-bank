import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * An optional cover image for a community event, chosen by staff when they publish it.
 *
 * The bytes are the server's own re-encoded JPEG (never the original upload), kept in a table
 * of their own so event lists never load them. The image cannot change after publishing, so
 * `version` is a fixed cache key for clients, and `sha256` lets a retried publish be recognised.
 */
export class CommunityEventPhotos1729118400044 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE community_event_photos (
        event_id uuid PRIMARY KEY REFERENCES community_events(id) ON DELETE CASCADE,
        jpeg bytea NOT NULL CHECK (octet_length(jpeg) BETWEEN 1 AND 5242880),
        sha256 char(64) NOT NULL,
        version uuid NOT NULL DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE community_event_photos');
  }
}
