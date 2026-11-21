import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'node:crypto';
import { UserRole } from '@ktb/shared-types';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';

export const COMMUNITY_POST_TYPES = ['ANNOUNCEMENT', 'OPPORTUNITY', 'STORY', 'RECOGNITION'] as const;
export type CommunityPostType = (typeof COMMUNITY_POST_TYPES)[number];

function parseCursor(before?: string): [string | null, string | null] {
  if (before === undefined) return [null, null];
  const parts = /^([\d-]{10}T[\d:]{8}\.\d{6}Z)~([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})$/i.exec(
    before,
  );
  if (!parts?.[1] || !parts[2] || Number.isNaN(Date.parse(parts[1])))
    throw new BadRequestException('Invalid feed cursor');
  return [parts[1], parts[2]];
}

function postPage(rows: (Record<string, unknown> & { cursor_at: string; id: string })[]) {
  const page = rows.slice(0, 20);
  const last = page.at(-1);
  return {
    items: page.map(({ cursor_at: _cursor, ...post }) => post),
    nextCursor: rows.length > 20 && last ? `${last.cursor_at}~${last.id}` : null,
  };
}

@Injectable()
export class CommunityService {
  constructor(
    private readonly db: DataSource,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
  ) {}
  async actor(org: string, user: string) {
    const access = await this.authz.evaluateOrganizationAccess(user, org);
    if (
      !access.membershipId ||
      access.membershipId === 'super-admin-bypass' ||
      access.membershipStatus !== 'APPROVED'
    )
      throw new ForbiddenException('Approved community membership required');
    return access;
  }
  async feed(org: string, user: string, before?: string, type?: CommunityPostType) {
    const actor = await this.actor(org, user);
    return this.published(org, actor.membershipId, before, type);
  }

  async announcements(org: string, user: string, before?: string) {
    const actor = await this.actor(org, user);
    this.requireStaff(actor.roles);
    return this.published(org, actor.membershipId, before, 'ANNOUNCEMENT', true);
  }

  private async published(
    org: string,
    membershipId: string,
    before?: string,
    type?: CommunityPostType,
    staffView = false,
  ) {
    const [date, id] = parseCursor(before);
    const rows = await this.db.query(
      `SELECT p.id,p.post_type,p.body,p.created_at,p.published_at,
      CASE WHEN event.id IS NOT NULL THEN jsonb_build_object('starts_at',event.starts_at,
        'ends_at',event.ends_at,'venue',event.venue,'cancelled_at',event.cancelled_at) END AS event,
      CASE WHEN EXISTS(SELECT 1 FROM community_post_photos ph WHERE ph.post_id=p.id) THEN p.content_version END AS photo_version,
      CASE WHEN m.id<>$2 THEN m.id END AS blockable_member_id,
      CASE WHEN NOT $6::boolean AND m.status='APPROVED' AND u.status='ACTIVE'
        AND visibility.shared_photo_id=u.profile_photo_id
        AND NOT EXISTS(SELECT 1 FROM global_account_restrictions r WHERE r.user_id=u.id AND r.status='ACTIVE')
        THEN u.profile_photo_id END AS author_photo_version,
      CASE WHEN award.id IS NOT NULL THEN jsonb_build_object('name',award.details->>'name',
        'minutes',award.details->'minutes','earned_at',award.created_at,'issuer',organization.name) END AS achievement,
      to_char(p.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,
      CASE WHEN $6::boolean THEN u.full_name
        WHEN m.status='APPROVED' AND u.status='ACTIVE'
          AND NOT EXISTS(SELECT 1 FROM global_account_restrictions r WHERE r.user_id=u.id AND r.status='ACTIVE')
        THEN visibility.display_name END AS author_name,
      reaction_totals.reactions, reaction_totals.reaction_counts,
      EXISTS (SELECT 1 FROM community_post_reports report WHERE report.post_id=p.id AND report.reporter_membership_id=$2) AS my_reported,
      (SELECT r.reaction FROM community_post_reactions r WHERE r.post_id=p.id AND r.membership_id=$2) my_reaction
      FROM community_posts p JOIN organization_memberships m ON m.id=p.author_membership_id AND m.organization_id=p.organization_id
      JOIN users u ON u.id=m.user_id
      JOIN organizations organization ON organization.id=p.organization_id
      LEFT JOIN community_events event ON event.organization_id=p.organization_id AND event.id=p.event_id
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS reactions, jsonb_build_object(
          'SUPPORT', count(*) FILTER (WHERE r.reaction='SUPPORT'),
          'THANKS', count(*) FILTER (WHERE r.reaction='THANKS'),
          'INSPIRED', count(*) FILTER (WHERE r.reaction='INSPIRED')
        ) AS reaction_counts
        FROM community_post_reactions r WHERE r.post_id=p.id
      ) reaction_totals
      LEFT JOIN community_visibility visibility ON visibility.organization_id=p.organization_id AND visibility.membership_id=m.id
      LEFT JOIN loyalty_ledger award ON award.id=p.achievement_id AND award.organization_id=p.organization_id
        AND award.user_id=m.user_id AND award.tx_type='MILESTONE_EARNED'
      LEFT JOIN loyalty_wallets wallet ON wallet.id=award.wallet_id
      WHERE p.organization_id=$1 AND p.status='PUBLISHED'
      AND (p.achievement_id IS NULL OR (award.id IS NOT NULL AND wallet.status='ACTIVE'
        AND m.status='APPROVED' AND u.status='ACTIVE'
        AND wallet.verified_minutes >= (award.details->>'minutes')::bigint))
      AND ($3::timestamptz IS NULL OR (p.published_at,p.id)<($3::timestamptz,$4::uuid))
      AND ($5::varchar IS NULL OR (p.post_type=$5 AND ($5<>'RECOGNITION' OR p.achievement_id IS NOT NULL)))
      AND ($6::boolean OR NOT EXISTS(SELECT 1 FROM community_member_blocks b
        WHERE b.organization_id=p.organization_id AND b.blocker_id=$2 AND b.blocked_id=m.id))
      ORDER BY p.published_at DESC,p.id DESC LIMIT 21`,
      [org, membershipId, date, id, type ?? null, staffView],
    );
    return postPage(rows);
  }
  async myPosts(org: string, user: string, before?: string) {
    const actor = await this.actor(org, user);
    const [date, id] = parseCursor(before);
    return postPage(
      await this.db.query(
        `SELECT p.id,p.post_type,p.body,p.status,p.created_at,p.published_at,p.content_version,
              CASE WHEN EXISTS(SELECT 1 FROM community_post_photos ph WHERE ph.post_id=p.id) THEN p.content_version END AS photo_version,
              (p.post_type IN ('STORY','OPPORTUNITY') AND p.status IN ('PENDING_REVIEW','REJECTED','PUBLISHED')) AS can_withdraw,
              (p.post_type IN ('STORY','OPPORTUNITY') AND p.status='REJECTED') AS can_edit,
              CASE WHEN p.status='REJECTED' THEN p.review_note END AS review_note,
              to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
       FROM community_posts p
       WHERE p.organization_id=$1 AND p.author_membership_id=$2
         AND ($3::timestamptz IS NULL OR (p.created_at,p.id)<($3::timestamptz,$4::uuid))
       ORDER BY p.created_at DESC,p.id DESC LIMIT 21`,
        [org, actor.membershipId, date, id],
      ),
    );
  }

  async pendingPosts(org: string, user: string) {
    const actor = await this.actor(org, user);
    this.requireStaff(actor.roles);
    const rows = await this.db.query(
      `SELECT p.id,p.post_type,p.body,p.created_at,p.content_version,u.full_name AS author_name,
              CASE WHEN EXISTS(SELECT 1 FROM community_post_photos ph WHERE ph.post_id=p.id) THEN p.content_version END AS photo_version,
              (p.author_membership_id=$2) AS is_own_post
       FROM community_posts p
       JOIN organization_memberships m ON m.id=p.author_membership_id
       JOIN users u ON u.id=m.user_id
       WHERE p.organization_id=$1 AND p.status='PENDING_REVIEW'
       ORDER BY p.created_at,p.id LIMIT 101`,
      [org, actor.membershipId],
    );
    return { items: rows.slice(0, 100), hasMore: rows.length > 100 };
  }
  async create(
    org: string,
    user: string,
    dto: { postType: string; body: string; submissionKey?: string },
    staffOnly = false,
    photo?: Buffer,
  ) {
    const a = await this.actor(org, user);
    if (staffOnly) this.requireStaff(a.roles);
    if (!dto.body?.trim()) throw new BadRequestException('Post text is required');
    const staff = a.roles.some((r: UserRole) =>
      [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN].includes(r),
    );
    const status = staff && dto.postType === 'ANNOUNCEMENT' ? 'PUBLISHED' : 'PENDING_REVIEW';
    if (
      !staff &&
      !a.roles.some((role) => [UserRole.VOLUNTEER, UserRole.BENEFICIARY].includes(role))
    )
      throw new ForbiddenException('A volunteer or recipient role is required to submit a post');
    if (!staff && dto.postType === 'ANNOUNCEMENT')
      throw new ForbiddenException('Announcements are reserved for community staff');
    if (photo && !['ANNOUNCEMENT', 'STORY', 'OPPORTUNITY'].includes(dto.postType))
      throw new BadRequestException(
        'Photos are supported on announcements, stories and opportunities',
      );
    const body = dto.body.trim();
    const insertParameters = [
      org,
      a.membershipId,
      dto.postType,
      body,
      status,
      dto.submissionKey ?? null,
    ];
    return this.db.transaction(async (manager) => {
      const [post] = await manager.query(
        `INSERT INTO community_posts(organization_id,author_membership_id,post_type,body,status,published_at,submission_key)
         VALUES($1,$2,$3,$4,$5,CASE WHEN $5::varchar='PUBLISHED' THEN now() END,$6)
         ON CONFLICT (author_membership_id,submission_key) DO NOTHING
         RETURNING id,status,created_at`,
        insertParameters,
      );
      if (!post) {
        const [existing] = await manager.query(
          `SELECT p.id,p.status,p.created_at,p.post_type,p.body,ph.jpeg FROM community_posts p
           LEFT JOIN community_post_photos ph ON ph.post_id=p.id
           WHERE p.organization_id=$1 AND p.author_membership_id=$2 AND p.submission_key=$3`,
          [org, a.membershipId, dto.submissionKey],
        );
        if (
          !existing ||
          existing.post_type !== dto.postType ||
          existing.body !== body ||
          (photo ? !existing.jpeg?.equals(photo) : existing.jpeg !== null)
        )
          throw new ConflictException('This submission key was already used for a different post');
        return { id: existing.id, status: existing.status, created_at: existing.created_at };
      }
      if (photo)
        await manager.query('INSERT INTO community_post_photos(post_id,jpeg) VALUES ($1,$2)', [
          post.id,
          photo,
        ]);
      await this.audit.logEvent(
        {
          eventType: 'COMMUNITY_POST_CREATED',
          actorId: user,
          organizationId: org,
          targetType: 'COMMUNITY_POST',
          targetId: post.id,
          payload: { postType: dto.postType, status },
        },
        manager,
      );
      return post;
    });
  }
  async edit(
    org: string,
    user: string,
    id: string,
    dto: {
      postType: string;
      body: string;
      editKey: string;
      version: number;
      photoAction: 'KEEP' | 'REMOVE' | 'REPLACE';
    },
    photo?: Buffer,
  ) {
    const actor = await this.actor(org, user);
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('Post text is required');
    if ((dto.photoAction === 'REPLACE') !== !!photo)
      throw new BadRequestException('Choose a photo or keep the existing attachment');
    const fingerprint = createHash('sha256').update(
      JSON.stringify([dto.postType, body, dto.photoAction, dto.version]),
    );
    if (photo) fingerprint.update(photo);
    const digest = fingerprint.digest('hex');
    return this.db.transaction(async (manager) => {
      const [post] = await manager.query(
        `SELECT status,content_version,last_edit_key,last_edit_fingerprint
        FROM community_posts WHERE id=$1 AND organization_id=$2 AND author_membership_id=$3
          AND post_type IN ('STORY','OPPORTUNITY') FOR UPDATE`,
        [id, org, actor.membershipId],
      );
      if (!post) throw new NotFoundException('Post not found');
      if (post.last_edit_key === dto.editKey && post.last_edit_fingerprint === digest)
        return { id, status: post.status };
      if (post.status !== 'REJECTED' || post.content_version !== dto.version)
        throw new ConflictException(
          'This post has changed. Refresh My posts to see its current status',
        );
      await manager.query(
        `UPDATE community_posts SET post_type=$2,body=$3,status='PENDING_REVIEW',
        review_note=NULL,reviewed_by_membership_id=NULL,content_version=content_version+1,
        last_edit_key=$4,last_edit_fingerprint=$5,updated_at=now() WHERE id=$1`,
        [id, dto.postType, body, dto.editKey, digest],
      );
      if (dto.photoAction === 'REMOVE')
        await manager.query('DELETE FROM community_post_photos WHERE post_id=$1', [id]);
      if (photo)
        await manager.query(
          `INSERT INTO community_post_photos(post_id,jpeg) VALUES ($1,$2)
        ON CONFLICT (post_id) DO UPDATE SET jpeg=EXCLUDED.jpeg`,
          [id, photo],
        );
      await this.audit.logEvent(
        {
          eventType: 'COMMUNITY_POST_RESUBMITTED',
          organizationId: org,
          actorId: user,
          targetType: 'COMMUNITY_POST',
          targetId: id,
        },
        manager,
      );
      return { id, status: 'PENDING_REVIEW' };
    });
  }

  async withdraw(org: string, user: string, id: string) {
    const actor = await this.actor(org, user);
    return this.db.transaction(async (manager) => {
      const [post] = await manager.query(
        `SELECT status FROM community_posts WHERE id=$1 AND organization_id=$2
        AND author_membership_id=$3 AND post_type IN ('STORY','OPPORTUNITY') FOR UPDATE`,
        [id, org, actor.membershipId],
      );
      if (!post) throw new NotFoundException('Post not found');
      if (post.status === 'ARCHIVED') return { id, status: 'ARCHIVED' };
      if (!['PENDING_REVIEW', 'REJECTED', 'PUBLISHED'].includes(post.status))
        throw new ConflictException('This post has already been removed');
      await manager.query(
        `UPDATE community_posts SET status='ARCHIVED',published_at=NULL,updated_at=now() WHERE id=$1`,
        [id],
      );
      await manager.query('DELETE FROM community_post_photos WHERE post_id=$1', [id]);
      await this.audit.logEvent(
        {
          eventType: 'COMMUNITY_POST_WITHDRAWN',
          organizationId: org,
          actorId: user,
          targetType: 'COMMUNITY_POST',
          targetId: id,
        },
        manager,
      );
      return { id, status: 'ARCHIVED' };
    });
  }

  async photo(org: string, user: string, id: string, version?: number): Promise<Buffer> {
    const actor = await this.actor(org, user);
    const staff = actor.roles.some((role) =>
      [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN].includes(role),
    );
    const [result] = await this.db.query(
      `SELECT ph.jpeg FROM community_post_photos ph
      JOIN community_posts p ON p.id=ph.post_id
      WHERE p.id=$1 AND p.organization_id=$2 AND ($5::int IS NULL OR p.content_version=$5) AND (
        (p.status='PUBLISHED' AND NOT EXISTS(SELECT 1 FROM community_member_blocks b WHERE b.organization_id=$2
          AND b.blocker_id=$3 AND b.blocked_id=p.author_membership_id)) OR
        (p.status IN ('PENDING_REVIEW','REJECTED') AND p.author_membership_id=$3) OR
        (p.status='PENDING_REVIEW' AND $4::boolean))`,
      [id, org, actor.membershipId, staff, version ?? null],
    );
    if (!result) throw new NotFoundException('Photo not found');
    return result.jpeg;
  }
  async moderation(org: string, user: string) {
    const a = await this.actor(org, user);
    this.requireStaff(a.roles);
    return {
      posts: await this.db.query(
        `SELECT p.id,p.post_type,p.body,p.created_at,u.full_name author_name,
      (SELECT count(*)::int FROM community_post_reports r WHERE r.post_id=p.id AND r.status='OPEN') reports
      FROM community_posts p JOIN organization_memberships m ON m.id=p.author_membership_id JOIN users u ON u.id=m.user_id
      WHERE p.organization_id=$1 AND (p.status='PENDING_REVIEW' OR EXISTS(SELECT 1 FROM community_post_reports r WHERE r.post_id=p.id AND r.status='OPEN'))
      ORDER BY p.created_at ASC LIMIT 100`,
        [org],
      ),
    };
  }
  async reports(org: string, user: string) {
    const actor = await this.actor(org, user);
    this.requireStaff(actor.roles);
    const rows = await this.db.query(
      `SELECT report.id,report.reason,report.details,report.created_at,
              post.id AS post_id,post.body AS post_body,post.status AS post_status
       FROM community_post_reports report
       JOIN community_posts post ON post.id=report.post_id
       WHERE post.organization_id=$1 AND report.status='OPEN'
       ORDER BY report.created_at,report.id LIMIT 101`,
      [org],
    );
    return { items: rows.slice(0, 100), hasMore: rows.length > 100 };
  }

  async decideReport(
    org: string,
    reportId: string,
    user: string,
    dto: { decision: 'DISMISS' | 'REMOVE_POST'; note: string },
  ) {
    const actor = await this.actor(org, user);
    this.requireStaff(actor.roles);
    const note = dto.note.trim();
    if (!note) throw new BadRequestException('Enter a reason for this decision');
    return this.db.transaction(async (manager) => {
      // Lock the post first, in the same order as report submission and removal.
      const [post] = await manager.query(
        `SELECT post.id,post.status FROM community_posts post
         JOIN community_post_reports report ON report.post_id=post.id
         WHERE post.organization_id=$1 AND report.id=$2 FOR UPDATE OF post`,
        [org, reportId],
      );
      if (!post) throw new NotFoundException('Report not found');
      const remove = dto.decision === 'REMOVE_POST';
      if (remove && post.status !== 'PUBLISHED') {
        throw new ConflictException(
          'This post is already out of the feed. Review and dismiss the report to close it.',
        );
      }
      const [report] = await manager.query(
        `WITH decided AS (
           UPDATE community_post_reports
           SET status=$3,reviewed_by_membership_id=$4,reviewed_at=now(),decision_note=$5
           WHERE post_id=$1 AND id=$2 AND status='OPEN' RETURNING id,status
         ) SELECT id,status FROM decided`,
        [post.id, reportId, remove ? 'REVIEWED' : 'DISMISSED', actor.membershipId, note],
      );
      if (!report) throw new ConflictException('This report has already been decided');
      if (remove) {
        await manager.query(
          `UPDATE community_posts SET status='REMOVED', published_at=NULL,
                  reviewed_by_membership_id=$2, review_note=$3, updated_at=now()
           WHERE id=$1`,
          [post.id, actor.membershipId, note],
        );
        await manager.query(
          `UPDATE community_post_reports
           SET status='REVIEWED', reviewed_by_membership_id=$2, reviewed_at=now(), decision_note=$3
           WHERE post_id=$1 AND status='OPEN'`,
          [post.id, actor.membershipId, note],
        );
      }
      await this.audit.logEvent(
        {
          eventType: 'COMMUNITY_REPORT_DECIDED',
          actorId: user,
          organizationId: org,
          targetType: 'COMMUNITY_POST_REPORT',
          targetId: reportId,
          payload: { postId: post.id, decision: dto.decision },
        },
        manager,
      );
      return report;
    });
  }
  async review(
    org: string,
    post: string,
    user: string,
    dto: { status: string; note?: string; version?: number },
    announcementsOnly = false,
  ) {
    const a = await this.actor(org, user);
    this.requireStaff(a.roles);
    const note = dto.note?.trim() || null;
    if (dto.status === 'REJECTED' && !note)
      throw new BadRequestException('Enter feedback for the member before declining this post');
    return this.db.transaction(async (manager) => {
      const [updated] = await manager.query(
        `WITH reviewed AS (
           UPDATE community_posts
           SET status=$3,reviewed_by_membership_id=$4,review_note=$5,updated_at=now(),
               published_at=CASE WHEN $3::varchar='PUBLISHED' THEN now() ELSE NULL END
           WHERE id=$1 AND organization_id=$2
             AND (NOT $6::boolean OR post_type='ANNOUNCEMENT')
             AND ((status='PENDING_REVIEW' AND $3::varchar IN ('PUBLISHED','REJECTED') AND author_membership_id<>$4
                   AND content_version=coalesce($7::int,1))
                  OR (status='PUBLISHED' AND $3::varchar='REMOVED'))
           RETURNING id,status
         ) SELECT id,status FROM reviewed`,
        [post, org, dto.status, a.membershipId, note, announcementsOnly, dto.version ?? null],
      );
      if (!updated) throw new NotFoundException('Post not found or no longer reviewable');
      await this.audit.logEvent(
        {
          eventType: `COMMUNITY_POST_${dto.status}`,
          actorId: user,
          organizationId: org,
          targetType: 'COMMUNITY_POST',
          targetId: post,
        },
        manager,
      );
      return updated;
    });
  }
  async react(org: string, post: string, user: string, reaction: string | null) {
    const a = await this.actor(org, user);
    return this.db.transaction(async (manager) => {
      const [published] = await manager.query(
        `SELECT p.id FROM community_posts p WHERE p.id=$1 AND p.organization_id=$2 AND p.status='PUBLISHED'
         AND NOT EXISTS(SELECT 1 FROM community_member_blocks b WHERE b.organization_id=$2
           AND b.blocker_id=$3 AND b.blocked_id=p.author_membership_id) FOR UPDATE`,
        [post, org, a.membershipId],
      );
      if (!published) throw new NotFoundException('Post not found');
      if (reaction === null) {
        await manager.query(
          'DELETE FROM community_post_reactions WHERE post_id=$1 AND membership_id=$2',
          [post, a.membershipId],
        );
      } else {
        await manager.query(
          `INSERT INTO community_post_reactions(post_id,membership_id,reaction) VALUES($1,$2,$3)
           ON CONFLICT(post_id,membership_id) DO UPDATE SET reaction=EXCLUDED.reaction,created_at=now()
           WHERE community_post_reactions.reaction IS DISTINCT FROM EXCLUDED.reaction`,
          [post, a.membershipId, reaction],
        );
      }
      const [total] = await manager.query(
        `SELECT count(*)::int AS reactions, jsonb_build_object(
        'SUPPORT', count(*) FILTER (WHERE reaction='SUPPORT'),
        'THANKS', count(*) FILTER (WHERE reaction='THANKS'),
        'INSPIRED', count(*) FILTER (WHERE reaction='INSPIRED')
      ) AS reaction_counts
         FROM community_post_reactions WHERE post_id=$1`,
        [post],
      );
      return {
        ok: true,
        my_reaction: reaction,
        reactions: total.reactions,
        reaction_counts: total.reaction_counts,
      };
    });
  }
  async report(org: string, post: string, user: string, dto: { reason: string; details?: string }) {
    const a = await this.actor(org, user);
    return this.db.transaction(async (manager) => {
      const [published] = await manager.query(
        `SELECT id FROM community_posts WHERE id=$1 AND organization_id=$2 AND status='PUBLISHED' FOR UPDATE`,
        [post, org],
      );
      if (!published) throw new NotFoundException('Post not found');
      const [report] = await manager.query(
        `INSERT INTO community_post_reports(post_id,reporter_membership_id,reason,details) VALUES($1,$2,$3,$4)
         ON CONFLICT(post_id,reporter_membership_id) DO NOTHING RETURNING id`,
        [post, a.membershipId, dto.reason, dto.details?.trim() || null],
      );
      if (report) {
        await this.audit.logEvent(
          {
            eventType: 'COMMUNITY_POST_REPORTED',
            actorId: user,
            organizationId: org,
            targetType: 'COMMUNITY_POST',
            targetId: post,
            payload: { reason: dto.reason },
          },
          manager,
        );
      }
      return { ok: true };
    });
  }
  requireStaff(roles: UserRole[]) {
    if (
      !roles.some((r) =>
        [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN].includes(r),
      )
    )
      throw new ForbiddenException('Community moderation staff required');
  }
}
