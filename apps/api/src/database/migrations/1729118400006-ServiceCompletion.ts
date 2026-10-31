import { MigrationInterface, QueryRunner } from 'typeorm';

// A volunteer starts and finishes an accepted assignment; someone other than the
// volunteer (the beneficiary, an authorized caregiver or staff) then confirms it.
export class ServiceCompletion1729118400006 implements MigrationInterface {
  name = 'ServiceCompletion1729118400006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE volunteer_assignments
        ADD COLUMN started_at TIMESTAMPTZ,
        ADD COLUMN finished_at TIMESTAMPTZ,
        ADD COLUMN reported_minutes INT,
        ADD COLUMN completion_notes TEXT,
        ADD COLUMN confirmed_at TIMESTAMPTZ,
        ADD COLUMN confirmed_by_user_id UUID,
        ADD COLUMN confirmed_minutes INT;
      ALTER TABLE volunteer_assignments ADD CONSTRAINT fk_assignment_confirmed_by
        FOREIGN KEY (confirmed_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE volunteer_assignments ADD CONSTRAINT chk_assignment_reported_minutes
        CHECK (reported_minutes IS NULL OR reported_minutes BETWEEN 1 AND 720);
      ALTER TABLE volunteer_assignments ADD CONSTRAINT chk_assignment_completion_order
        CHECK (
          (finished_at IS NULL OR (started_at IS NOT NULL AND finished_at >= started_at
            AND reported_minutes IS NOT NULL))
          AND (confirmed_at IS NULL OR (finished_at IS NOT NULL AND confirmed_minutes IS NOT NULL))
        );
      ALTER TABLE volunteer_assignments ADD CONSTRAINT chk_assignment_confirmed_minutes
        CHECK (confirmed_minutes IS NULL OR confirmed_minutes BETWEEN 1 AND reported_minutes);
      CREATE INDEX idx_assignment_awaiting_confirmation ON volunteer_assignments(service_request_id)
        WHERE finished_at IS NOT NULL AND confirmed_at IS NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX idx_assignment_awaiting_confirmation;
      ALTER TABLE volunteer_assignments
        DROP CONSTRAINT chk_assignment_confirmed_minutes,
        DROP CONSTRAINT chk_assignment_completion_order,
        DROP CONSTRAINT chk_assignment_reported_minutes,
        DROP CONSTRAINT fk_assignment_confirmed_by,
        DROP COLUMN confirmed_minutes,
        DROP COLUMN confirmed_by_user_id,
        DROP COLUMN confirmed_at,
        DROP COLUMN completion_notes,
        DROP COLUMN reported_minutes,
        DROP COLUMN finished_at,
        DROP COLUMN started_at;
    `);
  }
}
