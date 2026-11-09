import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Safety alerts during a visit (FR-SAFE-01, FR-SAFE-02, BR-10). A paused visit stays IN_PROGRESS with
 * paused_at set, so everything that counts a visit as under way keeps working. paused_seconds is
 * left out of the time worked. An alert's note is confidential, so it lives only on this table.
 */
export class SafetyAlerts1729118400017 implements MigrationInterface {
  name = 'SafetyAlerts1729118400017';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE volunteer_assignments
        ADD COLUMN paused_at TIMESTAMPTZ,
        ADD COLUMN paused_seconds INT NOT NULL DEFAULT 0,
        ADD COLUMN restart_allowed_at TIMESTAMPTZ;
    `);
    await q.query(`
      CREATE TABLE safety_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        service_request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE RESTRICT,
        raised_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        raised_by_role VARCHAR(20) NOT NULL
          CHECK (raised_by_role IN ('VOLUNTEER', 'BENEFICIARY', 'CAREGIVER')),
        action VARCHAR(10) NOT NULL CHECK (action IN ('PAUSE', 'END')),
        notes TEXT,
        client_operation_id VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
          CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
        acknowledged_at TIMESTAMPTZ,
        acknowledged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        staff_notes TEXT,
        outcome VARCHAR(20) CHECK (outcome IN ('RESTARTED', 'ENDED')),
        resolved_at TIMESTAMPTZ,
        resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await q.query(`
      CREATE INDEX idx_safety_alerts_org_status
        ON safety_alerts (organization_id, status, created_at DESC);
    `);
    await q.query(`CREATE INDEX idx_safety_alerts_request ON safety_alerts (service_request_id);`);
    // A retry after a dropped connection finds the alert it already raised.
    await q.query(`
      CREATE UNIQUE INDEX uq_safety_alerts_operation
        ON safety_alerts (raised_by_user_id, client_operation_id)
        WHERE client_operation_id IS NOT NULL;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE safety_alerts;`);
    await q.query(`
      ALTER TABLE volunteer_assignments
        DROP COLUMN paused_at,
        DROP COLUMN paused_seconds,
        DROP COLUMN restart_allowed_at;
    `);
  }
}
