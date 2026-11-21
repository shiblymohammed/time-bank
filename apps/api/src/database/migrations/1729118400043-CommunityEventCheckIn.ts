import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Location check-in for credit-earning community events.
 *
 * - An event can carry a location and a check-in range in metres.
 * - During the event, a signed-up member checks in from their phone. The server
 *   records the reported position, its accuracy and its distance from the event.
 * - Staff may only confirm attendance for members who checked in. Rows confirmed
 *   before this migration are left as they are (NOT VALID).
 */
export class CommunityEventCheckIn1729118400043 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE community_events
        ADD COLUMN location_lat double precision,
        ADD COLUMN location_lng double precision,
        ADD COLUMN checkin_radius_m integer NOT NULL DEFAULT 200,
        ADD CONSTRAINT chk_event_location CHECK (
          (location_lat IS NULL AND location_lng IS NULL)
          OR (location_lat BETWEEN -90 AND 90 AND location_lng BETWEEN -180 AND 180)
        ),
        ADD CONSTRAINT chk_event_checkin_radius CHECK (checkin_radius_m BETWEEN 50 AND 1000);

      ALTER TABLE community_event_attendance
        ADD COLUMN checked_in_at timestamptz,
        ADD COLUMN checkin_lat double precision,
        ADD COLUMN checkin_lng double precision,
        ADD COLUMN checkin_accuracy_m integer,
        ADD COLUMN checkin_distance_m integer,
        ADD CONSTRAINT chk_event_checkin_record CHECK (
          (checked_in_at IS NULL AND checkin_lat IS NULL AND checkin_lng IS NULL
            AND checkin_accuracy_m IS NULL AND checkin_distance_m IS NULL)
          OR (checked_in_at IS NOT NULL AND checkin_lat BETWEEN -90 AND 90
            AND checkin_lng BETWEEN -180 AND 180 AND checkin_distance_m >= 0)
        );

      ALTER TABLE community_event_attendance
        ADD CONSTRAINT chk_event_confirmed_after_checkin
          CHECK (confirmed_at IS NULL OR checked_in_at IS NOT NULL) NOT VALID;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE community_event_attendance
        DROP CONSTRAINT chk_event_confirmed_after_checkin,
        DROP CONSTRAINT chk_event_checkin_record,
        DROP COLUMN checkin_distance_m, DROP COLUMN checkin_accuracy_m,
        DROP COLUMN checkin_lng, DROP COLUMN checkin_lat, DROP COLUMN checked_in_at;
      ALTER TABLE community_events
        DROP CONSTRAINT chk_event_checkin_radius, DROP CONSTRAINT chk_event_location,
        DROP COLUMN checkin_radius_m, DROP COLUMN location_lng, DROP COLUMN location_lat;
    `);
  }
}
