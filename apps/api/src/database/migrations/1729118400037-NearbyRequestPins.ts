import { MigrationInterface, QueryRunner } from 'typeorm';

export class NearbyRequestPins1729118400037 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE service_requests ADD COLUMN share_nearby_pin boolean NOT NULL DEFAULT false,
        ADD CONSTRAINT chk_nearby_pin_location CHECK (
          NOT share_nearby_pin OR (location_lat IS NOT NULL AND location_lng IS NOT NULL)
        );
      CREATE INDEX idx_service_requests_nearby_pins
        ON service_requests (organization_id, scheduled_start_time, id)
        WHERE share_nearby_pin;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX idx_service_requests_nearby_pins;
      ALTER TABLE service_requests DROP CONSTRAINT chk_nearby_pin_location,
        DROP COLUMN share_nearby_pin;
    `);
  }
}
