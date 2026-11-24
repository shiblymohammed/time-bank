import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { UserRole } from '@ktb/shared-types';
import { AuthorizationService } from '../authorization/authorization.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TimeLedgerService } from '../time-ledger/time-ledger.service';
import {
  StartInstantHelpDto,
  FinishInstantHelpDto,
  ReviewInstantHelpDto,
} from './instant-help.dto';

import { readInstantHelpVoice } from './instant-help-voice';

export const instantMinutes = (start: Date, end: Date) =>
  Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 60000));
export const instantStaff = (a: { isSuperAdmin: boolean; roles: UserRole[] }) =>
  a.isSuperAdmin ||
  a.roles.some((r) => [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN].includes(r));
const fields = `SELECT s.*,u.full_name AS volunteer_name,m.membership_number,m.status AS membership_status,m.ward_id,
  COALESCE((SELECT json_agg(p.id ORDER BY p.created_at) FROM instant_help_photos p WHERE p.session_id=s.id),'[]') AS photos,
  (SELECT v.duration_ms FROM instant_help_voice_notes v WHERE v.session_id=s.id) AS voice_duration_ms,
  COALESCE((SELECT sum(l.amount) FROM time_credit_ledger l WHERE l.instant_help_session_id=s.id AND l.tx_type='SERVICE_EARNED'),0) AS credits_earned
  FROM instant_help_sessions s JOIN users u ON u.id=s.user_id JOIN organization_memberships m ON m.id=s.membership_id`;
function view(r: any) {
  return {
    id: r.id,
    organizationId: r.organization_id,
    userId: r.user_id,
    description: r.description,
    locationLabel: r.location_label,
    latitude: r.location_lat,
    longitude: r.location_lng,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    reportedMinutes: r.reported_minutes,
    notes: r.completion_notes,
    approvedMinutes: r.approved_minutes,
    reviewNotes: r.review_notes,
    reviewedAt: r.reviewed_at,
    version: r.version,
    photos: r.photos ?? [],
    voiceDurationMs: r.voice_duration_ms ?? null,
    creditsEarned: Number(r.credits_earned ?? 0),
    volunteerName: r.volunteer_name,
    membershipNumber: r.membership_number,
    membershipStatus: r.membership_status,
    wardId: r.ward_id,
  };
}
@Injectable()
export class InstantHelpService {
  constructor(
    private readonly db: DataSource,
    private readonly auth: AuthorizationService,
    private readonly ledger: TimeLedgerService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}
  private async access(org: string, user: string, m?: EntityManager) {
    return this.auth.evaluateOrganizationAccess(user, org, m);
  }
  private async own(org: string, user: string, id: string, m: EntityManager, lock = false) {
    await this.access(org, user, m);
    const [s] = await m.query(
      `SELECT * FROM instant_help_sessions WHERE id=$1 AND organization_id=$2 AND user_id=$3 ${lock ? 'FOR UPDATE' : ''}`,
      [id, org, user],
    );
    if (!s) throw new NotFoundException('Instant help session not found');
    return s;
  }
  private async get(m: EntityManager, id: string) {
    const [r] = await m.query(fields + ' WHERE s.id=$1', [id]);
    return view(r);
  }
  async mine(org: string, user: string) {
    await this.access(org, user);
    return this.db
      .query(
        fields +
          ` WHERE s.organization_id=$1 AND s.user_id=$2 ORDER BY (s.status='RUNNING') DESC,s.started_at DESC LIMIT 50`,
        [org, user],
      )
      .then((rows) => rows.map(view));
  }
  async detail(org: string, user: string, id: string) {
    const a = await this.access(org, user);
    const [r] = await this.db.query(fields + ' WHERE s.id=$1 AND s.organization_id=$2', [id, org]);
    if (!r || (r.user_id !== user && !instantStaff(a)))
      throw new NotFoundException('Instant help session not found');
    return view(r);
  }
  async reviews(org: string, user: string, status = 'PENDING') {
    const a = await this.access(org, user);
    if (!instantStaff(a)) throw new ForbiddenException('Coordinator access required');
    if (!['RUNNING', 'PENDING', 'NEEDS_INFO', 'APPROVED', 'REJECTED'].includes(status))
      throw new BadRequestException('Invalid status');
    return this.db
      .query(
        fields + ' WHERE s.organization_id=$1 AND s.status=$2 ORDER BY s.started_at DESC LIMIT 100',
        [org, status],
      )
      .then((rows) => rows.map(view));
  }
  async start(
    org: string,
    user: string,
    dto: StartInstantHelpDto,
    evidence: { photo?: Buffer; voice?: Buffer } = {},
  ) {
    // Location is best effort: a volunteer can start without it, and the
    // coordinator sees that none was shared. A half-filled pair is a bug.
    const lat = dto.latitude ?? null;
    const lng = dto.longitude ?? null;
    const located = lat != null && lng != null;
    if (
      (lat == null) !== (lng == null) ||
      (located &&
        (!Number.isFinite(lat) ||
          lat < -90 ||
          lat > 90 ||
          !Number.isFinite(lng) ||
          lng < -180 ||
          lng > 180))
    ) {
      throw new BadRequestException('Send both location coordinates, or neither');
    }
    const description = dto.description || 'Instant Help';
    const locationLabel = dto.locationLabel || (located ? 'Device location' : 'Location not shared');
    const { photo, voice } = evidence;
    const voiceDuration = voice ? readInstantHelpVoice(voice) : null;
    const payload: unknown[] = [description, locationLabel, lat, lng];
    if (photo || voice) {
      payload.push(
        ...[photo, voice].map((file) =>
          file ? createHash('sha256').update(file).digest('hex') : null,
        ),
      );
    }
    const fingerprint = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return this.db.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['help-timer:' + user]);
      const a = await this.access(org, user, m);
      if (
        !a.roles.includes(UserRole.VOLUNTEER) ||
        a.membershipStatus !== 'APPROVED' ||
        a.membershipId === 'super-admin-bypass'
      )
        throw new ForbiddenException('Approved volunteer membership required');
      const [old] = await m.query(
        'SELECT * FROM instant_help_sessions WHERE user_id=$1 AND start_key=$2',
        [user, dto.key],
      );
      if (old) {
        if (old.organization_id !== org || old.start_fingerprint !== fingerprint)
          throw new ConflictException('This start key belongs to another session');
        return this.get(m, old.id);
      }
      const [active] = await m.query(
        `SELECT id FROM instant_help_sessions WHERE user_id=$1 AND status='RUNNING'
        UNION ALL SELECT a.id FROM volunteer_assignments a JOIN organization_memberships member ON member.id=a.volunteer_membership_id
        WHERE member.user_id=$1 AND (a.status='IN_PROGRESS' OR (a.status='ACCEPTED' AND a.arrived_at IS NOT NULL)) LIMIT 1`,
        [user],
      );
      if (active)
        throw new ConflictException(
          'Finish your active timer or team visit before starting another',
        );
      const [s] = await m.query(
        `INSERT INTO instant_help_sessions(organization_id,user_id,membership_id,start_key,start_fingerprint,description,location_label,location_lat,location_lng)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          org,
          user,
          a.membershipId,
          dto.key,
          fingerprint,
          description,
          locationLabel,
          lat,
          lng,
        ],
      );
      if (photo) {
        await m.query('INSERT INTO instant_help_photos(session_id,photo) VALUES($1,$2)', [
          s.id,
          photo,
        ]);
      }
      if (voice) {
        await m.query(
          'INSERT INTO instant_help_voice_notes(session_id,audio,duration_ms) VALUES($1,$2,$3)',
          [s.id, voice, voiceDuration],
        );
      }
      await this.event(m, org, user, s.id, 'INSTANT_HELP_STARTED', {
        photoAttached: photo != null,
        voiceAttached: voice != null,
      });
      return this.get(m, s.id);
    });
  }
  /** Older app builds stop first and add notes later; stopping now sends it straight to review. */
  async stop(org: string, user: string, id: string) {
    return this.finish(org, user, id, {});
  }

  /** "Done": stops the clock and sends the session to a coordinator in one step. */
  async finish(org: string, user: string, id: string, dto: FinishInstantHelpDto) {
    const notes = dto.notes || null;
    return this.db.transaction(async (m) => {
      const s = await this.own(org, user, id, m, true);
      // A retried Done (same note, or no note) returns the saved session.
      if (s.status === 'PENDING' && (notes == null || s.completion_notes === notes))
        return this.get(m, id);
      // Sessions stopped by an older build wait as an unreviewed NEEDS_INFO draft.
      const stoppedDraft = s.status === 'NEEDS_INFO' && !s.reviewed_by && s.finished_at;
      if (s.status !== 'RUNNING' && !stoppedDraft)
        throw new ConflictException('This timer is no longer running');
      let end = s.finished_at ? new Date(s.finished_at) : null;
      let minutes = s.reported_minutes;
      if (s.status === 'RUNNING') {
        const [clock] = await m.query('SELECT clock_timestamp() AS now');
        end = new Date(clock.now);
        minutes = instantMinutes(new Date(s.started_at), end);
      }
      await m.query(
        `UPDATE instant_help_sessions SET status='PENDING',finished_at=$2,reported_minutes=$3,completion_notes=COALESCE($4,completion_notes),version=version+1 WHERE id=$1`,
        [id, end, minutes, notes],
      );
      await this.event(m, org, user, id, 'INSTANT_HELP_SUBMITTED', { minutes });
      await this.notifications.notifyCoordinators(
        m,
        {
          organizationId: org,
          type: 'INSTANT_HELP_PENDING',
          title: 'Instant help to review',
          body: 'A volunteer submitted an instant help session. Open the staff dashboard to review it.',
        },
        [user],
      );
      return this.get(m, id);
    });
  }
  async resubmit(org: string, user: string, id: string, dto: FinishInstantHelpDto) {
    const notes = dto.notes || null;
    return this.db.transaction(async (m) => {
      const s = await this.own(org, user, id, m, true);
      if (s.status === 'PENDING' && (notes == null || s.completion_notes === notes))
        return this.get(m, id);
      if (s.status !== 'NEEDS_INFO')
        throw new ConflictException('This session is not waiting for information');
      await m.query(
        `UPDATE instant_help_sessions SET status='PENDING',completion_notes=COALESCE($2,completion_notes),version=version+1 WHERE id=$1`,
        [id, notes],
      );
      await this.event(m, org, user, id, 'INSTANT_HELP_RESUBMITTED', {});
      await this.notifications.notifyCoordinators(
        m,
        {
          organizationId: org,
          type: 'INSTANT_HELP_PENDING',
          title: 'Instant help updated',
          body: 'Additional information is ready for review.',
        },
        [user],
      );
      return this.get(m, id);
    });
  }
  async review(org: string, user: string, id: string, dto: ReviewInstantHelpDto) {
    return this.db.transaction(async (m) => {
      const a = await this.access(org, user, m);
      if (!instantStaff(a)) throw new ForbiddenException('Coordinator access required');
      const [s] = await m.query(
        'SELECT * FROM instant_help_sessions WHERE id=$1 AND organization_id=$2 FOR UPDATE',
        [id, org],
      );
      if (!s) throw new NotFoundException('Instant help session not found');
      if (s.user_id === user) throw new ForbiddenException('You cannot review your own session');
      if (
        (s.status !== 'PENDING' &&
          !(['RUNNING', 'NEEDS_INFO'].includes(s.status) && dto.decision === 'REJECT')) ||
        s.version !== dto.version
      )
        throw new ConflictException('This session changed; reload before reviewing');
      if (s.status === 'RUNNING') {
        const [clock] = await m.query('SELECT clock_timestamp() AS now');
        s.finished_at = clock.now;
        s.reported_minutes = instantMinutes(new Date(s.started_at), new Date(clock.now));
      }
      const minutes = dto.minutes ?? s.reported_minutes;
      if (
        dto.decision === 'APPROVE' &&
        (minutes < 1 || minutes > 720 || minutes > s.reported_minutes)
      )
        throw new BadRequestException('Approve between 1 and the reported minutes, up to 720');
      if (dto.decision !== 'APPROVE' && dto.minutes != null)
        throw new BadRequestException('Minutes are only used for approval');
      const status =
        dto.decision === 'APPROVE'
          ? 'APPROVED'
          : dto.decision === 'REJECT'
            ? 'REJECTED'
            : 'NEEDS_INFO';
      let earned = 0;
      if (status === 'APPROVED') {
        // The approved duration is paid once at the base timebank rate (1 credit/hour).
        const entry = await this.ledger.postServiceEarning(m, {
          volunteerUserId: s.user_id,
          organizationId: org,
          instantHelpSessionId: id,
          minutes,
          policy: { baseCreditRateHourly: 1, creditMultiplier: 1, allowPartialHours: true },
          reference: 'Instant help',
        });
        earned = Number(entry?.amount ?? 0);
      }
      await m.query(
        `UPDATE instant_help_sessions SET status=$2,approved_minutes=$3,review_notes=$4,reviewed_by=$5,reviewed_at=now(),finished_at=$6,reported_minutes=$7,version=version+1 WHERE id=$1`,
        [
          id,
          status,
          status === 'APPROVED' ? minutes : null,
          dto.notes || null,
          user,
          s.finished_at,
          s.reported_minutes,
        ],
      );
      await this.event(m, org, user, id, 'INSTANT_HELP_REVIEWED', {
        status,
        minutes: status === 'APPROVED' ? minutes : null,
        credits: earned,
        notes: dto.notes || null,
      });
      await this.notifications.enqueue(m, {
        userId: s.user_id,
        type: 'INSTANT_HELP_REVIEW',
        title: 'Instant help update',
        body:
          status === 'APPROVED'
            ? 'Your instant help was approved. Open Wallet to see your credits.'
            : status === 'REJECTED'
              ? 'Your coordinator reviewed your instant help. Open the app for details.'
              : 'Your coordinator needs more information about your instant help.',
        data: { organizationId: org, instantHelpId: id },
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });
      return this.get(m, id);
    });
  }
  async addPhoto(org: string, user: string, id: string, photo: Buffer) {
    return this.db.transaction(async (m) => {
      const s = await this.own(org, user, id, m, true);
      if (!['RUNNING', 'NEEDS_INFO'].includes(s.status))
        throw new ConflictException('Evidence is locked while a session is under review');
      const [duplicate] = await m.query(
        'SELECT id FROM instant_help_photos WHERE session_id=$1 AND photo=$2 LIMIT 1',
        [id, photo],
      );
      if (duplicate) return this.get(m, id);
      const [{ count }] = await m.query(
        'SELECT count(*)::int AS count FROM instant_help_photos WHERE session_id=$1',
        [id],
      );
      if (count >= 3) throw new BadRequestException('Up to three photos can be attached');
      await m.query('INSERT INTO instant_help_photos(session_id,photo) VALUES($1,$2)', [id, photo]);
      await m.query('UPDATE instant_help_sessions SET version=version+1 WHERE id=$1', [id]);
      await this.event(m, org, user, id, 'INSTANT_HELP_PHOTO_ADDED', {});
      return this.get(m, id);
    });
  }
  async photo(org: string, user: string, id: string, photoId: string) {
    await this.detail(org, user, id);
    const [p] = await this.db.query(
      'SELECT photo FROM instant_help_photos WHERE session_id=$1 AND id=$2',
      [id, photoId],
    );
    if (!p) throw new NotFoundException('Photo not found');
    return p.photo as Buffer;
  }
  async voice(org: string, user: string, id: string) {
    await this.detail(org, user, id);
    const [note] = await this.db.query(
      'SELECT audio FROM instant_help_voice_notes WHERE session_id=$1',
      [id],
    );
    if (!note) throw new NotFoundException('Voice note not found');
    return note.audio as Buffer;
  }

  private event(
    m: EntityManager,
    org: string,
    user: string,
    id: string,
    type: string,
    payload: Record<string, unknown>,
  ) {
    return this.audit.logEvent(
      {
        eventType: type,
        actorId: user,
        targetId: id,
        targetType: 'instant_help_sessions',
        organizationId: org,
        payload,
      },
      m,
    );
  }
}
