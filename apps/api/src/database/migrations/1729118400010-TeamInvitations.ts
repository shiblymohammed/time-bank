import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Milestone 5 — Team Invitations (FR-TEAM-02, D#65).
 *
 * An accepted volunteer on a multi-volunteer request can invite a teammate
 * from the same organization to fill a remaining slot. The invitation bypasses
 * the matching engine and creates an assignment directly when the invitee accepts.
 */
export class TeamInvitations1729118400010 implements MigrationInterface {
  name = 'TeamInvitations1729118400010';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "team_invitations" (
        "id"                      UUID         NOT NULL DEFAULT gen_random_uuid(),
        "organization_id"         UUID         NOT NULL,
        "service_request_id"      UUID         NOT NULL,
        "inviter_membership_id"   UUID         NOT NULL,
        "invitee_membership_id"   UUID         NOT NULL,
        "slot_number"             INT          NOT NULL,
        "status"                   VARCHAR(30)  NOT NULL DEFAULT 'PENDING',
        "expires_at"               TIMESTAMPTZ  NOT NULL,
        "accepted_at"              TIMESTAMPTZ,
        "declined_at"              TIMESTAMPTZ,
        "decline_reason"           TEXT,
        "cancelled_at"             TIMESTAMPTZ,
        "resulting_assignment_id" UUID,
        "created_at"               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "updated_at"               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_team_invitations" PRIMARY KEY ("id"),
        CONSTRAINT "fk_team_invitations_org"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_team_invitations_request"
          FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_team_invitations_inviter"
          FOREIGN KEY ("inviter_membership_id") REFERENCES "organization_memberships"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_team_invitations_invitee"
          FOREIGN KEY ("invitee_membership_id") REFERENCES "organization_memberships"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_team_invitations_assignment"
          FOREIGN KEY ("resulting_assignment_id") REFERENCES "volunteer_assignments"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_team_invitations_org_status" ON "team_invitations" ("organization_id", "status");
      CREATE INDEX "idx_team_invitations_request" ON "team_invitations" ("service_request_id", "status");
      CREATE INDEX "idx_team_invitations_invitee" ON "team_invitations" ("invitee_membership_id", "status");
      -- Prevent duplicate pending invitations for the same request+invitee
      CREATE UNIQUE INDEX "uq_team_invitation_pending"
        ON "team_invitations" ("service_request_id", "invitee_membership_id")
        WHERE "status" = 'PENDING';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_team_invitation_pending"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_team_invitations_invitee"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_team_invitations_request"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_team_invitations_org_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "team_invitations"`);
  }
}
