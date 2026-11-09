import { SponsorFigures, StaffFigures, SummaryFigures, VisitRow } from './report-figures';
import { HIDDEN, SMALL, SMALL_COUNT_LIMIT } from './report-privacy';

export type Cell = string | number;
export interface ReportSection {
  title: string;
  columns: string[];
  rows: Cell[][];
}
/** One shape for all three file types, so a report reads the same in each. */
export interface ReportDocument {
  title: string;
  /** Community, period and when it was made. */
  details: [label: string, value: string][];
  sections: ReportSection[];
  notes: string[];
  /** Goes into the file name. */
  stem: string;
}

const HIDING_NOTE = `${SMALL} means fewer than ${SMALL_COUNT_LIMIT}. "${HIDDEN}" is held back so a small count cannot be worked out from the total.`;
const ONLY_COUNTS =
  'This report holds counts only. It names no member, phone number, address or request.';
const VISIT_NOTE =
  "A visit is one volunteer's confirmed help, counted in the month it was confirmed.";

const safeName = (value: string) => value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
const when = (at: Date) =>
  at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

const visitSection = (title: string, label: string, rows: VisitRow[]): ReportSection => ({
  title,
  columns: [label, 'Visits', 'Hours'],
  rows: rows.map((row) => [row.label, row.visits, row.hours]),
});

function staffSections(f: StaffFigures): ReportSection[] {
  const figures = ['Figure', 'Count'];
  return [
    {
      title: 'People, as of today',
      columns: figures,
      rows: [
        ['Volunteers', f.people.volunteers],
        ['Beneficiaries', f.people.beneficiaries],
        ['Applications waiting', f.people.applicationsWaiting],
      ],
    },
    {
      title: 'Help given',
      columns: figures,
      rows: [
        ['New members', f.people.newMembers],
        ['Requests made', f.help.requestsMade],
        ['Requests completed', f.help.requestsCompleted],
        ['Requests cancelled', f.help.requestsCancelled],
        ['Requests with no volunteer found', f.help.requestsUnmatched],
        ['Visits completed', f.help.visitsCompleted],
        ['Hours confirmed', f.help.hoursConfirmed],
        ['People helped', f.help.peopleHelped],
        ['Volunteers who helped', f.help.volunteersHelped],
        [
          'Typical minutes to find a volunteer',
          f.speed.typicalMinutesToVolunteer ?? `Too few requests`,
        ],
      ],
    },
    visitSection('Help by service', 'Service', f.byService),
    ...(f.community ? [visitSection('Help by ward', 'Ward', f.byWard)] : []),
    {
      title: 'Time credits',
      columns: ['Figure', 'Credits'],
      rows: [
        ['Earned', f.credits.earned],
        ['Donated', f.credits.donated],
        ['Spent', f.credits.spent],
        ['Put on hold', f.credits.held],
        ['Released from hold', f.credits.released],
        ['Removed after a review', f.credits.corrected],
      ],
    },
    {
      title: 'Local loyalty coins',
      columns: ['Figure', 'Coins'],
      rows: [
        ['Earned, including held awards', f.loyalty.earned],
        ['Redeemed with merchants', f.loyalty.redeemed],
        ['Earnings placed on hold', f.loyalty.held],
        ['Retired after account closure', f.loyalty.retired],
        ['Restored after reopening', f.loyalty.restored],
      ],
    },
    {
      title: 'Merchants, as of today',
      columns: figures,
      rows: [['Approved business records', f.loyalty.approvedMerchants]],
    },
    {
      title: 'Safety and governance',
      columns: figures,
      rows: [
        ['Safety alerts', f.safety.alertsRaised],
        ['Complaints received', f.safety.complaintsReceived],
        ...f.safety.complaintOutcomes.map((r): Cell[] => [`Complaints: ${r.label}`, r.count]),
        ['Restrictions recommended', f.safety.restrictionsRecommended],
        ...f.safety.restrictionDecisions.map((r): Cell[] => [`Restrictions: ${r.label}`, r.count]),
        ['Appeals filed', f.safety.appealsFiled],
        ...f.safety.appealOutcomes.map((r): Cell[] => [`Appeals: ${r.label}`, r.count]),
        ...f.safety.closures.map((r): Cell[] => [`Accounts closed: ${r.label}`, r.count]),
      ],
    },
  ];
}

export function staffDocument(f: StaffFigures, at: Date): ReportDocument {
  const community = f.community;
  return {
    title: 'Community report',
    details: [
      ['Community', community?.name ?? 'All communities'],
      ['Period', f.period.label],
      ['Made', when(at)],
    ],
    sections: staffSections(f),
    notes: [
      ONLY_COUNTS,
      HIDING_NOTE,
      VISIT_NOTE,
      'Time credits count under the community they came from. Credits passed to a nominee are not earnings.',
    ],
    stem: `${safeName(community?.code ?? 'community')}-report-${f.period.month ?? `${f.period.from}-to-${f.period.to}`}`,
  };
}

export function summaryDocument(f: SummaryFigures, at: Date): ReportDocument {
  const [people, help, ...rest] = staffSections(f);
  return {
    title: 'All communities report',
    details: [
      ['Community', 'All communities'],
      ['Period', f.period.label],
      ['Made', when(at)],
    ],
    sections: [
      ...(people ? [people] : []),
      ...(help ? [help] : []),
      {
        title: 'By community',
        columns: [
          'Community',
          'Requests',
          'Visits',
          'Hours',
          'People helped',
          'Volunteers',
          'Credits',
        ],
        rows: f.communities.map((row) => [
          row.name,
          row.requestsMade,
          row.visits,
          row.hours,
          row.peopleHelped,
          row.volunteersHelped,
          row.creditsEarned,
        ]),
      },
      ...rest,
    ],
    notes: [
      ONLY_COUNTS,
      HIDING_NOTE,
      VISIT_NOTE,
      'A person active in more than one community counts once in the total, so the total can be lower than the communities added up.',
    ],
    stem: `all-communities-report-${f.period.month ?? `${f.period.from}-to-${f.period.to}`}`,
  };
}

export function sponsorDocument(
  f: SponsorFigures,
  saved: { version: number; generatedAt: Date },
): ReportDocument {
  return {
    title: 'Impact report',
    details: [
      ['Community', f.community.name],
      ['Period', f.period.label],
      ['Version', String(saved.version)],
      ['Saved', when(saved.generatedAt)],
    ],
    sections: [
      {
        title: 'What the community did',
        columns: ['Figure', 'Count'],
        rows: [
          ['Hours of help', f.hoursOfHelp],
          ['Visits completed', f.visitsCompleted],
          ['People helped', f.peopleHelped],
          ['Active volunteers', f.activeVolunteers],
          ['Time credits earned', f.creditsEarned],
        ],
      },
      visitSection('Top services', 'Service', f.topServices),
    ],
    notes: [ONLY_COUNTS, HIDING_NOTE, VISIT_NOTE],
    stem: `${safeName(f.community.code)}-impact-${f.period.month ?? f.period.from}-v${saved.version}`,
  };
}
