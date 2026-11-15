import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommunityFeed1729118400030 implements MigrationInterface {
  name = 'CommunityFeed1729118400030';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE community_posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        author_membership_id UUID NOT NULL REFERENCES organization_memberships(id) ON DELETE RESTRICT,
        post_type VARCHAR(20) NOT NULL CHECK (post_type IN ('ANNOUNCEMENT','OPPORTUNITY','STORY','RECOGNITION')),
        body VARCHAR(2000) NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('PENDING_REVIEW','PUBLISHED','REJECTED','REMOVED','ARCHIVED')),
        audience VARCHAR(20) NOT NULL DEFAULT 'MEMBERS' CHECK (audience='MEMBERS'),
        media_key VARCHAR(500),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        published_at TIMESTAMPTZ,
        reviewed_by_membership_id UUID REFERENCES organization_memberships(id) ON DELETE RESTRICT,
        review_note VARCHAR(500),
        CONSTRAINT fk_community_post_author_org FOREIGN KEY (organization_id,author_membership_id) REFERENCES organization_memberships(organization_id,id) ON DELETE RESTRICT,
        CONSTRAINT fk_community_post_reviewer_org FOREIGN KEY (organization_id,reviewed_by_membership_id) REFERENCES organization_memberships(organization_id,id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_community_feed ON community_posts(organization_id,published_at DESC,id DESC) WHERE status='PUBLISHED';
      CREATE INDEX idx_community_review ON community_posts(organization_id,created_at DESC) WHERE status='PENDING_REVIEW';
      CREATE TABLE community_post_reactions (
        post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
        membership_id UUID NOT NULL REFERENCES organization_memberships(id) ON DELETE CASCADE,
        reaction VARCHAR(12) NOT NULL CHECK (reaction IN ('SUPPORT','THANKS','INSPIRED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY(post_id,membership_id)
      );
      CREATE TABLE community_post_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
        reporter_membership_id UUID NOT NULL REFERENCES organization_memberships(id) ON DELETE RESTRICT,
        reason VARCHAR(30) NOT NULL CHECK (reason IN ('INAPPROPRIATE','PRIVACY','MISLEADING','HARASSMENT','OTHER')),
        details VARCHAR(500), status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','REVIEWED','DISMISSED')),
        reviewed_by_membership_id UUID REFERENCES organization_memberships(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), reviewed_at TIMESTAMPTZ,
        UNIQUE(post_id,reporter_membership_id),
        FOREIGN KEY(reporter_membership_id) REFERENCES organization_memberships(id) ON DELETE RESTRICT
      );
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP TABLE IF EXISTS community_post_reports, community_post_reactions, community_posts',
    );
  }
}
