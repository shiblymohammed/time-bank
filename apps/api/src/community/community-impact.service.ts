import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CommunityService } from './community.service';

@Injectable()
export class CommunityImpactService {
  constructor(
    private readonly db: DataSource,
    private readonly community: CommunityService,
    private readonly audit: AuditService,
  ) {}

  async read(org: string, user: string, month?: string) {
    await this.community.actor(org, user);
    const [row] = await this.db.query(
      `
      WITH period AS (
        SELECT COALESCE($2::date,date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')::date) AS month
      ), bounds AS (
        SELECT month, month::timestamp AT TIME ZONE 'Asia/Kolkata' AS starts,
          (month + interval '1 month') AT TIME ZONE 'Asia/Kolkata' AS ends FROM period
      ), in_period AS (
        SELECT a.service_request_id,a.confirmed_minutes,r.status AS request_status
        FROM bounds b JOIN volunteer_assignments a ON a.organization_id=$1
          AND a.status='COMPLETED' AND a.confirmed_minutes>0 AND a.confirmed_at>=b.starts AND a.confirmed_at<b.ends
        JOIN service_requests r ON r.id=a.service_request_id AND r.organization_id=a.organization_id
        JOIN organization_memberships helper ON helper.id=a.volunteer_membership_id
        JOIN organization_memberships helped ON helped.id=r.beneficiary_membership_id
        JOIN users volunteer ON volunteer.id=helper.user_id AND volunteer.status<>'TEST_ACCOUNT_RETIRED'
        JOIN users recipient ON recipient.id=helped.user_id AND recipient.status<>'TEST_ACCOUNT_RETIRED'
        WHERE r.status NOT IN ('CANCELLED','EXPIRED_UNMATCHED')
      ), totals AS (
        SELECT COALESCE(sum(confirmed_minutes),0) AS minutes FROM in_period
      ), visit_candidates AS (
        SELECT DISTINCT service_request_id FROM in_period WHERE request_status='COMPLETED'
      ), visits AS (
        SELECT count(*) AS count FROM visit_candidates c CROSS JOIN bounds b
        WHERE NOT EXISTS (
          SELECT 1 FROM volunteer_assignments a JOIN organization_memberships helper ON helper.id=a.volunteer_membership_id
          JOIN users volunteer ON volunteer.id=helper.user_id AND volunteer.status<>'TEST_ACCOUNT_RETIRED'
          WHERE a.organization_id=$1 AND a.service_request_id=c.service_request_id AND a.status='COMPLETED'
            AND a.confirmed_minutes>0 AND a.confirmed_at>=b.ends
        )
      )
      SELECT to_char(b.month,'YYYY-MM') AS month, b.starts AS "startsAt", b.ends AS "endsBefore",
        g.target_hours AS "targetHours", t.minutes AS "verifiedMinutes", visits.count AS "completedVisits"
      FROM bounds b CROSS JOIN totals t CROSS JOIN visits
      LEFT JOIN community_impact_goals g ON g.organization_id=$1 AND g.month=b.month
    `,
      [org, month ? `${month}-01` : null],
    );
    return {
      ...row,
      timezone: 'Asia/Kolkata',
      verifiedMinutes: Number(row.verifiedMinutes),
      completedVisits: Number(row.completedVisits),
    };
  }

  async saveGoal(org: string, user: string, month: string, targetHours: number) {
    const actor = await this.community.actor(org, user);
    this.community.requireStaff(actor.roles);
    return this.db.transaction(async (manager) => {
      const [current] = await manager.query(
        "SELECT to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM') AS month",
      );
      if (month < current.month)
        throw new BadRequestException('Set a goal for this month or a future month');
      const [changed] = await manager.query(
        `
        INSERT INTO community_impact_goals(organization_id,month,target_hours) VALUES($1,$2,$3)
        ON CONFLICT (organization_id,month) DO UPDATE SET target_hours=EXCLUDED.target_hours, updated_at=now()
        WHERE community_impact_goals.target_hours IS DISTINCT FROM EXCLUDED.target_hours RETURNING month
      `,
        [org, `${month}-01`, targetHours],
      );
      if (changed)
        await this.audit.logEvent(
          {
            eventType: 'COMMUNITY_IMPACT_GOAL_SET',
            actorId: user,
            organizationId: org,
            targetType: 'ORGANIZATION',
            targetId: org,
            payload: { month, targetHours },
          },
          manager,
        );
      return { month, targetHours };
    });
  }
}
