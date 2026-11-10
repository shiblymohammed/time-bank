import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moving an account to a new phone number after a lost phone or SIM (FR-IDENT-05, D#43).
 *
 * The account, wallet and memberships stay as they are, because they hang on the user id. Only
 * users.phone_e164 changes. A completed case is also the record of which numbers are held and which
 * have moved, so there is no separate table for that.
 */
export class PhoneRecovery1729118400025 implements MigrationInterface {
  name = 'PhoneRecovery1729118400025';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE phone_recovery_cases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reference VARCHAR(30) NOT NULL UNIQUE,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        subject_membership_id UUID NOT NULL REFERENCES organization_memberships(id) ON DELETE RESTRICT,
        old_phone VARCHAR(20) NOT NULL,
        new_phone VARCHAR(20) NOT NULL,
        level VARCHAR(20) NOT NULL
          CHECK (level IN ('COORDINATOR', 'MUNICIPALITY_ADMIN', 'SUPER_ADMIN')),
        needs_super_admin BOOLEAN NOT NULL DEFAULT false,
        status VARCHAR(20) NOT NULL DEFAULT 'OPENED'
          CHECK (status IN ('OPENED', 'CONFIRMED', 'COMPLETED', 'REFUSED', 'WITHDRAWN', 'REVERSED')),
        document_type VARCHAR(30) NOT NULL,
        document_last4 VARCHAR(4) NOT NULL,
        document_result VARCHAR(20) NOT NULL
          CHECK (document_result IN ('MATCHED', 'DIFFERENT', 'NONE_ON_RECORD')),
        reason TEXT NOT NULL,
        opened_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        confirmed_at TIMESTAMPTZ,
        decided_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        decided_at TIMESTAMPTZ,
        retired_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        nominee_ended BOOLEAN NOT NULL DEFAULT false,
        reversed_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        reversed_at TIMESTAMPTZ,
        client_operation_id VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT chk_phone_recovery_numbers CHECK (old_phone <> new_phone),
        CONSTRAINT chk_phone_recovery_confirmed CHECK (
          status NOT IN ('CONFIRMED', 'COMPLETED', 'REVERSED') OR confirmed_at IS NOT NULL
        ),
        CONSTRAINT chk_phone_recovery_decided CHECK (
          status NOT IN ('COMPLETED', 'REVERSED')
          OR (decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
        ),
        CONSTRAINT chk_phone_recovery_decider CHECK (decided_by_user_id <> subject_user_id),
        CONSTRAINT chk_phone_recovery_reversed CHECK (
          status <> 'REVERSED' OR (reversed_by_user_id IS NOT NULL AND reversed_at IS NOT NULL)
        )
      );
    `);
    await q.query(`
      CREATE INDEX idx_phone_recovery_org ON phone_recovery_cases (organization_id, status, created_at DESC);
    `);
    await q.query(`CREATE INDEX idx_phone_recovery_old_phone ON phone_recovery_cases (old_phone, decided_at);`);
    await q.query(`CREATE INDEX idx_phone_recovery_new_phone ON phone_recovery_cases (new_phone, decided_at);`);
    // One open case per person and per new number, so two coordinators cannot race each other.
    await q.query(`
      CREATE UNIQUE INDEX uq_phone_recovery_open_subject ON phone_recovery_cases (subject_user_id)
        WHERE status IN ('OPENED', 'CONFIRMED');
    `);
    await q.query(`
      CREATE UNIQUE INDEX uq_phone_recovery_open_number ON phone_recovery_cases (new_phone)
        WHERE status IN ('OPENED', 'CONFIRMED');
    `);
    await q.query(`
      CREATE UNIQUE INDEX uq_phone_recovery_operation
        ON phone_recovery_cases (opened_by_user_id, client_operation_id)
        WHERE client_operation_id IS NOT NULL;
    `);

    await q.query(`
      CREATE TABLE phone_recovery_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id UUID NOT NULL REFERENCES phone_recovery_cases(id) ON DELETE RESTRICT,
        actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        type VARCHAR(20) NOT NULL CHECK (type IN (
          'OPENED', 'CONFIRMED', 'DECLINED', 'APPROVED', 'REFUSED', 'WITHDRAWN', 'NOTE', 'REVERSED'
        )),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await q.query(`CREATE INDEX idx_phone_recovery_events ON phone_recovery_events (case_id, created_at);`);
    await q.query(`
      CREATE FUNCTION reject_phone_recovery_event_change() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'phone_recovery_events is append-only';
      END;
      $$ LANGUAGE plpgsql;
    `);
    await q.query(`
      CREATE TRIGGER trg_phone_recovery_events_append_only
        BEFORE UPDATE OR DELETE ON phone_recovery_events
        FOR EACH ROW EXECUTE FUNCTION reject_phone_recovery_event_change();
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    // The moved numbers themselves stay on users: undoing the schema must not undo a person's move.
    await q.query(`DROP TABLE phone_recovery_events;`);
    await q.query(`DROP FUNCTION reject_phone_recovery_event_change();`);
    await q.query(`DROP TABLE phone_recovery_cases;`);
  }
}
