import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CommunityService } from './community.service';

export interface NewCommunityEvent {
  id: string;
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  capacity?: number;
}

@Injectable()
export class CommunityParticipationService {
  constructor(
    private readonly db: DataSource,
    private readonly community: CommunityService,
    private readonly audit: AuditService,
  ) {}

  async blocks(org: string, user: string) {
    const actor = await this.community.actor(org, user);
    const items = await this.db.query(
      `SELECT b.blocked_id AS id, v.display_name AS name, b.created_at
       FROM community_member_blocks b
       JOIN organization_memberships m ON m.organization_id=b.organization_id AND m.id=b.blocked_id
       LEFT JOIN community_visibility v ON v.organization_id=m.organization_id AND v.membership_id=m.id
       WHERE b.organization_id=$1 AND b.blocker_id=$2 ORDER BY b.created_at DESC,b.blocked_id`,
      [org, actor.membershipId],
    );
    return { items };
  }

  async setBlock(org: string, user: string, member: string, block: boolean) {
    const actor = await this.community.actor(org, user);
    if (member === actor.membershipId) throw new BadRequestException('You cannot block yourself');
    if (block) {
      const [target] = await this.db.query(
        `SELECT id FROM organization_memberships WHERE organization_id=$1 AND id=$2
         AND EXISTS(SELECT 1 FROM community_posts WHERE organization_id=$1
           AND author_membership_id=$2 AND status='PUBLISHED')`,
        [org, member],
      );
      if (!target) throw new NotFoundException('Community member not found');
      await this.db.query(
        'INSERT INTO community_member_blocks(organization_id,blocker_id,blocked_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [org, actor.membershipId, member],
      );
    } else {
      await this.db.query(
        'DELETE FROM community_member_blocks WHERE organization_id=$1 AND blocker_id=$2 AND blocked_id=$3',
        [org, actor.membershipId, member],
      );
    }
    return { ok: true };
  }

  async events(org: string, user: string, view: 'upcoming' | 'mine' | 'staff', offset: number) {
    const actor = await this.community.actor(org, user);
    if (view === 'staff') this.community.requireStaff(actor.roles);
    const rows = await this.db.query(
      `SELECT e.id,e.title,e.description,e.venue,e.starts_at,e.ends_at,e.capacity,e.cancelled_at,
        e.cancellation_reason,(e.starts_at>now() AND e.cancelled_at IS NULL) AS can_join,
        EXISTS(SELECT 1 FROM community_event_attendance a WHERE a.event_id=e.id AND a.membership_id=$2) AS joined,
        (SELECT count(*)::int FROM community_event_attendance a WHERE a.event_id=e.id) AS attendees
       FROM community_events e WHERE e.organization_id=$1
         AND ($3::text<>'upcoming' OR (e.cancelled_at IS NULL AND e.ends_at>now()))
         AND ($3::text<>'mine' OR EXISTS(SELECT 1 FROM community_event_attendance a WHERE a.event_id=e.id AND a.membership_id=$2))
       ORDER BY CASE WHEN $3::text='upcoming' THEN e.starts_at END,
         CASE WHEN $3::text<>'upcoming' THEN e.starts_at END DESC,e.id LIMIT 21 OFFSET $4`,
      [org, actor.membershipId, view, offset],
    );
    return { items: rows.slice(0, 20), nextOffset: rows.length > 20 ? offset + 20 : null };
  }

  async publishEvent(org: string, user: string, dto: NewCommunityEvent) {
    const actor = await this.community.actor(org, user);
    this.community.requireStaff(actor.roles);
    const title = dto.title.trim(),
      description = dto.description.trim(),
      venue = dto.venue.trim();
    if (!title || !description || !venue)
      throw new BadRequestException('Enter a title, description and venue');
    const starts = new Date(dto.startsAt),
      ends = new Date(dto.endsAt);
    if (starts >= ends) throw new BadRequestException('The event must end after it starts');
    return this.db.transaction(async (manager) => {
      const [created] = await manager.query(
        `INSERT INTO community_events(id,organization_id,organizer_id,title,description,venue,starts_at,ends_at,capacity)
         SELECT $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9::integer WHERE $7::timestamptz>now()
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [
          dto.id,
          org,
          actor.membershipId,
          title,
          description,
          venue,
          starts,
          ends,
          dto.capacity ?? null,
        ],
      );
      if (!created) {
        const [same] = await manager.query(
          `SELECT id FROM community_events WHERE id=$1 AND organization_id=$2 AND organizer_id=$3
           AND title=$4 AND description=$5 AND venue=$6 AND starts_at=$7 AND ends_at=$8
           AND capacity IS NOT DISTINCT FROM $9::integer`,
          [
            dto.id,
            org,
            actor.membershipId,
            title,
            description,
            venue,
            starts,
            ends,
            dto.capacity ?? null,
          ],
        );
        if (same) return same;
        if (starts.getTime() <= Date.now())
          throw new BadRequestException('Choose a future start time');
        throw new ConflictException('This event has already been submitted');
      }
      await this.audit.logEvent(
        {
          eventType: 'COMMUNITY_EVENT_PUBLISHED',
          actorId: user,
          organizationId: org,
          targetType: 'COMMUNITY_EVENT',
          targetId: created.id,
        },
        manager,
      );
      return created;
    });
  }

  async cancelEvent(org: string, user: string, id: string, reason: string) {
    const actor = await this.community.actor(org, user);
    this.community.requireStaff(actor.roles);
    if (!reason.trim()) throw new BadRequestException('Enter a cancellation reason');
    return this.db.transaction(async (manager) => {
      const [event] = await manager.query(
        'SELECT cancelled_at,ends_at>now() AS active FROM community_events WHERE organization_id=$1 AND id=$2 FOR UPDATE',
        [org, id],
      );
      if (!event) throw new NotFoundException('Event not found');
      if (event.cancelled_at) return { ok: true };
      if (!event.active) throw new ConflictException('This event has already ended');
      await manager.query(
        'UPDATE community_events SET cancelled_at=now(), cancellation_reason=$2 WHERE id=$1',
        [id, reason.trim()],
      );
      await this.audit.logEvent(
        {
          eventType: 'COMMUNITY_EVENT_CANCELLED',
          actorId: user,
          organizationId: org,
          targetType: 'COMMUNITY_EVENT',
          targetId: id,
        },
        manager,
      );
      return { ok: true };
    });
  }

  async attendance(org: string, user: string, id: string, join: boolean) {
    const actor = await this.community.actor(org, user);
    return this.db.transaction(async (manager) => {
      const [event] = await manager.query(
        'SELECT capacity,cancelled_at,starts_at>clock_timestamp() AS can_join FROM community_events WHERE organization_id=$1 AND id=$2 FOR UPDATE',
        [org, id],
      );
      if (!event) throw new NotFoundException('Event not found');
      if (!join) {
        await manager.query(
          'DELETE FROM community_event_attendance WHERE event_id=$1 AND membership_id=$2',
          [id, actor.membershipId],
        );
        return { joined: false };
      }
      if (event.cancelled_at || !event.can_join)
        throw new ConflictException('Sign-ups for this event are closed');
      const [count] = await manager.query(
        `SELECT count(*)::int AS attendees,coalesce(bool_or(membership_id=$2),false) AS joined
         FROM community_event_attendance WHERE event_id=$1`,
        [id, actor.membershipId],
      );
      if (count.joined) return { joined: true };
      if (event.capacity !== null && count.attendees >= event.capacity)
        throw new ConflictException('This event is full');
      await manager.query(
        'INSERT INTO community_event_attendance(organization_id,event_id,membership_id) VALUES($1,$2,$3)',
        [org, id, actor.membershipId],
      );
      return { joined: true };
    });
  }

  async shareAchievement(org: string, user: string, award: string, share: boolean) {
    const actor = await this.community.actor(org, user);
    return this.db.transaction(async (manager) => {
      // The ledger row is immutable. Locking it serializes repeated share and withdrawal requests.
      const [achievement] = await manager.query(
        `SELECT l.details->>'name' AS name, w.status='ACTIVE' AND
           w.verified_minutes >= (l.details->>'minutes')::bigint AS eligible
         FROM loyalty_ledger l JOIN loyalty_wallets w ON w.id=l.wallet_id
         WHERE l.id=$1 AND l.organization_id=$2 AND l.user_id=$3 AND l.tx_type='MILESTONE_EARNED'
         FOR UPDATE OF l`,
        [award, org, user],
      );
      if (!achievement) throw new NotFoundException('Achievement not found');
      if (share && !achievement.eligible)
        throw new ConflictException('This achievement is unavailable for sharing');
      const [existing] = await manager.query(
        'SELECT id,status FROM community_posts WHERE achievement_id=$1 FOR UPDATE',
        [award],
      );
      if (share && existing?.status === 'REMOVED')
        throw new ConflictException('Community staff removed this achievement post');
      let postId: string | undefined;
      if (share && !existing) {
        const [post] = await manager.query(
          `INSERT INTO community_posts(organization_id,author_membership_id,post_type,body,status,published_at,achievement_id)
           VALUES($1,$2,'RECOGNITION','Earned a verified volunteering achievement.','PUBLISHED',now(),$3) RETURNING id`,
          [org, actor.membershipId, award],
        );
        postId = post.id;
      } else if (existing?.status === (share ? 'ARCHIVED' : 'PUBLISHED')) {
        await manager.query(
          'UPDATE community_posts SET status=$2,published_at=CASE WHEN $3 THEN now() ELSE NULL END,updated_at=now() WHERE id=$1',
          [existing.id, share ? 'PUBLISHED' : 'ARCHIVED', share],
        );
        postId = existing.id;
      }
      if (postId)
        await this.audit.logEvent(
          {
            eventType: share ? 'COMMUNITY_ACHIEVEMENT_SHARED' : 'COMMUNITY_ACHIEVEMENT_WITHDRAWN',
            actorId: user,
            organizationId: org,
            targetType: 'COMMUNITY_POST',
            targetId: postId,
          },
          manager,
        );
      return { shared: share };
    });
  }
}
