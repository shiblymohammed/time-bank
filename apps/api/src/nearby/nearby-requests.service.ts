import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { UserRole } from '@ktb/shared-types';
import { AuthorizationService } from '../authorization/authorization.service';
import { ProfilePhotoService } from '../identity/profile-photo.service';
import { creditsForMinutes } from '../time-ledger/time-ledger.service';
import { NearbyRequestsQueryDto } from './nearby.dto';

// Sharing is opt-in. These reads never select an address, contact number or private notes.
const source = `FROM service_requests r
  JOIN organization_memberships b ON b.id=r.beneficiary_membership_id AND b.organization_id=r.organization_id
  JOIN users bu ON bu.id=b.user_id
  JOIN organization_service_catalog c ON c.id=r.service_catalog_id AND c.organization_id=r.organization_id
  JOIN global_service_definitions g ON g.id=c.global_service_id
  JOIN service_categories cat ON cat.id=g.category_id
  LEFT JOIN community_visibility v ON v.organization_id=r.organization_id AND v.membership_id=b.id
  LEFT JOIN service_request_photos photo ON photo.request_id=r.id
  CROSS JOIN LATERAL (SELECT count(*)::int AS accepted FROM volunteer_assignments a
    WHERE a.service_request_id=r.id AND a.status IN ('ACCEPTED','IN_PROGRESS','COMPLETED')) helpers
  WHERE r.organization_id=$1 AND r.share_nearby_pin
    AND r.status IN ('MATCHING_ACTIVE','PARTIALLY_ACCEPTED','ESCALATED_TO_COORDINATOR')
    AND r.scheduled_start_time BETWEEN now()-interval '1 hour' AND now()+interval '7 days'
    AND r.scheduled_start_time+r.expected_duration_minutes*interval '1 minute'>now()
    AND helpers.accepted<r.preferred_volunteers
    AND b.status='APPROVED' AND bu.status='ACTIVE'
    AND NOT EXISTS(SELECT 1 FROM global_account_restrictions x WHERE x.user_id=bu.id AND x.status='ACTIVE')
    AND NOT EXISTS(SELECT 1 FROM community_member_blocks block WHERE block.organization_id=r.organization_id
      AND ((block.blocker_id=$2 AND block.blocked_id=b.id) OR (block.blocked_id=$2 AND block.blocker_id=b.id)))`;
const token = `left(encode(sha256(convert_to(r.id::text,'UTF8')),'hex'),24)`;

@Injectable()
export class NearbyRequestsService {
  constructor(
    private readonly db: DataSource,
    private readonly auth: AuthorizationService,
    private readonly photos: ProfilePhotoService,
  ) {}

  private async actor(m: EntityManager, org: string, user: string) {
    const actor = await this.auth.evaluateOrganizationAccess(user, org, m);
    return {
      ...actor,
      canBrowse: actor.membershipStatus === 'APPROVED' && actor.roles.includes(UserRole.VOLUNTEER),
    };
  }

  async list(org: string, user: string, query: NearbyRequestsQueryDto) {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const actor = await this.actor(m, org, user);
      if (!actor.canBrowse)
        return { items: [], hasMore: false, canBrowse: false, categories: [], wards: [] };
      const params = [
        org,
        actor.membershipId,
        query.q?.trim() || null,
        query.ward || null,
        query.category || null,
        query.when === 'today',
        query.sort === 'newest',
        query.offset ?? 0,
      ];
      const rows = await m.query(
        `SELECT ${token} AS id,
        CASE WHEN b.id=$2 THEN r.id END AS own_request_id,
        COALESCE(c.custom_label_en,g.name_en) AS title,g.description_en AS description,
        cat.name_en AS category,cat.id AS category_id,r.urgency,r.scheduled_start_time,
        r.expected_duration_minutes,r.location_ward_number AS ward,
        (SELECT z.name FROM operational_zones z WHERE z.organization_id=r.organization_id
          AND z.is_active AND z.nearby_visible AND z.ward_numbers ? r.location_ward_number ORDER BY z.name,z.id LIMIT 1) AS area,
        r.preferred_volunteers-helpers.accepted AS open_slots,
        COALESCE(v.display_name,CASE WHEN b.id=$2 THEN bu.full_name END) AS member_name,
        CASE WHEN EXISTS(SELECT 1 FROM membership_role_grants grants WHERE grants.membership_id=b.id
          AND grants.role='VOLUNTEER' AND grants.status='ACTIVE') THEN 'Volunteer' ELSE 'Recipient' END AS member_role,
        CASE WHEN v.shared_photo_id=bu.profile_photo_id THEN bu.profile_photo_id END AS member_photo_version,
        photo.version AS photo_version,
        COALESCE(r.credit_policy,jsonb_build_object('baseCreditRateHourly',g.base_credit_rate_hourly::float,
          'creditMultiplier',g.credit_multiplier::float,'allowPartialHours',g.allow_partial_hours)) AS policy,
        (SELECT jsonb_build_object('id',a.id,'status',a.status) FROM volunteer_assignments a
          WHERE a.service_request_id=r.id AND a.volunteer_membership_id=$2
            AND (a.status IN ('ACCEPTED','IN_PROGRESS') OR (a.status='OFFERED' AND a.offer_expires_at>now()))
          ORDER BY a.offered_at DESC,a.id DESC LIMIT 1) AS assignment
        ${source}
        AND ($3::text IS NULL OR position(lower($3) in lower(concat_ws(' ',c.custom_label_en,g.name_en,cat.name_en,v.display_name,r.location_ward_number)))>0)
        AND ($4::text IS NULL OR r.location_ward_number=$4)
        AND ($5::uuid IS NULL OR cat.id=$5)
        AND (NOT $6::boolean OR (r.scheduled_start_time AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date)
        ORDER BY CASE WHEN $7::boolean THEN r.created_at END DESC,
          r.scheduled_start_time,r.id LIMIT 21 OFFSET $8`,
        params,
      );
      const facets = await m.query(
        `SELECT DISTINCT cat.id AS category_id,cat.name_en AS category,r.location_ward_number AS ward ${source}`,
        params.slice(0, 2),
      );
      return {
        canBrowse: true,
        hasMore: rows.length > 20,
        categories: [
          ...new Map(
            facets.map((f: any) => [f.category_id, { id: f.category_id, name: f.category }]),
          ).values(),
        ],
        wards: [...new Set(facets.map((f: any) => f.ward))].sort((a: any, b: any) =>
          String(a).localeCompare(String(b), undefined, { numeric: true }),
        ),
        items: rows.slice(0, 20).map((r: any) => ({
          id: r.id,
          ownRequestId: r.own_request_id,
          title: r.title,
          description: r.description,
          category: r.category,
          categoryId: r.category_id,
          urgency: r.urgency,
          scheduledStartTime: r.scheduled_start_time,
          durationMinutes: r.expected_duration_minutes,
          ward: r.ward,
          area: r.area,
          openSlots: r.open_slots,
          memberName: r.member_name,
          memberRole: r.member_role,
          memberPhotoVersion: r.member_photo_version,
          photoVersion: r.photo_version,
          estimatedCredits: creditsForMinutes(r.expected_duration_minutes, r.policy),
          assignment: r.assignment,
        })),
      };
    });
  }

  async image(org: string, user: string, id: string, kind: 'request' | 'member'): Promise<Buffer> {
    if (!/^[a-f0-9]{24}$/.test(id)) throw new NotFoundException('Request image unavailable');
    // Re-evaluate membership, visibility, blocks and request eligibility on every download.
    const found = await this.db.transaction('REPEATABLE READ', async (m) => {
      const actor = await this.actor(m, org, user);
      if (!actor.canBrowse) throw new NotFoundException('Request image unavailable');
      const [row] = await m.query(
        `SELECT ${kind === 'request' ? 'photo.jpeg' : 'NULL::bytea AS jpeg'},bu.id AS user_id,
        CASE WHEN v.shared_photo_id=bu.profile_photo_id THEN bu.profile_photo_id END AS photo_id
        ${source} AND ${token}=$3`,
        [org, actor.membershipId, id],
      );
      if (!row) throw new NotFoundException('Request image unavailable');
      return row;
    });
    if (kind === 'member') {
      if (!found.photo_id) throw new NotFoundException('Profile photo is private');
      return this.photos.readVersion(found.user_id, found.photo_id);
    }
    if (!found.jpeg) throw new NotFoundException('No request photo');
    return found.jpeg;
  }
}
