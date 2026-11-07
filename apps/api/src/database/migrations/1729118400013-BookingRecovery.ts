import { MigrationInterface, QueryRunner } from 'typeorm';

/** Coordinator review of finished visits, and the reminder sent for an unfinished one. */
export class BookingRecovery1729118400013 implements MigrationInterface {
  name = 'BookingRecovery1729118400013';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE volunteer_assignments
        ADD COLUMN finish_reminded_at TIMESTAMPTZ,
        ADD COLUMN review_reason VARCHAR(40),
        ADD COLUMN review_notes TEXT,
        ADD COLUMN review_minutes INT,
        ADD COLUMN review_requested_at TIMESTAMPTZ,
        ADD COLUMN review_requested_by_user_id UUID,
        ADD COLUMN review_resolved_at TIMESTAMPTZ,
        ADD COLUMN review_resolved_by_user_id UUID,
        ADD COLUMN review_outcome VARCHAR(20);
      ALTER TABLE volunteer_assignments ADD CONSTRAINT fk_assignment_review_requested_by
        FOREIGN KEY (review_requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE volunteer_assignments ADD CONSTRAINT fk_assignment_review_resolved_by
        FOREIGN KEY (review_resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE volunteer_assignments ADD CONSTRAINT chk_assignment_review_minutes
        CHECK (review_minutes IS NULL OR review_minutes BETWEEN 1 AND 720);
      CREATE INDEX idx_assignment_awaiting_review ON volunteer_assignments(service_request_id)
        WHERE review_requested_at IS NOT NULL AND review_resolved_at IS NULL;
      CREATE INDEX idx_assignment_open_visits ON volunteer_assignments(status)
        WHERE status IN ('ACCEPTED', 'IN_PROGRESS');
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX idx_assignment_open_visits;
      DROP INDEX idx_assignment_awaiting_review;
      ALTER TABLE volunteer_assignments
        DROP CONSTRAINT chk_assignment_review_minutes,
        DROP CONSTRAINT fk_assignment_review_resolved_by,
        DROP CONSTRAINT fk_assignment_review_requested_by,
        DROP COLUMN review_outcome,
        DROP COLUMN review_resolved_by_user_id,
        DROP COLUMN review_resolved_at,
        DROP COLUMN review_requested_by_user_id,
        DROP COLUMN review_requested_at,
        DROP COLUMN review_minutes,
        DROP COLUMN review_notes,
        DROP COLUMN review_reason,
        DROP COLUMN finish_reminded_at;
    `);
  }
}
