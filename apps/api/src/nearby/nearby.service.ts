import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { UserRole } from '@ktb/shared-types';
import { AuthorizationService } from '../authorization/authorization.service';
import { AuditService } from '../audit/audit.service';
import { NearbyAvailabilityDto } from './nearby.dto';

/** Deliberately coarse ranges, never member/request identifiers or a sparse exact headcount. */
export function activityRange(count: number): string {
  return count <= 0 ? '0' : count < 5 ? '1-4' : count < 10 ? '5-9' : '10+';
}
export function coarseCoordinate(value: unknown): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 100) / 100;
}

// Same schedule-history rules as matching/assignment-schedule.ts; never relabel an old booking.
const assignmentStart = `COALESCE(
  (SELECT h.new_start_time FROM request_reschedules h WHERE h.id=a.reschedule_id AND h.service_request_id=r.id),
  (SELECT h.new_start_time FROM request_reschedules h WHERE h.service_request_id=r.id AND h.created_at<a.offered_at ORDER BY h.created_at DESC,h.id DESC LIMIT 1),
  (SELECT h.previous_start_time FROM request_reschedules h WHERE h.service_request_id=r.id ORDER BY h.created_at,h.id LIMIT 1),
  r.scheduled_start_time)`;

// Eligibility is checked again on each read, including session revocation and expired consent.
const eligibleVolunteer = `m.status='APPROVED' AND u.status='ACTIVE'
  AND NOT EXISTS (SELECT 1 FROM global_account_restrictions x WHERE x.user_id=u.id AND x.status='ACTIVE')
  AND EXISTS (SELECT 1 FROM membership_role_grants g WHERE g.membership_id=m.id AND g.role='VOLUNTEER'
    AND g.status='ACTIVE' AND g.granted_at<=p.updated_at AND (g.revoked_at IS NULL OR g.revoked_at<=p.updated_at))
  AND z.updated_at<=p.updated_at
  AND m.updated_at<=p.updated_at
  AND NOT EXISTS (SELECT 1 FROM global_account_restrictions h WHERE h.user_id=u.id
    AND (h.created_at>p.updated_at OR h.resolved_at>p.updated_at))
  AND s.user_id=u.id AND s.revoked_at IS NULL AND s.expires_at>now()
  AND p.expires_at>now()
  AND NOT EXISTS (SELECT 1 FROM volunteer_assignments a JOIN service_requests r ON r.id=a.service_request_id
    WHERE a.volunteer_membership_id=m.id AND (a.status='IN_PROGRESS' OR
      (a.status='ACCEPTED' AND ${assignmentStart}<p.expires_at
       AND ${assignmentStart}+r.expected_duration_minutes*interval '1 minute'>now())))`;

@Injectable()
export class NearbyService implements OnModuleInit, OnModuleDestroy {
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private readonly logger = new Logger(NearbyService.name);
  onModuleInit() {
    this.cleanupTimer = setInterval(() => {
      void this.purgeExpired().catch(() =>
        this.logger.warn('Expired Nearby availability cleanup will retry.'),
      );
    }, 60_000);
    this.cleanupTimer.unref();
  }
  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
  async purgeExpired() {
    // Query expiry is immediate; bounded cleanup removes abandoned rows independently of open apps.
    return this.db.query(`DELETE FROM nearby_availability p WHERE p.membership_id IN (
      SELECT a.membership_id FROM nearby_availability a JOIN authentication_sessions s ON s.id=a.session_id
      WHERE a.expires_at<=now() OR s.expires_at<=now() OR s.revoked_at IS NOT NULL
      ORDER BY a.expires_at LIMIT 1000)
      AND (p.expires_at<=now() OR EXISTS (SELECT 1 FROM authentication_sessions s WHERE s.id=p.session_id
        AND (s.expires_at<=now() OR s.revoked_at IS NOT NULL)))`);
  }
  constructor(
    private readonly db: DataSource,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  private async actor(m: EntityManager, org: string, user: string) {
    return this.authorization.evaluateOrganizationAccess(user, org, m);
  }

  async snapshot(org: string, user: string) {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const actor = await this.actor(m, org, user);
      const rows = await m.query(
        `SELECT z.id,z.name,z.ward_numbers,z.center_lat,z.center_lng,z.radius_km,
        (SELECT count(*) FROM service_requests r
          JOIN organization_memberships b ON b.id=r.beneficiary_membership_id AND b.organization_id=r.organization_id
          JOIN users bu ON bu.id=b.user_id
          WHERE r.organization_id=z.organization_id AND z.ward_numbers ? r.location_ward_number
          AND r.status IN ('MATCHING_ACTIVE','PARTIALLY_ACCEPTED','ESCALATED_TO_COORDINATOR')
          AND r.scheduled_start_time BETWEEN now()-interval '1 hour' AND now()+interval '24 hours'
          AND b.status='APPROVED' AND bu.status='ACTIVE'
          AND NOT EXISTS (SELECT 1 FROM global_account_restrictions x WHERE x.user_id=bu.id AND x.status='ACTIVE')) AS requests,
        (SELECT count(*) FROM nearby_availability p
          JOIN organization_memberships m ON m.id=p.membership_id AND m.organization_id=p.organization_id
          JOIN users u ON u.id=m.user_id JOIN authentication_sessions s ON s.id=p.session_id
          WHERE p.organization_id=z.organization_id AND p.area_id=z.id AND ${eligibleVolunteer}) AS volunteers
        FROM operational_zones z WHERE z.organization_id=$1 AND z.is_active AND z.nearby_visible
        ORDER BY z.name,z.id LIMIT 201`,
        [org],
      );
      if (rows.length > 200)
        throw new BadRequestException(
          'This community has too many Nearby areas. Ask a coordinator to consolidate them.',
        );
      const mine = await m.query(
        `SELECT p.area_id,p.expires_at,p.updated_at FROM nearby_availability p
        JOIN organization_memberships m ON m.id=p.membership_id AND m.organization_id=p.organization_id
        JOIN users u ON u.id=m.user_id JOIN authentication_sessions s ON s.id=p.session_id
        JOIN operational_zones z ON z.id=p.area_id AND z.organization_id=p.organization_id
        WHERE p.organization_id=$1 AND m.user_id=$2 AND z.is_active AND z.nearby_visible AND ${eligibleVolunteer}`,
        [org, user],
      );
      const [{ time }] = await m.query('SELECT clock_timestamp() AS time');
      return {
        generatedAt: new Date(time).toISOString(),
        refreshAfterSeconds: 15,
        canShareAvailability:
          actor.roles.includes(UserRole.VOLUNTEER) && actor.membershipStatus === 'APPROVED',
        availability: mine[0]
          ? { areaId: mine[0].area_id, expiresAt: new Date(mine[0].expires_at).toISOString() }
          : null,
        areas: rows.map((z: Record<string, unknown>) => ({
          id: z.id,
          name: z.name,
          wards: z.ward_numbers,
          latitude: coarseCoordinate(z.center_lat),
          longitude: coarseCoordinate(z.center_lng),
          radiusKm: Math.max(1, Number(z.radius_km)),
          requests: activityRange(Number(z.requests)),
          volunteers: activityRange(Number(z.volunteers)),
        })),
      };
    });
  }

  async available(
    org: string,
    user: string,
    sessionId: string | undefined,
    dto: NearbyAvailabilityDto,
  ) {
    if (!sessionId) throw new ForbiddenException('Sign in again before sharing availability.');
    if (dto.consent !== true || ![15, 30, 60, 120].includes(dto.minutes))
      throw new BadRequestException(
        'Choose a valid duration and explicitly share your availability.',
      );
    return this.db.transaction(async (m) => {
      const actor = await this.actor(m, org, user);
      if (!actor.roles.includes(UserRole.VOLUNTEER) || actor.membershipStatus !== 'APPROVED')
        throw new ForbiddenException('Only approved volunteers can share availability.');
      const sessions = await m.query(
        `SELECT id FROM authentication_sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now()`,
        [sessionId, user],
      );
      if (!sessions.length)
        throw new ForbiddenException('Sign in again before sharing availability.');
      const areas = await m.query(
        `SELECT id FROM operational_zones WHERE id=$1 AND organization_id=$2 AND is_active AND nearby_visible FOR SHARE`,
        [dto.areaId, org],
      );
      if (!areas.length) throw new NotFoundException('This Nearby area is not available.');
      const busy = await m.query(
        `SELECT 1 FROM volunteer_assignments a JOIN service_requests r ON r.id=a.service_request_id
        WHERE a.volunteer_membership_id=$1 AND (a.status='IN_PROGRESS' OR (a.status='ACCEPTED'
          AND ${assignmentStart}<now()+$2*interval '1 minute'
          AND ${assignmentStart}+r.expected_duration_minutes*interval '1 minute'>now())) LIMIT 1`,
        [actor.membershipId, dto.minutes],
      );
      if (busy.length)
        throw new ConflictException(
          'A visit overlaps this availability period. Choose a shorter period or check your activity.',
        );
      const [saved] = await m.query(
        `INSERT INTO nearby_availability(organization_id,membership_id,area_id,session_id,updated_at,expires_at)
        VALUES($1,$2,$3,$4,now(),now()+$5*interval '1 minute')
        ON CONFLICT(membership_id) DO UPDATE SET area_id=EXCLUDED.area_id,session_id=EXCLUDED.session_id,
          updated_at=EXCLUDED.updated_at,expires_at=EXCLUDED.expires_at RETURNING area_id,expires_at`,
        [org, actor.membershipId, dto.areaId, sessionId, dto.minutes],
      );
      await this.audit.logEvent(
        {
          eventType: 'NEARBY_AVAILABILITY_SHARED',
          actorId: user,
          organizationId: org,
          targetType: 'MEMBERSHIP',
          targetId: actor.membershipId,
          payload: { areaId: dto.areaId, minutes: dto.minutes },
        },
        m,
      );
      return { areaId: saved.area_id, expiresAt: new Date(saved.expires_at).toISOString() };
    });
  }

  async stop(org: string, user: string) {
    return this.db.transaction(async (m) => {
      const actor = await this.actor(m, org, user);
      await m.query(
        `DELETE FROM nearby_availability WHERE organization_id=$1 AND membership_id=$2`,
        [org, actor.membershipId],
      );
      await this.audit.logEvent(
        {
          eventType: 'NEARBY_AVAILABILITY_STOPPED',
          actorId: user,
          organizationId: org,
          targetType: 'MEMBERSHIP',
          targetId: actor.membershipId,
        },
        m,
      );
      return { availability: null };
    });
  }

  async publish(org: string, user: string, area: string, visible: boolean) {
    return this.db.transaction(async (m) => {
      const actor = await this.actor(m, org, user);
      if (
        !actor.roles.some((r) =>
          [UserRole.COORDINATOR, UserRole.MUNICIPALITY_ADMIN, UserRole.SUPER_ADMIN].includes(r),
        )
      )
        throw new ForbiddenException('Coordinator access required.');
      const rows = await m.query(
        `UPDATE operational_zones SET nearby_visible=$3,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING id`,
        [area, org, visible],
      );
      if (!rows.length) throw new NotFoundException('Area not found.');
      if (!visible)
        await m.query('DELETE FROM nearby_availability WHERE organization_id=$1 AND area_id=$2', [
          org,
          area,
        ]);
      await this.audit.logEvent(
        {
          eventType: 'NEARBY_AREA_VISIBILITY_CHANGED',
          actorId: user,
          organizationId: org,
          targetType: 'OPERATIONAL_ZONE',
          targetId: area,
          payload: { visible },
        },
        m,
      );
      return { id: area, nearbyVisible: visible };
    });
  }
}
