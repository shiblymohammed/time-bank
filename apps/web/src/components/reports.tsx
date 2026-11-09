'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { ApiError, backend, downloadFile } from '@/lib/api';
import type { Action } from '@/lib/admin-types';
import { indiaTime } from '@/lib/request-utils';
import { currentIndiaMonth, periodQuery, previousIndiaMonth, shown } from '@/lib/report-utils';
import type { ReportPeriodChoice, Shown } from '@/lib/report-utils';

type VisitRow = { label: string; visits: Shown; hours: Shown };
type CountRow = { label: string; count: Shown };
type CommunityRow = {
  name: string;
  code: string;
  requestsMade: Shown;
  visits: Shown;
  hours: Shown;
  peopleHelped: Shown;
  volunteersHelped: Shown;
  creditsEarned: Shown;
};
type Figures = {
  period: { label: string };
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
  communities?: CommunityRow[];
};
type SponsorReport = {
  id: string;
  month: string;
  label: string;
  version: number;
  source: 'MONTHLY_JOB' | 'STAFF';
  generatedAt: string;
  figures: {
    hoursOfHelp: number;
    visitsCompleted: number;
    peopleHelped: Shown;
    activeVolunteers: Shown;
  };
};

const FORMATS = [
  { format: 'pdf', label: 'PDF' },
  { format: 'xlsx', label: 'Excel' },
  { format: 'csv', label: 'CSV' },
];
const SPONSOR_FORMATS = FORMATS.filter(({ format }) => format !== 'xlsx');

function FigureTable({
  title,
  rows,
  unit = 'Count',
}: {
  title: string;
  rows: [label: string, value: Shown][];
  unit?: string;
}) {
  return (
    <div className="table-container glass-panel">
      <table className="custom-table">
        <caption className="help-text">{title}</caption>
        <thead>
          <tr>
            <th scope="col">Figure</th>
            <th scope="col">{unit}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{shown(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VisitTable({ title, label, rows }: { title: string; label: string; rows: VisitRow[] }) {
  if (rows.length === 0) {
    return <p className="glass-panel empty-state">{title}: nothing in this period.</p>;
  }
  return (
    <div className="table-container glass-panel">
      <table className="custom-table">
        <caption className="help-text">{title}</caption>
        <thead>
          <tr>
            <th scope="col">{label}</th>
            <th scope="col">Visits</th>
            <th scope="col">Hours</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{shown(row.visits)}</td>
              <td>{shown(row.hours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Reports({
  organizationId,
  revision,
  pending,
  openAction,
  onExpired,
}: {
  organizationId: string | null;
  revision: number;
  pending: boolean;
  openAction: (action: Action) => void;
  onExpired: () => void;
}) {
  const [choice, setChoice] = useState<ReportPeriodChoice>({
    mode: 'month',
    month: currentIndiaMonth(new Date()),
    from: '',
    to: '',
  });
  const [figures, setFigures] = useState<Figures | null>(null);
  const [sponsor, setSponsor] = useState<SponsorReport[] | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');
  const base = organizationId ? `/organizations/${organizationId}/reports` : '/admin/reports';
  const query = periodQuery(choice);

  const failed = useCallback(
    (reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      if (reason instanceof ApiError && reason.status === 401) {
        onExpired();
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Could not load the report');
    },
    [onExpired],
  );

  useEffect(() => {
    if (query === null) return;
    const controller = new AbortController();
    setError('');
    setFigures(null);
    backend<Figures>(`${base}?${query}`, 'GET', undefined, controller.signal)
      .then(setFigures)
      .catch(failed);
    return () => controller.abort();
  }, [base, query, revision, failed]);

  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    backend<SponsorReport[]>(`${base}/sponsor`, 'GET', undefined, controller.signal)
      .then(setSponsor)
      .catch(failed);
    return () => controller.abort();
  }, [base, organizationId, revision, failed]);

  const download = async (path: string, key: string) => {
    setDownloading(key);
    setError('');
    try {
      await downloadFile(path);
    } catch (reason) {
      failed(reason);
    } finally {
      setDownloading('');
    }
  };

  const saveVersion = () =>
    openAction({
      title: 'Save a sponsor report',
      description:
        'This saves the figures as they stand. Reports already saved for that month stay as they are, so what a sponsor was sent can always be produced again.',
      submitLabel: 'Save report',
      fields: [
        {
          key: 'month',
          label: 'Month',
          type: 'month',
          value: previousIndiaMonth(new Date()),
          max: previousIndiaMonth(new Date()),
        },
      ],
      submit: (values) => backend(`${base}/sponsor`, 'POST', { month: values.month }),
      successMessage: () => 'Sponsor report saved.',
    });

  return (
    <div className="request-workspace">
      <div className="section-heading">
        <h2>Reports{figures ? `: ${figures.period.label}` : ''}</h2>
        <div className="action-row">
          {FORMATS.map(({ format, label }) => (
            <button
              key={format}
              className="btn btn-secondary"
              disabled={query === null || Boolean(downloading)}
              onClick={() => void download(`${base}/download?${query}&format=${format}`, format)}
            >
              {downloading === format ? 'Preparing…' : `Download ${label}`}
            </button>
          ))}
        </div>
      </div>
      <div className="toolbar">
        <label>
          Period
          <select
            value={choice.mode}
            onChange={(event) =>
              setChoice({ ...choice, mode: event.target.value as ReportPeriodChoice['mode'] })
            }
          >
            <option value="month">A month</option>
            <option value="range">Between two dates</option>
          </select>
        </label>
        {choice.mode === 'month' ? (
          <label>
            Month
            <input
              type="month"
              value={choice.month}
              max={currentIndiaMonth(new Date())}
              onChange={(event) => setChoice({ ...choice, month: event.target.value })}
            />
          </label>
        ) : (
          <>
            <label>
              From
              <input
                type="date"
                value={choice.from}
                onChange={(event) => setChoice({ ...choice, from: event.target.value })}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={choice.to}
                onChange={(event) => setChoice({ ...choice, to: event.target.value })}
              />
            </label>
          </>
        )}
      </div>
      <p className="help-text">
        Counts only, in India time. No names, phone numbers or addresses. A count under 5 in a table
        shows as &lt;5, and &quot;hidden&quot; stops it being worked out from the total. Every
        download is recorded.
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {query === null && <p className="glass-panel empty-state">Choose both dates.</p>}
      {query !== null && !figures && !error && <p role="status">Working out the figures…</p>}
      {figures && (
        <>
          <div className="metric-grid">
            {(
              [
                ['Hours confirmed', figures.help.hoursConfirmed],
                ['Visits completed', figures.help.visitsCompleted],
                ['People helped', figures.help.peopleHelped],
                ['Volunteers who helped', figures.help.volunteersHelped],
                ['Requests made', figures.help.requestsMade],
                [
                  'Typical minutes to find a volunteer',
                  figures.speed.typicalMinutesToVolunteer ?? 'Too few requests',
                ],
              ] as [string, Shown][]
            ).map(([label, value]) => (
              <div className="metric-card glass-panel" key={label}>
                <div>
                  <div className="metric-label">{label}</div>
                  <div className="metric-value">{shown(value)}</div>
                </div>
              </div>
            ))}
          </div>
          {figures.communities && (
            <div className="table-container glass-panel">
              <table className="custom-table">
                <caption className="help-text">
                  By community. A person active in several communities counts once in the totals
                  above, so the totals can be lower than these rows added up.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Community</th>
                    <th scope="col">Requests</th>
                    <th scope="col">Visits</th>
                    <th scope="col">Hours</th>
                    <th scope="col">People helped</th>
                    <th scope="col">Volunteers</th>
                    <th scope="col">Credits earned</th>
                  </tr>
                </thead>
                <tbody>
                  {figures.communities.map((row) => (
                    <tr key={row.code}>
                      <td>{row.name}</td>
                      <td>{shown(row.requestsMade)}</td>
                      <td>{shown(row.visits)}</td>
                      <td>{shown(row.hours)}</td>
                      <td>{shown(row.peopleHelped)}</td>
                      <td>{shown(row.volunteersHelped)}</td>
                      <td>{shown(row.creditsEarned)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <FigureTable
            title="People, as of today"
            rows={[
              ['Volunteers', figures.people.volunteers],
              ['Beneficiaries', figures.people.beneficiaries],
              ['Applications waiting', figures.people.applicationsWaiting],
            ]}
          />
          <FigureTable
            title="Help given in this period"
            rows={[
              ['New members', figures.people.newMembers],
              ['Requests completed', figures.help.requestsCompleted],
              ['Requests cancelled', figures.help.requestsCancelled],
              ['Requests with no volunteer found', figures.help.requestsUnmatched],
            ]}
          />
          <VisitTable title="Help by service" label="Service" rows={figures.byService} />
          {organizationId && <VisitTable title="Help by ward" label="Ward" rows={figures.byWard} />}
          <FigureTable
            title="Time credits, under the community they came from"
            unit="Credits"
            rows={[
              ['Earned', figures.credits.earned],
              ['Donated', figures.credits.donated],
              ['Spent', figures.credits.spent],
              ['Put on hold', figures.credits.held],
              ['Released from hold', figures.credits.released],
              ['Removed after a review', figures.credits.corrected],
            ]}
          />
          <FigureTable
            title="Safety and governance"
            rows={[
              ['Safety alerts', figures.safety.alertsRaised],
              ['Complaints received', figures.safety.complaintsReceived],
              ...figures.safety.complaintOutcomes.map((row): [string, Shown] => [
                `Complaints: ${row.label}`,
                row.count,
              ]),
              ['Restrictions recommended', figures.safety.restrictionsRecommended],
              ...figures.safety.restrictionDecisions.map((row): [string, Shown] => [
                `Restrictions: ${row.label}`,
                row.count,
              ]),
              ['Appeals filed', figures.safety.appealsFiled],
              ...figures.safety.appealOutcomes.map((row): [string, Shown] => [
                `Appeals: ${row.label}`,
                row.count,
              ]),
              ...figures.safety.closures.map((row): [string, Shown] => [
                `Accounts closed: ${row.label}`,
                row.count,
              ]),
            ]}
          />
        </>
      )}

      <div className="section-heading">
        <h2>Sponsor reports</h2>
        {organizationId && (
          <div className="action-row">
            <button className="btn btn-primary" disabled={pending} onClick={saveVersion}>
              Save a report
            </button>
          </div>
        )}
      </div>
      {!organizationId && (
        <p className="glass-panel empty-state">Choose a community to see its sponsor reports.</p>
      )}
      {organizationId && (
        <p className="help-text">
          Saved on the 1st of each month. They leave out safety matters, complaints, restrictions,
          closures and budgets. Download one and send it yourself; sponsors have no login.
        </p>
      )}
      {organizationId && sponsor?.length === 0 && (
        <p className="glass-panel empty-state">No sponsor reports yet.</p>
      )}
      {organizationId && sponsor && sponsor.length > 0 && (
        <div className="table-container glass-panel">
          <table className="custom-table">
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Version</th>
                <th scope="col">Saved</th>
                <th scope="col">Hours</th>
                <th scope="col">Visits</th>
                <th scope="col">People helped</th>
                <th scope="col">Volunteers</th>
                <th scope="col">Download</th>
              </tr>
            </thead>
            <tbody>
              {sponsor.map((report) => (
                <tr key={report.id}>
                  <td>{report.label}</td>
                  <td>{report.version}</td>
                  <td>
                    {indiaTime(report.generatedAt)}
                    {report.source === 'MONTHLY_JOB' ? ' (monthly)' : ' (by staff)'}
                  </td>
                  <td>{shown(report.figures.hoursOfHelp)}</td>
                  <td>{shown(report.figures.visitsCompleted)}</td>
                  <td>{shown(report.figures.peopleHelped)}</td>
                  <td>{shown(report.figures.activeVolunteers)}</td>
                  <td>
                    <div className="action-row">
                      {SPONSOR_FORMATS.map(({ format, label }) => (
                        <button
                          key={format}
                          className="btn btn-sm btn-secondary"
                          disabled={Boolean(downloading)}
                          onClick={() =>
                            void download(
                              `${base}/sponsor/${report.id}/download?format=${format}`,
                              `${report.id}${format}`,
                            )
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
