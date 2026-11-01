import { MigrationInterface, QueryRunner } from 'typeorm';

// An applicant says what they want to do (volunteer, ask for help, or care for
// someone) and, as a volunteer, how and where they can help. A coordinator
// reads this when approving; nothing here grants a role by itself.
export class MembershipApplications1729118400009 implements MigrationInterface {
  name = 'MembershipApplications1729118400009';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organization_memberships
        ADD COLUMN requested_role      VARCHAR(30),
        ADD COLUMN application_notes   VARCHAR(500),
        ADD COLUMN application_details JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD CONSTRAINT chk_membership_requested_role CHECK (
          requested_role IS NULL OR requested_role IN ('VOLUNTEER', 'BENEFICIARY', 'CAREGIVER')
        ),
        ADD CONSTRAINT chk_membership_application_details CHECK (
          jsonb_typeof(application_details) = 'object'
        );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organization_memberships
        DROP CONSTRAINT chk_membership_application_details,
        DROP CONSTRAINT chk_membership_requested_role,
        DROP COLUMN application_details,
        DROP COLUMN application_notes,
        DROP COLUMN requested_role;
    `);
  }
}
