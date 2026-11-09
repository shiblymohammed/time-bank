import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nominees and account closure (FR-IDENT-06/07/08, D#44-46, D#87-90).
 *
 * death_nominees keeps every nominee a member has named, so a late change can be seen. What closes
 * an account stays where it was: users.status, organization_memberships.status and the wallet's
 * status. account_closures says who reported it, who decided, and what to put back if it was wrong.
 */
export class AccountClosures1729118400021 implements MigrationInterface {
  name = 'AccountClosures1729118400021';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE death_nominees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        nominee_name VARCHAR(100) NOT NULL,
        nominee_phone VARCHAR(20) NOT NULL,
        replaced_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await q.query(`
      CREATE UNIQUE INDEX uq_death_nominee_current ON death_nominees (user_id)
        WHERE replaced_at IS NULL;
    `);
    await q.query(
      `CREATE INDEX idx_death_nominees_user ON death_nominees (user_id, created_at DESC);`,
    );

    await q.query(`
      CREATE TABLE account_closures (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reference VARCHAR(30) NOT NULL UNIQUE,
        kind VARCHAR(20) NOT NULL CHECK (kind IN ('DECEASED', 'DUPLICATE')),
        organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
        subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        subject_membership_id UUID REFERENCES organization_memberships(id) ON DELETE RESTRICT,
        primary_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        level VARCHAR(20) NOT NULL
          CHECK (level IN ('COORDINATOR', 'MUNICIPALITY_ADMIN', 'SUPER_ADMIN')),
        needs_super_admin BOOLEAN NOT NULL DEFAULT false,
        status VARCHAR(20) NOT NULL DEFAULT 'REPORTED'
          CHECK (status IN ('REPORTED', 'REFUSED', 'CLOSED', 'REOPENED', 'OVERTURNED')),
        reason TEXT NOT NULL,
        date_of_death DATE,
        evidence_type VARCHAR(30)
          CHECK (evidence_type IN ('DEATH_CERTIFICATE', 'MUNICIPAL_RECORD', 'HOSPITAL_RECORD')),
        evidence_last4 VARCHAR(4),
        member_message TEXT,
        reported_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        decided_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        decided_at TIMESTAMPTZ,
        restore_state JSONB,
        nominee_under_review BOOLEAN NOT NULL DEFAULT false,
        receiver_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        transfer_recommended_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        transfer_recommended_at TIMESTAMPTZ,
        transferred_credits NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (transferred_credits >= 0),
        last_transferred_at TIMESTAMPTZ,
        ended_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        ended_at TIMESTAMPTZ,
        client_operation_id VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_closure_deceased CHECK (
          kind <> 'DECEASED'
          OR (date_of_death IS NOT NULL AND evidence_type IS NOT NULL AND evidence_last4 IS NOT NULL
              AND primary_user_id IS NULL)
        ),
        CONSTRAINT chk_closure_duplicate CHECK (
          kind <> 'DUPLICATE'
          OR (primary_user_id IS NOT NULL AND primary_user_id <> subject_user_id
              AND date_of_death IS NULL)
        ),
        CONSTRAINT chk_closure_decision CHECK (
          status NOT IN ('CLOSED', 'REOPENED', 'OVERTURNED')
          OR (decided_at IS NOT NULL AND restore_state IS NOT NULL)
        ),
        CONSTRAINT chk_closure_message CHECK (
          kind <> 'DUPLICATE' OR status NOT IN ('CLOSED', 'OVERTURNED') OR member_message IS NOT NULL
        ),
        CONSTRAINT chk_closure_transfer CHECK (
          (receiver_user_id IS NULL) = (transfer_recommended_by_user_id IS NULL)
        )
      );
    `);
    await q.query(`
      CREATE INDEX idx_account_closures_org ON account_closures (organization_id, status, created_at DESC);
    `);
    // One live closure per person, so two coordinators cannot both report the same thing.
    await q.query(`
      CREATE UNIQUE INDEX uq_account_closure_live ON account_closures (subject_user_id)
        WHERE status IN ('REPORTED', 'CLOSED');
    `);
    await q.query(`
      CREATE UNIQUE INDEX uq_account_closure_operation
        ON account_closures (reported_by_user_id, client_operation_id)
        WHERE client_operation_id IS NOT NULL;
    `);

    await q.query(`
      CREATE TABLE account_closure_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        closure_id UUID NOT NULL REFERENCES account_closures(id) ON DELETE RESTRICT,
        actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        type VARCHAR(30) NOT NULL CHECK (type IN (
          'REPORTED', 'REFUSED', 'APPROVED', 'NOTE', 'DISPUTED', 'DISPUTE_RESOLVED',
          'TRANSFER_RECOMMENDED', 'TRANSFER_REFUSED', 'TRANSFERRED',
          'APPEALED', 'APPEAL_STANDS', 'OVERTURNED', 'REOPENED'
        )),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await q.query(
      `CREATE INDEX idx_account_closure_events ON account_closure_events (closure_id, created_at);`,
    );
    await q.query(`
      CREATE FUNCTION reject_account_closure_event_change() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'account_closure_events is append-only';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await q.query(`
      CREATE TRIGGER trg_account_closure_events_append_only
        BEFORE UPDATE OR DELETE ON account_closure_events
        FOR EACH ROW EXECUTE FUNCTION reject_account_closure_event_change();
    `);

    // A wrongly closed duplicate can be appealed, like a restriction.
    await q.query(`
      ALTER TABLE appeals
        ADD COLUMN closure_id UUID REFERENCES account_closures(id) ON DELETE RESTRICT,
        DROP CONSTRAINT appeals_kind_check,
        ADD CONSTRAINT appeals_kind_check CHECK (kind IN ('RESTRICTION', 'COMPLAINT', 'CLOSURE')),
        DROP CONSTRAINT chk_appeal_target,
        ADD CONSTRAINT chk_appeal_target CHECK (
          (kind = 'RESTRICTION' AND restriction_case_id IS NOT NULL AND complaint_id IS NULL AND closure_id IS NULL)
          OR (kind = 'COMPLAINT' AND complaint_id IS NOT NULL AND restriction_case_id IS NULL AND closure_id IS NULL)
          OR (kind = 'CLOSURE' AND closure_id IS NOT NULL AND restriction_case_id IS NULL AND complaint_id IS NULL)
        );
    `);
    await q.query(`
      CREATE UNIQUE INDEX uq_appeal_closure ON appeals (closure_id) WHERE closure_id IS NOT NULL;
    `);

    // Credits moving to a verified nominee. Both sides name the closure that allowed it.
    await q.query(`
      ALTER TABLE time_credit_ledger
        ADD COLUMN closure_id UUID REFERENCES account_closures(id) ON DELETE RESTRICT,
        DROP CONSTRAINT chk_ledger_sign,
        ADD CONSTRAINT chk_ledger_sign CHECK (
          (tx_type IN ('DONATION_SENT','ASSISTANCE_SPENT','FRAUD_HELD','CREDIT_CORRECTED','ESTATE_SENT') AND amount < 0) OR
          (tx_type IN ('SERVICE_EARNED','DONATION_RECEIVED','FRAUD_RELEASED','FROZEN_RELEASED','ESTATE_RECEIVED') AND amount > 0)
        ),
        ADD CONSTRAINT chk_ledger_estate CHECK (
          tx_type NOT IN ('ESTATE_SENT','ESTATE_RECEIVED')
          OR (closure_id IS NOT NULL AND NOT held AND frozen_delta = 0)
        );
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    // Never drop financial history to make an old binary fit.
    await q.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM time_credit_ledger WHERE tx_type IN ('ESTATE_SENT','ESTATE_RECEIVED')) THEN
        RAISE EXCEPTION 'Credits have moved to nominees; this migration cannot be undone';
      END IF;
    END $$;`);
    await q.query(`
      ALTER TABLE time_credit_ledger
        DROP CONSTRAINT chk_ledger_estate,
        DROP CONSTRAINT chk_ledger_sign,
        DROP COLUMN closure_id,
        ADD CONSTRAINT chk_ledger_sign CHECK (
          (tx_type IN ('DONATION_SENT','ASSISTANCE_SPENT','FRAUD_HELD','CREDIT_CORRECTED') AND amount < 0) OR
          (tx_type IN ('SERVICE_EARNED','DONATION_RECEIVED','FRAUD_RELEASED','FROZEN_RELEASED') AND amount > 0)
        );
    `);
    await q.query(`DELETE FROM appeals WHERE kind = 'CLOSURE';`);
    await q.query(`
      ALTER TABLE appeals
        DROP CONSTRAINT chk_appeal_target,
        DROP CONSTRAINT appeals_kind_check,
        DROP COLUMN closure_id,
        ADD CONSTRAINT appeals_kind_check CHECK (kind IN ('RESTRICTION', 'COMPLAINT')),
        ADD CONSTRAINT chk_appeal_target CHECK (
          (kind = 'RESTRICTION' AND restriction_case_id IS NOT NULL AND complaint_id IS NULL)
          OR (kind = 'COMPLAINT' AND complaint_id IS NOT NULL AND restriction_case_id IS NULL)
        );
    `);
    await q.query(`DROP TABLE account_closure_events;`);
    await q.query(`DROP FUNCTION reject_account_closure_event_change();`);
    await q.query(`DROP TABLE account_closures;`);
    await q.query(`DROP TABLE death_nominees;`);
  }
}
