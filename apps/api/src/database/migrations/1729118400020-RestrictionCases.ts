import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Suspensions, bans, reinstatement and appeals (FR-SAFE-04/05/06, D#77-85, BR-11).
 *
 * restriction_cases says who recommended, who decided, and why. What actually blocks a person
 * stays where it was: global_account_restrictions and users.status for all communities, and
 * organization_memberships.status for one. Every restriction already in force gets a case here,
 * so its owner can appeal it.
 */
export class RestrictionCases1729118400020 implements MigrationInterface {
  name = 'RestrictionCases1729118400020';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE restriction_cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reference VARCHAR(30) NOT NULL UNIQUE,
        organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
        subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        subject_membership_id UUID REFERENCES organization_memberships(id) ON DELETE RESTRICT,
        restriction_type VARCHAR(50) NOT NULL CHECK (restriction_type IN
          ('TEMPORARY_SUSPENSION', 'PERMANENT_BAN', 'DUPLICATE_FREEZE', 'FRAUD_INVESTIGATION_HOLD')),
        scope VARCHAR(20) CHECK (scope IN ('COMMUNITY', 'PLATFORM')),
        level VARCHAR(20) NOT NULL
          CHECK (level IN ('COORDINATOR', 'MUNICIPALITY_ADMIN', 'SUPER_ADMIN')),
        status VARCHAR(20) NOT NULL DEFAULT 'RECOMMENDED'
          CHECK (status IN ('RECOMMENDED', 'REFUSED', 'ACTIVE', 'REINSTATED', 'OVERTURNED')),
        reason TEXT NOT NULL,
        complaint_id UUID REFERENCES complaints(id) ON DELETE RESTRICT,
        recommended_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        member_message TEXT,
        decided_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        decided_at TIMESTAMPTZ,
        restriction_id UUID REFERENCES global_account_restrictions(id) ON DELETE RESTRICT,
        review_on TIMESTAMPTZ,
        review_notified_at TIMESTAMPTZ,
        reinstatement_recommended_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        reinstatement_recommended_at TIMESTAMPTZ,
        ended_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        ended_at TIMESTAMPTZ,
        client_operation_id VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_restriction_ban_scope
          CHECK (restriction_type <> 'PERMANENT_BAN' OR scope IS NULL OR scope = 'PLATFORM'),
        CONSTRAINT chk_restriction_decision CHECK (
          status NOT IN ('ACTIVE', 'REINSTATED', 'OVERTURNED')
          OR (scope IS NOT NULL AND member_message IS NOT NULL AND decided_at IS NOT NULL)
        ),
        CONSTRAINT chk_restriction_platform_link
          CHECK (scope IS DISTINCT FROM 'PLATFORM' OR restriction_id IS NOT NULL),
        CONSTRAINT chk_restriction_community_link CHECK (
          scope IS DISTINCT FROM 'COMMUNITY'
          OR (organization_id IS NOT NULL AND subject_membership_id IS NOT NULL)
        )
      );
    `);
    await q.query(`
      CREATE INDEX idx_restriction_cases_org ON restriction_cases (organization_id, status, created_at DESC);
    `);
    await q.query(`
      CREATE INDEX idx_restriction_cases_subject ON restriction_cases (subject_user_id, status);
    `);
    await q.query(`
      CREATE INDEX idx_restriction_cases_review ON restriction_cases (review_on)
        WHERE status = 'ACTIVE' AND review_notified_at IS NULL;
    `);
    // A second coordinator finds the recommendation already made, instead of adding another.
    await q.query(`
      CREATE UNIQUE INDEX uq_restriction_open_recommendation
        ON restriction_cases (subject_user_id, organization_id)
        WHERE status = 'RECOMMENDED';
    `);
    await q.query(`
      CREATE UNIQUE INDEX uq_restriction_active_community
        ON restriction_cases (subject_membership_id)
        WHERE status = 'ACTIVE' AND scope = 'COMMUNITY';
    `);
    await q.query(`
      CREATE UNIQUE INDEX uq_restriction_restriction ON restriction_cases (restriction_id)
        WHERE restriction_id IS NOT NULL;
    `);
    await q.query(`
      CREATE UNIQUE INDEX uq_restriction_operation
        ON restriction_cases (recommended_by_user_id, client_operation_id)
        WHERE client_operation_id IS NOT NULL;
    `);

    await q.query(`
      CREATE TABLE restriction_case_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID NOT NULL REFERENCES restriction_cases(id) ON DELETE RESTRICT,
        actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        type VARCHAR(30) NOT NULL CHECK (type IN (
          'RECOMMENDED', 'REFUSED', 'APPROVED', 'IMPOSED_DIRECTLY', 'NOTE',
          'REINSTATEMENT_RECOMMENDED', 'REINSTATEMENT_REFUSED', 'REINSTATED',
          'APPEALED', 'APPEAL_STANDS', 'OVERTURNED'
        )),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await q.query(`
      CREATE INDEX idx_restriction_case_events ON restriction_case_events (case_id, created_at);
    `);
    await q.query(`
      CREATE FUNCTION reject_restriction_case_event_change() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'restriction_case_events is append-only';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await q.query(`
      CREATE TRIGGER trg_restriction_case_events_append_only
        BEFORE UPDATE OR DELETE ON restriction_case_events
        FOR EACH ROW EXECUTE FUNCTION reject_restriction_case_event_change();
    `);

    await q.query(`
      CREATE TABLE appeals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reference VARCHAR(30) NOT NULL UNIQUE,
        kind VARCHAR(20) NOT NULL CHECK (kind IN ('RESTRICTION', 'COMPLAINT')),
        organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
        restriction_case_id UUID REFERENCES restriction_cases(id) ON DELETE RESTRICT,
        complaint_id UUID REFERENCES complaints(id) ON DELETE RESTRICT,
        appellant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        filed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        original_decider_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        level VARCHAR(20) NOT NULL
          CHECK (level IN ('MUNICIPALITY_ADMIN', 'SUPER_ADMIN')),
        status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DECIDED')),
        grounds TEXT NOT NULL,
        outcome VARCHAR(20) CHECK (outcome IN ('STANDS', 'OVERTURNED')),
        staff_notes TEXT,
        member_message TEXT,
        decided_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        decided_at TIMESTAMPTZ,
        client_operation_id VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_appeal_target CHECK (
          (kind = 'RESTRICTION' AND restriction_case_id IS NOT NULL AND complaint_id IS NULL)
          OR (kind = 'COMPLAINT' AND complaint_id IS NOT NULL AND restriction_case_id IS NULL)
        ),
        CONSTRAINT chk_appeal_decision CHECK (
          (status = 'DECIDED') = (outcome IS NOT NULL AND member_message IS NOT NULL AND decided_at IS NOT NULL)
        )
      );
    `);
    await q.query(`CREATE INDEX idx_appeals_status ON appeals (status, level, created_at DESC);`);
    await q.query(`CREATE INDEX idx_appeals_org ON appeals (organization_id, status, created_at DESC);`);
    // One appeal per decision: a restriction has one, and a complaint one at each level above it.
    await q.query(`
      CREATE UNIQUE INDEX uq_appeal_restriction ON appeals (restriction_case_id)
        WHERE restriction_case_id IS NOT NULL;
    `);
    await q.query(`
      CREATE UNIQUE INDEX uq_appeal_complaint_level ON appeals (complaint_id, level)
        WHERE complaint_id IS NOT NULL;
    `);

    // A complaint's outcome can now be challenged, and its history records that.
    await q.query(`
      ALTER TABLE complaint_events DROP CONSTRAINT complaint_events_type_check;
    `);
    await q.query(`
      ALTER TABLE complaint_events ADD CONSTRAINT complaint_events_type_check CHECK (
        type IN ('RAISED', 'TAKEN', 'NOTE', 'PASSED_UP', 'DECIDED', 'APPEALED', 'APPEAL_DECIDED')
      );
    `);

    // Restrictions already in force: 30 days to appeal, counted from today.
    await q.query(`
      WITH added AS (
        INSERT INTO restriction_cases (
          reference, organization_id, subject_user_id, subject_membership_id, restriction_type,
          scope, level, status, reason, recommended_by_user_id, member_message,
          decided_by_user_id, decided_at, restriction_id
        )
        SELECT
          'RST-' || to_char(now(), 'YYYYMM') || '-' || upper(substr(md5(r.id::text), 1, 8)),
          m.organization_id, r.user_id, m.id, r.restriction_type,
          'PLATFORM', 'SUPER_ADMIN', 'ACTIVE',
          'Restricted before cases were recorded. Reason code: ' || r.reason_code,
          r.authorized_by,
          'Your account has been restricted. Contact your community coordinator for details.',
          r.authorized_by, now(), r.id
        FROM global_account_restrictions r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN LATERAL (
          SELECT om.id, om.organization_id FROM organization_memberships om
          WHERE om.user_id = r.user_id
          ORDER BY (om.organization_id = u.primary_org_id) DESC NULLS LAST, om.applied_at ASC
          LIMIT 1
        ) m ON TRUE
        WHERE r.status = 'ACTIVE'
        RETURNING id, recommended_by_user_id
      )
      INSERT INTO restriction_case_events (case_id, actor_user_id, type, notes)
      SELECT id, recommended_by_user_id, 'IMPOSED_DIRECTLY', 'Recorded when cases were introduced'
      FROM added;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE complaint_events DROP CONSTRAINT complaint_events_type_check;`);
    await q.query(`DELETE FROM complaint_events WHERE type IN ('APPEALED', 'APPEAL_DECIDED');`);
    await q.query(`
      ALTER TABLE complaint_events ADD CONSTRAINT complaint_events_type_check
        CHECK (type IN ('RAISED', 'TAKEN', 'NOTE', 'PASSED_UP', 'DECIDED'));
    `);
    await q.query(`DROP TABLE appeals;`);
    await q.query(`DROP TABLE restriction_case_events;`);
    await q.query(`DROP FUNCTION reject_restriction_case_event_change();`);
    await q.query(`DROP TABLE restriction_cases;`);
  }
}
