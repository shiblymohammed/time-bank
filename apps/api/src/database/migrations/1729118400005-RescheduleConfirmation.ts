import { MigrationInterface, QueryRunner } from 'typeorm';

export class RescheduleConfirmation1729118400005 implements MigrationInterface {
  name = 'RescheduleConfirmation1729118400005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE request_cancellations ALTER COLUMN hours_before_start TYPE NUMERIC(10,2);
      ALTER TABLE service_requests ADD COLUMN latest_reschedule_id UUID;
      ALTER TABLE service_requests ADD CONSTRAINT fk_request_latest_reschedule
        FOREIGN KEY (latest_reschedule_id) REFERENCES request_reschedules(id) ON DELETE SET NULL;
      ALTER TABLE volunteer_assignments ADD COLUMN reschedule_id UUID;
      ALTER TABLE volunteer_assignments ADD CONSTRAINT fk_assignment_reschedule
        FOREIGN KEY (reschedule_id) REFERENCES request_reschedules(id) ON DELETE SET NULL;
      CREATE INDEX idx_assignment_reschedule ON volunteer_assignments(reschedule_id)
        WHERE reschedule_id IS NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE request_cancellations ALTER COLUMN hours_before_start TYPE NUMERIC(5,2);
      DROP INDEX idx_assignment_reschedule;
      ALTER TABLE volunteer_assignments DROP CONSTRAINT fk_assignment_reschedule;
      ALTER TABLE volunteer_assignments DROP COLUMN reschedule_id;
      ALTER TABLE service_requests DROP CONSTRAINT fk_request_latest_reschedule;
      ALTER TABLE service_requests DROP COLUMN latest_reschedule_id;
    `);
  }
}
