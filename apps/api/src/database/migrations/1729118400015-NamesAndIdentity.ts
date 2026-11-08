import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * People's names, and what a coordinator recorded when verifying someone's identity: the
 * document type, its last 4 digits, and a keyed one-way fingerprint of the full number so the
 * same document cannot verify two accounts. The full number is never stored.
 */
export class NamesAndIdentity1729118400015 implements MigrationInterface {
  name = 'NamesAndIdentity1729118400015';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE users ADD COLUMN full_name VARCHAR(100);
      ALTER TABLE verified_identities
        ADD COLUMN document_type VARCHAR(30),
        ADD COLUMN document_last4 VARCHAR(4),
        ADD COLUMN document_fingerprint VARCHAR(64),
        ADD COLUMN verification_notes VARCHAR(500);
      CREATE UNIQUE INDEX uq_verified_identities_document
        ON verified_identities (document_fingerprint) WHERE document_fingerprint IS NOT NULL;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX IF EXISTS uq_verified_identities_document;
      ALTER TABLE verified_identities
        DROP COLUMN verification_notes,
        DROP COLUMN document_fingerprint,
        DROP COLUMN document_last4,
        DROP COLUMN document_type;
      ALTER TABLE users DROP COLUMN full_name;
    `);
  }
}
