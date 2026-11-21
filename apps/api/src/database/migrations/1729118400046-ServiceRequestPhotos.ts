import { MigrationInterface, QueryRunner } from 'typeorm';

/** Optional request images are normalized JPEGs; original metadata is discarded. */
export class ServiceRequestPhotos1729118400046 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE service_request_photos (
      request_id uuid PRIMARY KEY REFERENCES service_requests(id) ON DELETE CASCADE,
      jpeg bytea NOT NULL CHECK (octet_length(jpeg) BETWEEN 1 AND 5242880),
      sha256 char(64) NOT NULL,
      version uuid NOT NULL DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE service_request_photos');
  }
}
