import { MigrationInterface, QueryRunner } from 'typeorm';

// Member-to-member donations and approved community pools (FR-TIME-03, D#15, D#19).
// Each donation is two balanced ledger rows: one out of the donor, one into the recipient.
export class CreditDonations1729118400008 implements MigrationInterface {
  name = 'CreditDonations1729118400008';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE community_credit_pools (
        id                 UUID           NOT NULL DEFAULT gen_random_uuid(),
        organization_id    UUID           NOT NULL,
        name               VARCHAR(120)   NOT NULL,
        description        VARCHAR(500),
        balance_credits    NUMERIC(12, 2) NOT NULL DEFAULT 0,
        status             VARCHAR(20)    NOT NULL DEFAULT 'ACTIVE',
        created_by_user_id UUID,
        created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_community_credit_pools PRIMARY KEY (id),
        CONSTRAINT fk_pool_org FOREIGN KEY (organization_id)
          REFERENCES organizations(id) ON DELETE RESTRICT,
        CONSTRAINT fk_pool_creator FOREIGN KEY (created_by_user_id)
          REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT uq_pool_org_name UNIQUE (organization_id, name),
        CONSTRAINT chk_pool_balance_nonnegative CHECK (balance_credits >= 0),
        CONSTRAINT chk_pool_status CHECK (status IN ('ACTIVE', 'CLOSED'))
      );

      CREATE TABLE credit_donations (
        id                      UUID           NOT NULL DEFAULT gen_random_uuid(),
        donor_user_id           UUID           NOT NULL,
        originating_org_id      UUID           NOT NULL,
        recipient_user_id       UUID,
        recipient_membership_id UUID,
        recipient_pool_id       UUID,
        amount                  NUMERIC(10, 2) NOT NULL,
        note                    VARCHAR(200),
        idempotency_key         VARCHAR(100)   NOT NULL,
        created_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_credit_donations PRIMARY KEY (id),
        CONSTRAINT fk_donation_donor FOREIGN KEY (donor_user_id)
          REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_donation_origin_org FOREIGN KEY (originating_org_id)
          REFERENCES organizations(id) ON DELETE RESTRICT,
        CONSTRAINT fk_donation_recipient FOREIGN KEY (recipient_user_id)
          REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT fk_donation_recipient_membership FOREIGN KEY (recipient_membership_id)
          REFERENCES organization_memberships(id) ON DELETE RESTRICT,
        CONSTRAINT fk_donation_pool FOREIGN KEY (recipient_pool_id)
          REFERENCES community_credit_pools(id) ON DELETE RESTRICT,
        CONSTRAINT uq_donation_idempotency UNIQUE (donor_user_id, idempotency_key),
        CONSTRAINT chk_donation_amount_positive CHECK (amount > 0),
        CONSTRAINT chk_donation_one_recipient CHECK (
          (recipient_pool_id IS NULL) <> (recipient_user_id IS NULL)
        ),
        CONSTRAINT chk_donation_member_recipient CHECK (
          recipient_user_id IS NULL OR (
            recipient_membership_id IS NOT NULL AND recipient_user_id <> donor_user_id
          )
        )
      );
      CREATE INDEX idx_donation_pool ON credit_donations(recipient_pool_id);

      ALTER TABLE time_credit_ledger
        ALTER COLUMN wallet_id DROP NOT NULL,
        ADD COLUMN pool_id UUID,
        ADD COLUMN donation_id UUID,
        ADD CONSTRAINT fk_ledger_pool FOREIGN KEY (pool_id)
          REFERENCES community_credit_pools(id) ON DELETE RESTRICT,
        ADD CONSTRAINT fk_ledger_donation FOREIGN KEY (donation_id)
          REFERENCES credit_donations(id) ON DELETE RESTRICT,
        ADD CONSTRAINT uq_ledger_donation_leg UNIQUE (donation_id, tx_type),
        ADD CONSTRAINT chk_ledger_one_account CHECK ((wallet_id IS NULL) <> (pool_id IS NULL)),
        ADD CONSTRAINT chk_ledger_donation CHECK (
          tx_type NOT IN ('DONATION_SENT', 'DONATION_RECEIVED') OR donation_id IS NOT NULL
        ),
        ADD CONSTRAINT chk_ledger_sign CHECK ((tx_type = 'DONATION_SENT') = (amount < 0));
      CREATE INDEX idx_ledger_pool_created ON time_credit_ledger(pool_id, created_at DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX idx_ledger_pool_created;
      ALTER TABLE time_credit_ledger
        DROP CONSTRAINT chk_ledger_sign,
        DROP CONSTRAINT chk_ledger_donation,
        DROP CONSTRAINT chk_ledger_one_account,
        DROP CONSTRAINT uq_ledger_donation_leg,
        DROP CONSTRAINT fk_ledger_donation,
        DROP CONSTRAINT fk_ledger_pool,
        DROP COLUMN donation_id,
        DROP COLUMN pool_id,
        ALTER COLUMN wallet_id SET NOT NULL;
      DROP TABLE credit_donations;
      DROP TABLE community_credit_pools;
    `);
  }
}
