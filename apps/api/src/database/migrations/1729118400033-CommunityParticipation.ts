import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunityParticipation1729118400033 implements MigrationInterface {
  name = 'CommunityParticipation1729118400033';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE community_member_blocks (
        organization_id uuid NOT NULL,
        blocker_id uuid NOT NULL,
        blocked_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (organization_id, blocker_id, blocked_id),
        FOREIGN KEY (organization_id, blocker_id) REFERENCES organization_memberships(organization_id,id),
        FOREIGN KEY (organization_id, blocked_id) REFERENCES organization_memberships(organization_id,id),
        CHECK (blocker_id <> blocked_id)
      );
      CREATE TABLE community_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        organizer_id uuid NOT NULL,
        title varchar(120) NOT NULL,
        description varchar(2000) NOT NULL,
        venue varchar(200) NOT NULL,
        starts_at timestamptz NOT NULL,
        ends_at timestamptz NOT NULL,
        capacity integer CHECK (capacity BETWEEN 1 AND 10000),
        cancelled_at timestamptz,
        cancellation_reason varchar(500),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (organization_id,id),
        FOREIGN KEY (organization_id, organizer_id) REFERENCES organization_memberships(organization_id,id),
        CHECK (ends_at > starts_at)
      );
      CREATE INDEX idx_community_events_schedule ON community_events(organization_id, starts_at, id);
      CREATE TABLE community_event_attendance (
        organization_id uuid NOT NULL,
        event_id uuid NOT NULL,
        membership_id uuid NOT NULL,
        joined_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (event_id, membership_id),
        FOREIGN KEY (organization_id, event_id) REFERENCES community_events(organization_id,id),
        FOREIGN KEY (organization_id, membership_id) REFERENCES organization_memberships(organization_id,id)
      );
      CREATE INDEX idx_community_events_member ON community_event_attendance(organization_id,membership_id,event_id);
      ALTER TABLE community_posts ADD COLUMN achievement_id uuid REFERENCES loyalty_ledger(id);
      ALTER TABLE community_posts ADD CONSTRAINT community_achievement_recognition CHECK (achievement_id IS NULL OR post_type='RECOGNITION');
      CREATE UNIQUE INDEX idx_community_shared_achievement ON community_posts (achievement_id);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE community_posts DROP COLUMN achievement_id;
      DROP TABLE community_event_attendance, community_events, community_member_blocks;
    `);
  }
}
