import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { prepareProfilePhoto } from '../identity/profile-photo.service';
import { TimeLedgerService } from '../time-ledger/time-ledger.service';
import { CommunityService } from './community.service';

export interface NewCommunityEvent {
  id: string;
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  capacity?: number;
  /** Members earn time credits once staff confirm their attendance. */
  earnsCredits?: boolean;
  /** Where members check in. Required when the event earns credits. */
  latitude?: number;
  longitude?: number;
  /** How close a member must be to check in. */
  checkInRadiusMeters?: number;
}

export interface EventCheckIn {
  latitude: number;
  longitude: number;
  /** The phone's reported accuracy, in metres. */
  accuracyMeters?: number;
  /** The secret from the organiser's QR code (64 hex characters). */
  code: string;
}

/** What the venue QR code says: the event it is for, then its secret. */
export const eventCheckInCode = (eventId: string, token: string) => `ktb-event:${eventId}:${token}`;

/** Compares the scanned secret with the stored one without revealing how much matched. */
export function sameToken(given: unknown, stored: unknown): boolean {
  if (typeof given !== 'string' || typeof stored !== 'string') return false;
  if (!/^[0-9a-f]{64}$/.test(given) || !/^[0-9a-f]{64}$/.test(stored)) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(stored));
}

/** Great-circle distance in metres between two coordinates. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * The most minutes a checked-in member can be credited: from when they checked in
 * (or the start, if earlier) until the event ended, capped at one day.
 */
export function attendanceLimitMinutes(startsAt: Date, endsAt: Date, checkedInAt: Date): number {
  const from = Math.max(startsAt.getTime(), checkedInAt.getTime());
  return Math.max(0, Math.min(1440, Math.floor((endsAt.getTime() - from) / 60000)));
}

@Injectable()
export class CommunityParticipationService {
  constructor(
    private readonly db: DataSource,
    private readonly community: CommunityService,
    private readonly audit: AuditService,
    private readonly ledger: TimeLedgerService,
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
        e.earns_credits,e.location_lat AS latitude,e.location_lng AS longitude,
        (SELECT p.version FROM community_event_photos p WHERE p.event_id=e.id) AS photo_version,
        e.checkin_radius_m AS checkin_radius_meters,
        CASE WHEN e.cancelled_at IS NOT NULL THEN 'CANCELLED'
          WHEN now()<e.starts_at THEN 'UPCOMING'
          WHEN now()<e.ends_at THEN 'LIVE' ELSE 'ENDED' END AS phase,
        (e.earns_credits AND e.location_lat IS NOT NULL AND e.cancelled_at IS NULL
          AND now()>=e.starts_at AND now()<e.ends_at) AS can_check_in,
        EXISTS(SELECT 1 FROM community_event_attendance a WHERE a.event_id=e.id AND a.membership_id=$2) AS joined,
        (SELECT count(*)::int FROM community_event_attendance a
          WHERE a.event_id=e.id AND a.checked_in_at IS NOT NULL) AS checked_in_attendees,
        mine.checked_in_at AS my_checked_in_at,
        (SELECT count(*)::int FROM community_event_attendance a WHERE a.event_id=e.id) AS attendees,
        (SELECT count(*)::int FROM community_event_attendance a
          WHERE a.event_id=e.id AND a.confirmed_at IS NOT NULL) AS confirmed_attendees,
        mine.attended_minutes AS my_attended_minutes,
        mine.confirmed_at AS my_confirmed_at,
        earned.amount AS my_credits_earned,
        earned.held AS my_credits_held
       FROM community_events e
       LEFT JOIN community_event_attendance mine ON mine.event_id=e.id AND mine.membership_id=$2
       LEFT JOIN LATERAL (
         SELECT l.amount, l.held FROM time_credit_ledger l
         JOIN universal_time_wallets w ON w.id=l.wallet_id
         WHERE l.community_event_id=e.id AND l.tx_type='EVENT_EARNED' AND w.user_id=$5
       ) earned ON true
       WHERE e.organization_id=$1
         AND ($3::text<>'upcoming' OR (e.cancelled_at IS NULL AND e.ends_at>now()))
         AND ($3::text<>'mine' OR EXISTS(SELECT 1 FROM community_event_attendance a WHERE a.event_id=e.id AND a.membership_id=$2))
       ORDER BY CASE WHEN $3::text='upcoming' THEN e.starts_at END,
         CASE WHEN $3::text<>'upcoming' THEN e.starts_at END DESC,e.id LIMIT 21 OFFSET $4`,
      [org, actor.membershipId, view, offset, user],
    );
    const items = rows.slice(0, 20).map((row: Record<string, unknown>) => ({
      ...row,
      my_credits_earned: row.my_credits_earned == null ? null : Number(row.my_credits_earned),
    }));
    return { items, nextOffset: rows.length > 20 ? offset + 20 : null };
  }

  async publishEvent(
    org: string,
    user: string,
    dto: NewCommunityEvent,
    upload?: { buffer: Buffer },
  ) {
    const actor = await this.community.actor(org, user);
    this.community.requireStaff(actor.roles);
    // Only staff reach image processing. It re-encodes to JPEG and drops location metadata.
    const photo = upload ? await prepareProfilePhoto(upload.buffer, true) : undefined;
    const photoHash = photo ? createHash('sha256').update(photo).digest('hex') : null;
    const title = dto.title.trim(),
      description = dto.description.trim(),
      venue = dto.venue.trim();
    if (!title || !description || !venue)
      throw new BadRequestException('Enter a title, description and venue');
    const starts = new Date(dto.startsAt),
      ends = new Date(dto.endsAt);
    if (starts >= ends) throw new BadRequestException('The event must end after it starts');
    const earns = dto.earnsCredits === true;
    const hasLocation = dto.latitude != null || dto.longitude != null;
    if (hasLocation && (dto.latitude == null || dto.longitude == null))
      throw new BadRequestException('Enter both the latitude and longitude of the event');
    // Credits depend on proving presence, so a credit-earning event needs a check-in point.
    if (earns && !hasLocation)
      throw new BadRequestException('Add the event location so members can check in');
    const radius = dto.checkInRadiusMeters ?? 200;
    const values = [
      dto.id,
      org,
      actor.membershipId,
      title,
      description,
      venue,
      starts,
      ends,
      dto.capacity ?? null,
      earns,
      dto.latitude ?? null,
      dto.longitude ?? null,
      radius,
    ];
    return this.db.transaction(async (manager) => {
      const [created] = await manager.query(
        `INSERT INTO community_events(id,organization_id,organizer_id,title,description,venue,starts_at,ends_at,capacity,
           earns_credits,location_lat,location_lng,checkin_radius_m)
         SELECT $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::timestamptz,$8::timestamptz,$9::integer,$10::boolean,
           $11::double precision,$12::double precision,$13::integer WHERE $7::timestamptz>now()
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        values,
      );
      if (!created) {
        // A retried publish must carry the same details and the same image (or none).
        const [same] = await manager.query(
          `SELECT id FROM community_events e WHERE id=$1 AND organization_id=$2 AND organizer_id=$3
           AND title=$4 AND description=$5 AND venue=$6 AND starts_at=$7 AND ends_at=$8
           AND capacity IS NOT DISTINCT FROM $9::integer AND earns_credits=$10::boolean
           AND location_lat IS NOT DISTINCT FROM $11::double precision
           AND location_lng IS NOT DISTINCT FROM $12::double precision AND checkin_radius_m=$13::integer
           AND (SELECT p.sha256 FROM community_event_photos p WHERE p.event_id=e.id)
             IS NOT DISTINCT FROM $14::text`,
          [...values, photoHash],
        );
        if (same) return same;
        if (starts.getTime() <= Date.now())
          throw new BadRequestException('Choose a future start time');
        throw new ConflictException('This event has already been submitted');
      }
      if (photo && photoHash)
        await manager.query(
          'INSERT INTO community_event_photos(event_id,jpeg,sha256) VALUES($1,$2,$3)',
          [created.id, photo, photoHash],
        );
      await this.audit.logEvent(
        {
          eventType: 'COMMUNITY_EVENT_PUBLISHED',
          actorId: user,
          organizationId: org,
          targetType: 'COMMUNITY_EVENT',
          targetId: created.id,
          payload: {
            earnsCredits: earns,
            checkInRadiusMeters: hasLocation ? radius : null,
            hasPhoto: photo !== undefined,
          },
        },
        manager,
      );
      return created;
    });
  }

  /** The event's cover image, for approved members of the event's own community. */
  async eventPhoto(org: string, user: string, id: string): Promise<Buffer> {
    await this.community.actor(org, user);
    const [row] = await this.db.query(
      `SELECT p.jpeg FROM community_event_photos p
       JOIN community_events e ON e.id=p.event_id
       WHERE e.organization_id=$1 AND e.id=$2`,
      [org, id],
    );
    if (!row) throw new NotFoundException('Event photo not found');
    return row.jpeg as Buffer;
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
        // Confirmed attendance is a paid record and must stay in place.
        const [confirmed] = await manager.query(
          'SELECT 1 FROM community_event_attendance WHERE event_id=$1 AND membership_id=$2 AND confirmed_at IS NOT NULL',
          [id, actor.membershipId],
        );
        if (confirmed)
          throw new ConflictException('Your attendance is already confirmed for this event');
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

  /**
   * A member checks in by scanning the organiser's QR code at the venue while the event runs.
   * Three things are proved: the code belongs to this event, the phone is within range of the
   * check-in point (the server measures the distance itself, allowing for the phone's reported
   * accuracy up to 100 metres), and the event is running. A member who has not signed up yet
   * joins on the spot, if there is room. Check-in happens once and cannot be undone.
   */
  async checkIn(org: string, user: string, id: string, position: EventCheckIn) {
    const actor = await this.community.actor(org, user);
    return this.db.transaction(async (manager) => {
      // Locked like sign-up is, so a walk-in and a sign-up cannot both take the last place.
      const [event] = await manager.query(
        `SELECT earns_credits,cancelled_at,location_lat,location_lng,checkin_radius_m,capacity,checkin_token,
          now()>=starts_at AS started, now()<ends_at AS running
         FROM community_events WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
        [org, id],
      );
      if (!event) throw new NotFoundException('Event not found');
      if (!event.earns_credits || event.location_lat == null)
        throw new ConflictException('This event does not use check-in');
      if (event.cancelled_at) throw new ConflictException('This event was cancelled');
      if (!event.started) throw new ConflictException('Check-in opens when the event starts');
      if (!event.running) throw new ConflictException('This event has ended');
      if (!sameToken(position.code, event.checkin_token))
        throw new ForbiddenException(
          'That QR code is not for this event. Scan the organiser’s code.',
        );

      const [attendance] = await manager.query(
        `SELECT checked_in_at FROM community_event_attendance
         WHERE organization_id=$1 AND event_id=$2 AND membership_id=$3 FOR UPDATE`,
        [org, id, actor.membershipId],
      );
      if (attendance?.checked_in_at)
        return { checkedIn: true, checkedInAt: attendance.checked_in_at, replayed: true };

      const distance = Math.round(
        distanceMeters(
          Number(event.location_lat),
          Number(event.location_lng),
          position.latitude,
          position.longitude,
        ),
      );
      // Allow for GPS error, but never more than 100 m, so a poor fix cannot stretch the range.
      const slack = Math.min(100, Math.max(0, Math.round(position.accuracyMeters ?? 0)));
      if (distance > event.checkin_radius_m + slack)
        throw new ForbiddenException(
          `You are about ${distance} m from the event. Move within ${event.checkin_radius_m} m to check in.`,
        );

      const accuracy = position.accuracyMeters == null ? null : Math.round(position.accuracyMeters);
      let checkedInAt: unknown;
      if (attendance) {
        // UPDATE … RETURNING yields [rows, affectedCount] from TypeORM's Postgres driver.
        const [savedRows] = await manager.query(
          `UPDATE community_event_attendance SET checked_in_at=now(), checkin_lat=$4, checkin_lng=$5,
             checkin_accuracy_m=$6, checkin_distance_m=$7
           WHERE organization_id=$1 AND event_id=$2 AND membership_id=$3 RETURNING checked_in_at`,
          [org, id, actor.membershipId, position.latitude, position.longitude, accuracy, distance],
        );
        checkedInAt = savedRows[0]?.checked_in_at ?? null;
      } else {
        const [count] = await manager.query(
          'SELECT count(*)::int AS attendees FROM community_event_attendance WHERE event_id=$1',
          [id],
        );
        if (event.capacity !== null && count.attendees >= event.capacity)
          throw new ConflictException('This event is full');
        const [joined] = await manager.query(
          `INSERT INTO community_event_attendance(organization_id,event_id,membership_id,checked_in_at,
             checkin_lat,checkin_lng,checkin_accuracy_m,checkin_distance_m)
           VALUES($1,$2,$3,now(),$4,$5,$6,$7) RETURNING checked_in_at`,
          [org, id, actor.membershipId, position.latitude, position.longitude, accuracy, distance],
        );
        checkedInAt = joined?.checked_in_at ?? null;
      }
      await this.audit.logEvent(
        {
          eventType: 'COMMUNITY_EVENT_CHECKED_IN',
          actorId: user,
          organizationId: org,
          targetType: 'COMMUNITY_EVENT',
          targetId: id,
          payload: {
            membershipId: actor.membershipId,
            distanceMeters: distance,
            method: 'QR',
            joinedOnSpot: !attendance,
          },
        },
        manager,
      );
      return { checkedIn: true, checkedInAt, distanceMeters: distance, joinedOnSpot: !attendance };
    });
  }

  /**
   * The QR code staff show at the venue. The secret in it is only ever returned here, to staff,
   * and only while the event can still be checked in to.
   */
  async checkInQr(org: string, user: string, id: string) {
    const actor = await this.community.actor(org, user);
    this.community.requireStaff(actor.roles);
    const [event] = await this.db.query(
      `SELECT id,title,venue,earns_credits,location_lat,checkin_radius_m,checkin_token,
        cancelled_at IS NOT NULL AS cancelled, ends_at<=now() AS ended
       FROM community_events WHERE organization_id=$1 AND id=$2`,
      [org, id],
    );
    if (!event) throw new NotFoundException('Event not found');
    if (!event.earns_credits || event.location_lat == null)
      throw new ConflictException('This event does not use check-in');
    if (event.cancelled) throw new ConflictException('This event was cancelled');
    if (event.ended) throw new ConflictException('This event has ended');
    const code = eventCheckInCode(event.id, event.checkin_token);
    return {
      code,
      qrSvg: await QRCode.toString(code, { type: 'svg', margin: 4 }),
      title: event.title,
      venue: event.venue,
      radiusMeters: event.checkin_radius_m,
    };
  }

  /** Staff see who signed up, who checked in, each person's limit, and what was paid. */
  async eventAttendees(org: string, user: string, id: string) {
    const actor = await this.community.actor(org, user);
    this.community.requireStaff(actor.roles);
    const [event] = await this.db.query(
      `SELECT id,earns_credits,starts_at,ends_at,ends_at<=now() AS ended,
        cancelled_at IS NOT NULL AS cancelled,location_lat IS NOT NULL AS has_location,checkin_radius_m
       FROM community_events WHERE organization_id=$1 AND id=$2`,
      [org, id],
    );
    if (!event) throw new NotFoundException('Event not found');
    const rows = await this.db.query(
      `SELECT a.membership_id AS "membershipId", m.membership_number AS "membershipNumber",
        COALESCE(NULLIF(u.full_name,''),'Member') AS name, a.joined_at AS "joinedAt",
        a.checked_in_at AS "checkedInAt", a.checkin_distance_m AS "checkInDistanceMeters",
        a.attended_minutes AS "attendedMinutes", a.confirmed_at AS "confirmedAt",
        l.amount AS "creditsEarned", l.held AS "creditsHeld"
       FROM community_event_attendance a
       JOIN organization_memberships m ON m.organization_id=a.organization_id AND m.id=a.membership_id
       JOIN users u ON u.id=m.user_id
       LEFT JOIN universal_time_wallets w ON w.user_id=u.id
       LEFT JOIN time_credit_ledger l ON l.community_event_id=a.event_id AND l.wallet_id=w.id
         AND l.tx_type='EVENT_EARNED'
       WHERE a.organization_id=$1 AND a.event_id=$2
       ORDER BY a.checked_in_at NULLS LAST,a.joined_at,a.membership_id`,
      [org, id],
    );
    const starts = new Date(event.starts_at),
      ends = new Date(event.ends_at);
    return {
      earnsCredits: event.earns_credits,
      ended: event.ended,
      cancelled: event.cancelled,
      usesCheckIn: event.has_location,
      checkInRadiusMeters: event.checkin_radius_m,
      durationMinutes: attendanceLimitMinutes(starts, ends, starts),
      items: rows.map((row: Record<string, unknown>) => ({
        ...row,
        limitMinutes: this.limitFor(event, row.checkedInAt as Date | null),
        creditsEarned: row.creditsEarned == null ? null : Number(row.creditsEarned),
      })),
    };
  }

  /** Checked-in members can be credited from check-in to the end; others not at all. */
  private limitFor(
    event: { starts_at: Date; ends_at: Date; has_location?: boolean; location_lat?: unknown },
    checkedInAt: Date | null,
  ): number {
    const starts = new Date(event.starts_at),
      ends = new Date(event.ends_at);
    const usesCheckIn = event.has_location ?? event.location_lat != null;
    if (!usesCheckIn) return attendanceLimitMinutes(starts, ends, starts);
    return checkedInAt ? attendanceLimitMinutes(starts, ends, new Date(checkedInAt)) : 0;
  }

  /**
   * Staff confirm one member's attended minutes, up to that member's limit.
   * The confirmation and its credit payment commit together. Confirmation is
   * final: the ledger is append-only, so a different amount cannot replace it.
   */
  async confirmAttendance(
    org: string,
    user: string,
    id: string,
    membershipId: string,
    minutes: number,
  ) {
    const actor = await this.community.actor(org, user);
    this.community.requireStaff(actor.roles);
    if (membershipId === actor.membershipId)
      throw new ForbiddenException('Another staff member must confirm your own attendance');
    return this.db.transaction(async (manager) => {
      const event = await this.lockEndedCreditEvent(manager, org, id);
      return this.confirmOne(manager, org, user, id, event, membershipId, minutes);
    });
  }

  /**
   * Staff approve everyone who checked in, in one step. Each person gets their own
   * limit, or the given cap when it is lower. Already confirmed people are skipped.
   */
  async confirmAllAttendance(org: string, user: string, id: string, capMinutes?: number) {
    const actor = await this.community.actor(org, user);
    this.community.requireStaff(actor.roles);
    if (capMinutes !== undefined && (!Number.isInteger(capMinutes) || capMinutes < 1))
      throw new BadRequestException('Enter a whole number of minutes');
    return this.db.transaction(async (manager) => {
      const event = await this.lockEndedCreditEvent(manager, org, id);
      if (event.location_lat == null)
        throw new ConflictException('Approve attendees one by one for events without check-in');
      const pending = await manager.query(
        `SELECT membership_id,checked_in_at FROM community_event_attendance
         WHERE organization_id=$1 AND event_id=$2 AND checked_in_at IS NOT NULL AND confirmed_at IS NULL
           AND membership_id<>$3
         ORDER BY checked_in_at,membership_id`,
        [org, id, actor.membershipId],
      );
      const results = [];
      let credits = 0;
      for (const row of pending) {
        const limit = this.limitFor(event, row.checked_in_at);
        if (limit < 1) continue;
        const result = await this.confirmOne(
          manager,
          org,
          user,
          id,
          event,
          row.membership_id,
          Math.min(limit, capMinutes ?? limit),
        );
        credits = Math.round((credits + (result.creditsEarned ?? 0)) * 100) / 100;
        results.push({ membershipId: row.membership_id, ...result });
      }
      return { confirmed: results.length, creditsEarned: credits, items: results };
    });
  }

  private async lockEndedCreditEvent(
    manager: EntityManager,
    org: string,
    id: string,
  ): Promise<{
    starts_at: Date;
    ends_at: Date;
    location_lat: number | null;
  }> {
    const [event] = await manager.query(
      `SELECT earns_credits,cancelled_at,starts_at,ends_at,location_lat,ends_at<=now() AS ended
       FROM community_events WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
      [org, id],
    );
    if (!event) throw new NotFoundException('Event not found');
    if (!event.earns_credits) throw new ConflictException('This event does not earn credits');
    if (event.cancelled_at) throw new ConflictException('This event was cancelled');
    if (!event.ended)
      throw new ConflictException('Attendance can be confirmed after the event ends');
    return event;
  }

  private async confirmOne(
    manager: EntityManager,
    org: string,
    user: string,
    id: string,
    event: { starts_at: Date; ends_at: Date; location_lat: number | null },
    membershipId: string,
    minutes: number,
  ) {
    const [attendance] = await manager.query(
      `SELECT a.attended_minutes,a.confirmed_at,a.checked_in_at,m.user_id
       FROM community_event_attendance a
       JOIN organization_memberships m ON m.organization_id=a.organization_id AND m.id=a.membership_id
       WHERE a.organization_id=$1 AND a.event_id=$2 AND a.membership_id=$3 FOR UPDATE OF a`,
      [org, id, membershipId],
    );
    if (!attendance) throw new NotFoundException('This member did not sign up for the event');
    if (attendance.confirmed_at) {
      if (attendance.attended_minutes === minutes)
        return { confirmed: true, minutes, replayed: true, creditsEarned: 0, creditsHeld: false };
      throw new ConflictException(
        'Attendance is already confirmed. Ask an administrator to correct credits.',
      );
    }
    if (event.location_lat != null && !attendance.checked_in_at)
      throw new ConflictException('This member did not check in at the event');
    const limit = this.limitFor(event, attendance.checked_in_at);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > limit)
      throw new BadRequestException(`Enter between 1 and ${limit} minutes`);

    await manager.query(
      `UPDATE community_event_attendance SET attended_minutes=$4, confirmed_at=now(), confirmed_by=$5
       WHERE organization_id=$1 AND event_id=$2 AND membership_id=$3`,
      [org, id, membershipId, minutes, user],
    );
    const entry = await this.ledger.postEventEarning(manager, {
      userId: attendance.user_id,
      organizationId: org,
      eventId: id,
      minutes,
    });
    await this.audit.logEvent(
      {
        eventType: 'COMMUNITY_EVENT_ATTENDANCE_CONFIRMED',
        actorId: user,
        organizationId: org,
        targetType: 'COMMUNITY_EVENT',
        targetId: id,
        payload: {
          membershipId,
          minutes,
          ledgerEntryId: entry?.id ?? null,
          credits: entry?.amount ?? 0,
          held: entry?.held ?? false,
        },
      },
      manager,
    );
    return {
      confirmed: true,
      minutes,
      replayed: false,
      creditsEarned: entry?.amount ?? 0,
      creditsHeld: entry?.held ?? false,
    };
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
