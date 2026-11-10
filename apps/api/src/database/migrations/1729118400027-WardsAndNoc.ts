import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Wards and the ward NOC (decided by the project owner on 10 November 2026).
 *
 * Each municipality lists its wards and who represents each one (a councillor or ward member).
 * Everyone joining picks their ward and uploads a No Objection Certificate signed by that person;
 * a coordinator accepts it before the membership can be approved. The file itself lives in private
 * storage on the API server; membership_documents keeps its key, type, size and checksum.
 */
export class WardsAndNoc1729118400027 implements MigrationInterface {
  name = 'WardsAndNoc1729118400027';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE wards (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        ward_number VARCHAR(20) NOT NULL,
        name VARCHAR(120) NOT NULL,
        representative_title VARCHAR(20) NOT NULL
          CHECK (representative_title IN ('COUNCILLOR', 'WARD_MEMBER')),
        representative_name VARCHAR(120) NOT NULL,
        representative_phone VARCHAR(20),
        office_address VARCHAR(300),
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
        created_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_wards_organization_number UNIQUE (organization_id, ward_number)
      );
    `);
    await q.query(`
      ALTER TABLE organization_memberships
        ADD COLUMN ward_id UUID REFERENCES wards(id) ON DELETE RESTRICT;
    `);
    await q.query(`
      ALTER TABLE membership_documents
        ADD COLUMN ward_id UUID REFERENCES wards(id) ON DELETE RESTRICT,
        ADD COLUMN content_type VARCHAR(100),
        ADD COLUMN size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes > 0),
        ADD COLUMN sha256 CHAR(64),
        ADD COLUMN review_notes VARCHAR(500),
        ADD COLUMN reviewed_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
        ADD COLUMN reviewed_at TIMESTAMPTZ;
    `);
    // The current NOC is the newest one for a membership.
    await q.query(`
      CREATE INDEX idx_membership_documents_membership_created
        ON membership_documents (membership_id, created_at DESC);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_membership_documents_membership_created;`);
    await q.query(`
      ALTER TABLE membership_documents
        DROP COLUMN IF EXISTS reviewed_at,
        DROP COLUMN IF EXISTS reviewed_by_user_id,
        DROP COLUMN IF EXISTS review_notes,
        DROP COLUMN IF EXISTS sha256,
        DROP COLUMN IF EXISTS size_bytes,
        DROP COLUMN IF EXISTS content_type,
        DROP COLUMN IF EXISTS ward_id;
    `);
    await q.query(`ALTER TABLE organization_memberships DROP COLUMN IF EXISTS ward_id;`);
    await q.query(`DROP TABLE IF EXISTS wards;`);
  }
}
