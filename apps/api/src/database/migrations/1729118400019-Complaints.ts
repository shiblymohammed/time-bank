import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Confidential complaints (FR-SAFE-03, D#28, D#75, D#76). What was said lives only on these tables:
 * the audit trail records that something happened, never the words. complaint_events is the case
 * history, so it is append-only.
 */
export class Complaints1729118400019 implements MigrationInterface {
  name = 'Complaints1729118400019';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE complaints (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        reference VARCHAR(30) NOT NULL UNIQUE,
        raised_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        subject VARCHAR(20) NOT NULL
          CHECK (subject IN ('SERVICE_OR_MEMBER', 'COORDINATOR', 'MUNICIPALITY_ADMIN')),
        level VARCHAR(20) NOT NULL
          CHECK (level IN ('COORDINATOR', 'MUNICIPALITY_ADMIN', 'SUPER_ADMIN')),
        status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
          CHECK (status IN ('OPEN', 'IN_REVIEW', 'CLOSED')),
        description TEXT NOT NULL,
        service_request_id UUID REFERENCES service_requests(id) ON DELETE RESTRICT,
        client_operation_id VARCHAR(100),
        handled_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        outcome VARCHAR(20) CHECK (outcome IN ('UPHELD', 'NOT_UPHELD')),
        member_message TEXT,
        decided_at TIMESTAMPTZ,
        decided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_complaints_decision CHECK (
          (status = 'CLOSED') = (outcome IS NOT NULL AND member_message IS NOT NULL AND decided_at IS NOT NULL)
        )
      );
    `);
    await q.query(`
      CREATE INDEX idx_complaints_org_status ON complaints (organization_id, status, created_at DESC);
    `);
    await q.query(`CREATE INDEX idx_complaints_status ON complaints (status, created_at DESC);`);
    await q.query(`
      CREATE INDEX idx_complaints_raised_by ON complaints (raised_by_user_id, created_at DESC);
    `);
    // A retry after a dropped connection finds the complaint it already made.
    await q.query(`
      CREATE UNIQUE INDEX uq_complaints_operation
        ON complaints (raised_by_user_id, client_operation_id)
        WHERE client_operation_id IS NOT NULL;
    `);
    await q.query(`
      CREATE TABLE complaint_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE RESTRICT,
        actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        type VARCHAR(20) NOT NULL
          CHECK (type IN ('RAISED', 'TAKEN', 'NOTE', 'PASSED_UP', 'DECIDED')),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await q.query(
      `CREATE INDEX idx_complaint_events ON complaint_events (complaint_id, created_at);`,
    );
    await q.query(`
      CREATE FUNCTION reject_complaint_event_change() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'complaint_events is append-only';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await q.query(`
      CREATE TRIGGER trg_complaint_events_append_only
        BEFORE UPDATE OR DELETE ON complaint_events
        FOR EACH ROW EXECUTE FUNCTION reject_complaint_event_change();
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE complaint_events;`);
    await q.query(`DROP FUNCTION reject_complaint_event_change();`);
    await q.query(`DROP TABLE complaints;`);
  }
}
