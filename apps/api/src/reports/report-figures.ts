import { EntityManager } from 'typeorm';
import { ReportPeriod } from './report-period';
import {
  followCount,
  hideSmallCounts,
  hideSmallPeople,
  OTHER_WARD,
  Shown,
  SMALL_COUNT_LIMIT,
  tidyWard,
} from './report-privacy';

/**
 * Everything a report says is counted here. A row never names a member, phone, member number,
 * request number, address or written note: those columns are not read at all.
 *
 * - A visit is one volunteer's confirmed help. It counts in the month it was confirmed, using the
 *   confirmed minutes, under the community of the request.
 * - Credits count under the community they came from (ITB-009). Credits passed to a nominee are not
 *   earnings, so they do not appear.
 * - Retired test accounts are left out everywhere.
 */
const TOP_SERVICES = 5;
const OTHER_SERVICES = 'Other services';

export interface PeriodFigures {
  from: string;
  to: string;
  label: string;
  month: string | null;
}
export interface VisitRow {
  label: string;
  visits: Shown;
  hours: Shown;
}
export interface CountRow {
  label: string;
  count: Shown;
}
export interface StaffFigures {
  community: { id: string; name: string; code: string } | null;
  period: PeriodFigures;
  people: {
    volunteers: number;
    beneficiaries: number;
    newMembers: number;
    applicationsWaiting: number;
  };
  help: {
    requestsMade: number;
    requestsCompleted: number;
    requestsCancelled: number;
    requestsUnmatched: number;
    visitsCompleted: number;
    hoursConfirmed: number;
    peopleHelped: number;
    volunteersHelped: number;
  };
  /** Left empty when too few requests would make it one person's wait. */
  speed: { typicalMinutesToVolunteer: number | null };
  credits: {
    earned: number;
    donated: number;
    spent: number;
    held: number;
    released: number;
    corrected: number;
  };
  byService: VisitRow[];
  byWard: VisitRow[];
  safety: {
    alertsRaised: number;
    complaintsReceived: number;
    complaintOutcomes: CountRow[];
    restrictionsRecommended: number;
    restrictionDecisions: CountRow[];
    appealsFiled: number;
    appealOutcomes: CountRow[];
    closures: CountRow[];
  };
}
export interface CommunityRow {
  name: string;
  code: string;
  requestsMade: Shown;
  visits: Shown;
  hours: Shown;
  peopleHelped: Shown;
  volunteersHelped: Shown;
  creditsEarned: Shown;
}
export interface SummaryFigures extends StaffFigures {
  community: null;
  communities: CommunityRow[];
}
export interface SponsorFigures {
  community: { name: string; code: string };
  period: PeriodFigures;
  hoursOfHelp: number;
  visitsCompleted: number;
  peopleHelped: Shown;
  activeVolunteers: Shown;
  creditsEarned: number;
  topServices: VisitRow[];
}

type Community = { id: string; name: string; code: string };

const num = (value: unknown) => Number(value ?? 0);
const hoursOf = (minutes: number) => Math.round((minutes / 60) * 10) / 10;
const credits = (value: unknown) => Math.round(num(value) * 100) / 100;
const periodOf = (p: ReportPeriod): PeriodFigures => ({
  from: p.from,
  to: p.to,
  label: p.label,
  month: p.month,
});

const notRetired = (column: string) =>
  `NOT EXISTS (SELECT 1 FROM users retired WHERE retired.id=${column} AND retired.status='TEST_ACCOUNT_RETIRED')`;

/** Confirmed help in the period. Parameters: $1 community or null, $2 start, $3 end. */
const VISITS = `
  FROM volunteer_assignments a
  JOIN service_requests r ON r.id=a.service_request_id
  JOIN organization_memberships helper ON helper.id=a.volunteer_membership_id
  JOIN organization_memberships helped ON helped.id=r.beneficiary_membership_id
  WHERE a.status='COMPLETED' AND a.confirmed_at>=$2 AND a.confirmed_at<$3
    AND ($1::uuid IS NULL OR a.organization_id=$1)
    AND ${notRetired('helper.user_id')} AND ${notRetired('helped.user_id')}`;

function visitRows(rows: { label: string; visits: number; minutes: number }[]): VisitRow[] {
  const shown = hideSmallCounts(rows.map((row) => row.visits));
  return rows.map((row, index) => {
    const visits = shown[index] as Shown;
    return { label: row.label, visits, hours: followCount(visits, hoursOf(row.minutes)) };
  });
}

function countRows(rows: [label: string, count: number][]): CountRow[] {
  const shown = hideSmallCounts(rows.map(([, count]) => count));
  return rows.map(([label], index) => ({ label, count: shown[index] as Shown }));
}

async function serviceTotals(m: EntityManager, org: string | null, p: ReportPeriod) {
  // Across communities a service goes by its shared name, since each may label it differently.
  const label =
    org === null ? 'g.name_en' : `COALESCE(NULLIF(trim(c.custom_label_en),''),g.name_en)`;
  const rows: { label: string; visits: string; minutes: string }[] = await m.query(
    `SELECT ${label} AS label,count(*) AS visits,COALESCE(sum(a.confirmed_minutes),0) AS minutes
     FROM (SELECT a.*,r.service_catalog_id ${VISITS}) a
     JOIN organization_service_catalog c ON c.id=a.service_catalog_id
     JOIN global_service_definitions g ON g.id=c.global_service_id
     GROUP BY 1 ORDER BY count(*) DESC,1`,
    [org, p.startsAt, p.endsBefore],
  );
  return rows.map((row) => ({
    label: row.label,
    visits: num(row.visits),
    minutes: num(row.minutes),
  }));
}

async function wardRows(m: EntityManager, org: string, p: ReportPeriod): Promise<VisitRow[]> {
  const rows: { ward: string | null; visits: string; minutes: string }[] = await m.query(
    `SELECT r.location_ward_number AS ward,count(*) AS visits,
            COALESCE(sum(a.confirmed_minutes),0) AS minutes
     ${VISITS} GROUP BY 1`,
    [org, p.startsAt, p.endsBefore],
  );
  const wards = new Map<string, { label: string; visits: number; minutes: number }>();
  for (const row of rows) {
    const label = tidyWard(row.ward);
    const ward = wards.get(label) ?? { label, visits: 0, minutes: 0 };
    ward.visits += num(row.visits);
    ward.minutes += num(row.minutes);
    wards.set(label, ward);
  }
  const order = (label: string) =>
    label === OTHER_WARD ? Number.MAX_SAFE_INTEGER : Number.parseInt(label.slice(5), 10);
  return visitRows([...wards.values()].sort((a, b) => order(a.label) - order(b.label)));
}

async function visitTotals(m: EntityManager, org: string | null, p: ReportPeriod) {
  const [row]: { visits: string; minutes: string; people: string; volunteers: string }[] =
    await m.query(
      `SELECT count(*) AS visits,COALESCE(sum(a.confirmed_minutes),0) AS minutes,
              count(DISTINCT helped.user_id) AS people,count(DISTINCT helper.user_id) AS volunteers
       ${VISITS}`,
      [org, p.startsAt, p.endsBefore],
    );
  return {
    visits: num(row?.visits),
    minutes: num(row?.minutes),
    people: num(row?.people),
    volunteers: num(row?.volunteers),
  };
}

async function peopleFigures(m: EntityManager, org: string | null, p: ReportPeriod) {
  const [roles]: { volunteers: string; beneficiaries: string }[] = await m.query(
    `SELECT count(DISTINCT member.user_id) FILTER (WHERE grant_row.role='VOLUNTEER') AS volunteers,
            count(DISTINCT member.user_id) FILTER (WHERE grant_row.role='BENEFICIARY') AS beneficiaries
     FROM membership_role_grants grant_row
     JOIN organization_memberships member ON member.id=grant_row.membership_id
     JOIN users person ON person.id=member.user_id
     WHERE grant_row.status='ACTIVE' AND member.status='APPROVED' AND person.status='ACTIVE'
       AND ($1::uuid IS NULL OR member.organization_id=$1)`,
    [org],
  );
  const [joined]: { approved: string; waiting: string }[] = await m.query(
    `SELECT count(DISTINCT member.user_id)
              FILTER (WHERE member.approved_at>=$2 AND member.approved_at<$3) AS approved,
            count(DISTINCT member.user_id)
              FILTER (WHERE member.status IN ('APPLIED','PENDING_REVIEW')) AS waiting
     FROM organization_memberships member
     WHERE ($1::uuid IS NULL OR member.organization_id=$1) AND ${notRetired('member.user_id')}`,
    [org, p.startsAt, p.endsBefore],
  );
  return {
    volunteers: num(roles?.volunteers),
    beneficiaries: num(roles?.beneficiaries),
    newMembers: num(joined?.approved),
    applicationsWaiting: num(joined?.waiting),
  };
}

async function requestFigures(m: EntityManager, org: string | null, p: ReportPeriod) {
  const [row]: { made: string; completed: string; cancelled: string; unmatched: string }[] =
    await m.query(
      `SELECT
         count(*) FILTER (WHERE r.status<>'DRAFT' AND r.created_at>=$2 AND r.created_at<$3) AS made,
         count(*) FILTER (WHERE r.status='COMPLETED' AND done.at>=$2 AND done.at<$3) AS completed,
         count(*) FILTER (WHERE r.status='CANCELLED' AND stopped.at>=$2 AND stopped.at<$3) AS cancelled,
         count(*) FILTER (WHERE r.status='EXPIRED_UNMATCHED' AND r.updated_at>=$2 AND r.updated_at<$3) AS unmatched
       FROM service_requests r
       JOIN organization_memberships helped ON helped.id=r.beneficiary_membership_id
       LEFT JOIN LATERAL (SELECT max(a.confirmed_at) AS at FROM volunteer_assignments a
         WHERE a.service_request_id=r.id AND a.status='COMPLETED') done ON true
       LEFT JOIN LATERAL (SELECT max(c.cancelled_at) AS at FROM request_cancellations c
         WHERE c.service_request_id=r.id) stopped ON true
       WHERE ($1::uuid IS NULL OR r.organization_id=$1) AND ${notRetired('helped.user_id')}`,
      [org, p.startsAt, p.endsBefore],
    );
  return {
    requestsMade: num(row?.made),
    requestsCompleted: num(row?.completed),
    requestsCancelled: num(row?.cancelled),
    requestsUnmatched: num(row?.unmatched),
  };
}

async function typicalWait(m: EntityManager, org: string | null, p: ReportPeriod) {
  const [row]: { counted: string; minutes: string | null }[] = await m.query(
    `SELECT count(*) AS counted,
            percentile_cont(0.5) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (found.at-r.created_at))/60) AS minutes
     FROM service_requests r
     JOIN organization_memberships helped ON helped.id=r.beneficiary_membership_id
     JOIN LATERAL (SELECT min(a.accepted_at) AS at FROM volunteer_assignments a
       WHERE a.service_request_id=r.id) found ON found.at IS NOT NULL
     WHERE r.created_at>=$2 AND r.created_at<$3
       AND ($1::uuid IS NULL OR r.organization_id=$1) AND ${notRetired('helped.user_id')}`,
    [org, p.startsAt, p.endsBefore],
  );
  return num(row?.counted) < SMALL_COUNT_LIMIT ? null : Math.round(num(row?.minutes));
}

async function creditFigures(m: EntityManager, org: string | null, p: ReportPeriod) {
  const [row]: Record<string, string>[] = await m.query(
    `SELECT
       COALESCE(sum(l.amount) FILTER (WHERE l.tx_type='SERVICE_EARNED'),0) AS earned,
       COALESCE(sum(-l.amount) FILTER (WHERE l.tx_type='DONATION_SENT'),0) AS donated,
       COALESCE(sum(-l.amount) FILTER (WHERE l.tx_type='ASSISTANCE_SPENT'),0) AS spent,
       COALESCE(sum(l.frozen_delta) FILTER (WHERE l.frozen_delta>0),0) AS held,
       COALESCE(sum(l.amount) FILTER (WHERE l.tx_type IN ('FRAUD_RELEASED','FROZEN_RELEASED')),0) AS released,
       COALESCE(sum(-l.amount) FILTER (WHERE l.tx_type='CREDIT_CORRECTED'),0) AS corrected
     FROM time_credit_ledger l
     LEFT JOIN universal_time_wallets w ON w.id=l.wallet_id
     WHERE l.created_at>=$2 AND l.created_at<$3
       AND ($1::uuid IS NULL OR l.originating_org_id=$1)
       AND (w.id IS NULL OR ${notRetired('w.user_id')})`,
    [org, p.startsAt, p.endsBefore],
  );
  return {
    earned: credits(row?.['earned']),
    donated: credits(row?.['donated']),
    spent: credits(row?.['spent']),
    held: credits(row?.['held']),
    released: credits(row?.['released']),
    corrected: credits(row?.['corrected']),
  };
}

async function safetyFigures(m: EntityManager, org: string | null, p: ReportPeriod) {
  const inScope = '($1::uuid IS NULL OR organization_id=$1)';
  const [row]: Record<string, string>[] = await m.query(
    `SELECT
       (SELECT count(*) FROM safety_alerts WHERE ${inScope} AND created_at>=$2 AND created_at<$3
          AND ${notRetired('raised_by_user_id')}) AS alerts,
       (SELECT count(*) FROM complaints WHERE ${inScope} AND created_at>=$2 AND created_at<$3
          AND ${notRetired('raised_by_user_id')}) AS complaints,
       (SELECT count(*) FROM complaints WHERE ${inScope} AND decided_at>=$2 AND decided_at<$3
          AND outcome='UPHELD' AND ${notRetired('raised_by_user_id')}) AS upheld,
       (SELECT count(*) FROM complaints WHERE ${inScope} AND decided_at>=$2 AND decided_at<$3
          AND outcome='NOT_UPHELD' AND ${notRetired('raised_by_user_id')}) AS not_upheld,
       (SELECT count(*) FROM restriction_cases WHERE ${inScope} AND created_at>=$2 AND created_at<$3
          AND ${notRetired('subject_user_id')}) AS recommended,
       (SELECT count(*) FROM restriction_cases WHERE ${inScope} AND decided_at>=$2 AND decided_at<$3
          AND status<>'REFUSED' AND ${notRetired('subject_user_id')}) AS applied,
       (SELECT count(*) FROM restriction_cases WHERE ${inScope} AND decided_at>=$2 AND decided_at<$3
          AND status='REFUSED' AND ${notRetired('subject_user_id')}) AS refused,
       (SELECT count(*) FROM appeals WHERE ${inScope} AND created_at>=$2 AND created_at<$3
          AND ${notRetired('appellant_user_id')}) AS appeals,
       (SELECT count(*) FROM appeals WHERE ${inScope} AND decided_at>=$2 AND decided_at<$3
          AND outcome='STANDS' AND ${notRetired('appellant_user_id')}) AS stands,
       (SELECT count(*) FROM appeals WHERE ${inScope} AND decided_at>=$2 AND decided_at<$3
          AND outcome='OVERTURNED' AND ${notRetired('appellant_user_id')}) AS overturned,
       (SELECT count(*) FROM account_closures WHERE ${inScope} AND decided_at>=$2 AND decided_at<$3
          AND status<>'REFUSED' AND kind='DECEASED' AND ${notRetired('subject_user_id')}) AS deceased,
       (SELECT count(*) FROM account_closures WHERE ${inScope} AND decided_at>=$2 AND decided_at<$3
          AND status<>'REFUSED' AND kind='DUPLICATE' AND ${notRetired('subject_user_id')}) AS duplicate`,
    [org, p.startsAt, p.endsBefore],
  );
  const count = (key: string) => num(row?.[key]);
  return {
    alertsRaised: count('alerts'),
    complaintsReceived: count('complaints'),
    complaintOutcomes: countRows([
      ['Upheld', count('upheld')],
      ['Not upheld', count('not_upheld')],
    ]),
    restrictionsRecommended: count('recommended'),
    restrictionDecisions: countRows([
      ['Applied', count('applied')],
      ['Refused', count('refused')],
    ]),
    appealsFiled: count('appeals'),
    appealOutcomes: countRows([
      ['Decision stands', count('stands')],
      ['Overturned', count('overturned')],
    ]),
    closures: countRows([
      ['After a death', count('deceased')],
      ['Duplicate account', count('duplicate')],
    ]),
  };
}

export async function staffFigures(
  m: EntityManager,
  community: Community | null,
  p: ReportPeriod,
): Promise<StaffFigures> {
  const org = community?.id ?? null;
  const visits = await visitTotals(m, org, p);
  return {
    community,
    period: periodOf(p),
    people: await peopleFigures(m, org, p),
    help: {
      ...(await requestFigures(m, org, p)),
      visitsCompleted: visits.visits,
      hoursConfirmed: hoursOf(visits.minutes),
      peopleHelped: visits.people,
      volunteersHelped: visits.volunteers,
    },
    speed: { typicalMinutesToVolunteer: await typicalWait(m, org, p) },
    credits: await creditFigures(m, org, p),
    byService: visitRows(await serviceTotals(m, org, p)),
    byWard: org === null ? [] : await wardRows(m, org, p),
    safety: await safetyFigures(m, org, p),
  };
}

/** Every community side by side. A person helped in two communities counts once in the total. */
export async function summaryFigures(m: EntityManager, p: ReportPeriod): Promise<SummaryFigures> {
  const total = await staffFigures(m, null, p);
  const rows: {
    name: string;
    code: string;
    made: string;
    visits: string;
    minutes: string;
    people: string;
    volunteers: string;
    earned: string;
  }[] = await m.query(
    `SELECT o.name,o.code,COALESCE(made.count,0) AS made,COALESCE(seen.visits,0) AS visits,
            COALESCE(seen.minutes,0) AS minutes,COALESCE(seen.people,0) AS people,
            COALESCE(seen.volunteers,0) AS volunteers,COALESCE(paid.earned,0) AS earned
     FROM organizations o
     LEFT JOIN LATERAL (
       SELECT count(*) AS count FROM service_requests r
       JOIN organization_memberships helped ON helped.id=r.beneficiary_membership_id
       WHERE r.organization_id=o.id AND r.status<>'DRAFT' AND r.created_at>=$1 AND r.created_at<$2
         AND ${notRetired('helped.user_id')}) made ON true
     LEFT JOIN LATERAL (
       SELECT count(*) AS visits,sum(a.confirmed_minutes) AS minutes,
              count(DISTINCT helped.user_id) AS people,count(DISTINCT helper.user_id) AS volunteers
       FROM volunteer_assignments a
       JOIN service_requests r ON r.id=a.service_request_id
       JOIN organization_memberships helper ON helper.id=a.volunteer_membership_id
       JOIN organization_memberships helped ON helped.id=r.beneficiary_membership_id
       WHERE a.organization_id=o.id AND a.status='COMPLETED' AND a.confirmed_at>=$1 AND a.confirmed_at<$2
         AND ${notRetired('helper.user_id')} AND ${notRetired('helped.user_id')}) seen ON true
     LEFT JOIN LATERAL (
       SELECT sum(l.amount) AS earned FROM time_credit_ledger l
       LEFT JOIN universal_time_wallets w ON w.id=l.wallet_id
       WHERE l.originating_org_id=o.id AND l.tx_type='SERVICE_EARNED'
         AND l.created_at>=$1 AND l.created_at<$2 AND (w.id IS NULL OR ${notRetired('w.user_id')})
     ) paid ON true
     WHERE o.status='ACTIVE' OR COALESCE(made.count,0)+COALESCE(seen.visits,0)>0
     ORDER BY o.name`,
    [p.startsAt, p.endsBefore],
  );
  const hide = (key: 'made' | 'visits' | 'people' | 'volunteers') =>
    hideSmallCounts(rows.map((row) => num(row[key])));
  const [made, visits, people, volunteers] = [
    hide('made'),
    hide('visits'),
    hide('people'),
    hide('volunteers'),
  ];
  return {
    ...total,
    community: null,
    communities: rows.map((row, index) => {
      const shownVisits = visits[index] as Shown;
      return {
        name: row.name,
        code: row.code,
        requestsMade: made[index] as Shown,
        visits: shownVisits,
        hours: followCount(shownVisits, hoursOf(num(row.minutes))),
        peopleHelped: people[index] as Shown,
        volunteersHelped: volunteers[index] as Shown,
        creditsEarned: followCount(shownVisits, credits(row.earned)),
      };
    }),
  };
}

/** The narrower set a sponsor receives. Hidden counts are saved hidden, so nothing small is kept. */
export async function sponsorFigures(
  m: EntityManager,
  community: Community,
  p: ReportPeriod,
): Promise<SponsorFigures> {
  const totals = await visitTotals(m, community.id, p);
  const services = await serviceTotals(m, community.id, p);
  const rest = services.slice(TOP_SERVICES);
  const top = services.slice(0, TOP_SERVICES);
  if (rest.length > 0) {
    top.push({
      label: OTHER_SERVICES,
      visits: rest.reduce((sum, row) => sum + row.visits, 0),
      minutes: rest.reduce((sum, row) => sum + row.minutes, 0),
    });
  }
  const earned = await creditFigures(m, community.id, p);
  return {
    community: { name: community.name, code: community.code },
    period: periodOf(p),
    hoursOfHelp: hoursOf(totals.minutes),
    visitsCompleted: totals.visits,
    peopleHelped: hideSmallPeople(totals.people),
    activeVolunteers: hideSmallPeople(totals.volunteers),
    creditsEarned: earned.earned,
    topServices: visitRows(top),
  };
}
