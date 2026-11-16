'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { ApiError, backend, downloadFile } from '@/lib/api';
import type { Action } from '@/lib/admin-types';
import { indiaTime } from '@/lib/request-utils';
import { currentIndiaMonth, periodQuery, previousIndiaMonth, shown } from '@/lib/report-utils';
import type { ReportPeriodChoice, Shown } from '@/lib/report-utils';
import { ReportBars } from './dashboard-charts';

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
  community: { name: string } | null;
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
  loyalty?: {
    earned: number;
    redeemed: number;
    held: number;
    retired: number;
    restored: number;
    approvedMerchants: number;
  };
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
const REPORT_VIEWS = [
  { id: 'impact', label: 'Impact' },
  { id: 'coverage', label: 'Coverage' },
  { id: 'credits', label: 'Credits & loyalty' },
  { id: 'safety', label: 'Safety & governance' },
  { id: 'sponsor', label: 'Sponsor reports' },
] as const;
type ReportView = (typeof REPORT_VIEWS)[number]['id'];

function impactMetrics(figures: Figures) {
  return [
    { label: 'Hours confirmed', value: figures.help.hoursConfirmed, unit: 'h' },
    { label: 'Visits completed', value: figures.help.visitsCompleted },
    { label: 'People helped', value: figures.help.peopleHelped },
    { label: 'Volunteers who helped', value: figures.help.volunteersHelped },
    { label: 'Requests made', value: figures.help.requestsMade },
    {
      label: 'Median wait for a volunteer',
      value: figures.speed.typicalMinutesToVolunteer,
      unit: 'min',
    },
  ];
}

function reportChange(value: number | null, previous: number | null | undefined) {
  if (value === null || previous == null) return 'Comparison unavailable';
  const difference = Math.round((value - previous) * 100) / 100;
  if (difference === 0) return 'Same as previous month';
  return (difference > 0 ? '+' : '−') + shown(Math.abs(difference)) + ' vs previous month';
}

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
    <div className="table-container glass-panel report-table-container">
      <table className="custom-table report-table report-table-compact">
        <caption className="report-caption">{title}</caption>
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
    <div className="table-container glass-panel report-table-container">
      <table className="custom-table report-table report-table-compact">
        <caption className="report-caption">{title}</caption>
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
  const [reportView, setReportView] = useState<ReportView>('impact');
  const isSponsor = reportView === 'sponsor';
  const [compare, setCompare] = useState(false);
  const [report, setReport] = useState<{ key: string; data: Figures } | null>(null);
  const [comparison, setComparison] = useState<{ key: string; data: Figures | null } | null>(null);
  const [sponsor, setSponsor] = useState<SponsorReport[] | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');
  const [reload, setReload] = useState(0);
  const base = organizationId ? `/organizations/${organizationId}/reports` : '/admin/reports';
  const query = periodQuery(choice);
  const thisMonth = currentIndiaMonth(new Date());
  const lastMonth = previousIndiaMonth(new Date());
  const completedMonth =
    choice.mode === 'month' && Boolean(choice.month) && choice.month < thisMonth;
  const previousMonth = completedMonth
    ? previousIndiaMonth(new Date(choice.month + '-15T00:00:00Z'))
    : null;
  const reportKey = base + '?' + query + ':' + revision + ':' + reload;
  const comparisonKey = reportKey + ':' + previousMonth;
  const figures = report?.key === reportKey && query !== null ? report.data : null;
  const prior = compare && comparison?.key === comparisonKey ? comparison.data : null;
  const compareLoading = compare && previousMonth && comparison?.key !== comparisonKey;

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
    if (query === null || isSponsor) return;
    setError('');
    const controller = new AbortController();
    backend<Figures>(`${base}?${query}`, 'GET', undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setReport({ key: reportKey, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted) failed(error);
      });
    return () => controller.abort();
  }, [base, query, reportKey, failed, isSponsor]);

  useEffect(() => {
    if (!compare || !previousMonth || reportView !== 'impact') return;
    const controller = new AbortController();
    backend<Figures>(
      `${base}?month=${encodeURIComponent(previousMonth)}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setComparison({ key: comparisonKey, data });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) onExpired();
        setComparison({ key: comparisonKey, data: null });
      });
    return () => controller.abort();
  }, [base, compare, comparisonKey, onExpired, previousMonth, reportView]);

  useEffect(() => {
    if (!organizationId || reportView !== 'sponsor') return;
    setError('');
    setSponsor(null);
    const controller = new AbortController();
    backend<SponsorReport[]>(`${base}/sponsor`, 'GET', undefined, controller.signal)
      .then(setSponsor)
      .catch(failed);
    return () => controller.abort();
  }, [base, organizationId, revision, failed, reportView, reload]);

  function selectMonth(month: string) {
    setError('');
    setChoice({ mode: 'month', month, from: '', to: '' });
    if (month >= thisMonth) setCompare(false);
  }

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
    <div className="reports-workspace">
      <header className="reports-intro">
        <div>
          <h2>Community analytics</h2>
          <p>
            {report?.data.community?.name ??
              (organizationId ? 'Selected community' : 'All organizations')}
          </p>
        </div>
        {reportView !== 'sponsor' && (
          <div className="action-row">
            {FORMATS.map(({ format, label }) => (
              <button
                key={format}
                className={`btn report-export report-export-${format}`}
                disabled={!figures || Boolean(downloading)}
                onClick={() => void download(`${base}/download?${query}&format=${format}`, format)}
              >
                {downloading === format ? 'Preparing…' : `Download ${label}`}
              </button>
            ))}
          </div>
        )}
      </header>
      <nav className="reports-navigation" aria-label="Report views">
        {REPORT_VIEWS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-current={id === reportView ? 'page' : undefined}
            onClick={() => {
              if (id === reportView) return;
              setReportView(id);
              if (reportView === 'sponsor' || id === 'sponsor') {
                setError('');
                setReload((value) => value + 1);
              }
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {reportView !== 'sponsor' && (
        <>
          <div className="toolbar report-filters">
            <div className="report-presets" role="group" aria-label="Quick report period">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                aria-pressed={choice.mode === 'month' && choice.month === thisMonth}
                onClick={() => selectMonth(thisMonth)}
              >
                This month
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                aria-pressed={choice.mode === 'month' && choice.month === lastMonth}
                onClick={() => selectMonth(lastMonth)}
              >
                Last month
              </button>
            </div>
            <label>
              Period
              <select
                className="form-input"
                value={choice.mode}
                onChange={(event) => {
                  setError('');
                  setChoice({ ...choice, mode: event.target.value as ReportPeriodChoice['mode'] });
                  setCompare(false);
                }}
              >
                <option value="month">A month</option>
                <option value="range">Between two dates</option>
              </select>
            </label>
            {choice.mode === 'month' ? (
              <label>
                Month
                <input
                  className="form-input"
                  type="month"
                  value={choice.month}
                  max={thisMonth}
                  onChange={(event) => selectMonth(event.target.value)}
                />
              </label>
            ) : (
              <>
                <label>
                  From
                  <input
                    className="form-input"
                    type="date"
                    value={choice.from}
                    onChange={(event) => {
                      setError('');
                      setChoice({ ...choice, from: event.target.value });
                    }}
                  />
                </label>
                <label>
                  To
                  <input
                    className="form-input"
                    type="date"
                    value={choice.to}
                    onChange={(event) => {
                      setError('');
                      setChoice({ ...choice, to: event.target.value });
                    }}
                  />
                </label>
              </>
            )}
            {reportView === 'impact' && completedMonth && (
              <label className="report-compare">
                <input
                  type="checkbox"
                  checked={compare}
                  onChange={(event) => setCompare(event.target.checked)}
                />
                Compare with previous month
              </label>
            )}
          </div>
          <p className="report-period-label">
            {figures?.period.label ?? 'Selected period'} <span>India time</span>
          </p>
          <details className="report-privacy-note">
            <summary>How report figures are displayed</summary>
            <p>
              Small breakdowns appear as &lt;5 or hidden in the tables. Charts use published
              numbers. Downloads are recorded.
            </p>
          </details>
        </>
      )}
      {error && (
        <div role="alert" className="report-error">
          <p className="error-message">{error}</p>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => {
              setError('');
              setReload((value) => value + 1);
            }}
          >
            Retry report
          </button>
        </div>
      )}
      {reportView !== 'sponsor' && query === null && (
        <p className="glass-panel empty-state">
          {choice.mode === 'month' ? 'Choose a month.' : 'Choose both dates.'}
        </p>
      )}
      {reportView !== 'sponsor' && query !== null && !figures && !error && (
        <p role="status">Loading report…</p>
      )}
      {figures && reportView === 'impact' && (
        <>
          {compare && completedMonth && (
            <p className="analytics-note" role="status">
              {compareLoading
                ? 'Loading previous month…'
                : prior
                  ? 'Compared with ' + prior.period.label
                  : 'Previous month figures are unavailable.'}
            </p>
          )}
          <div className="metric-grid reports-metrics">
            {impactMetrics(figures).map(({ label, value, unit }, index) => (
              <div className="metric-card glass-panel report-metric-card" key={label}>
                <div>
                  <div className="metric-label">{label}</div>
                  <div className="metric-value">
                    {value === null ? '—' : shown(value)}
                    {value !== null && unit && <small>{unit}</small>}
                  </div>
                  {value === null && <p className="report-metric-detail">Too few requests</p>}
                  {prior && (
                    <p className="report-metric-detail">
                      {reportChange(value, impactMetrics(prior)[index]?.value)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="analytics-report-grid">
            <ReportBars
              title="Request activity"
              description="Requests created or reaching each outcome during this period"
              unit="Requests"
              rows={[
                { label: 'Created', value: figures.help.requestsMade },
                { label: 'Completed', value: figures.help.requestsCompleted },
                { label: 'Cancelled', value: figures.help.requestsCancelled },
                { label: 'Unmatched', value: figures.help.requestsUnmatched },
              ]}
            />
            <ReportBars
              title="Help by service"
              description="Confirmed volunteer hours"
              unit="Hours"
              color="#087f76"
              rows={figures.byService.map((row) => ({ label: row.label, value: row.hours }))}
            />
          </div>
          <div className="analytics-report-grid">
            <FigureTable
              title="People today"
              rows={[
                ['Volunteers', figures.people.volunteers],
                ['Beneficiaries', figures.people.beneficiaries],
                ['Applications waiting', figures.people.applicationsWaiting],
              ]}
            />
            <FigureTable
              title="Activity in this period"
              rows={[
                ['New members', figures.people.newMembers],
                ['Requests made', figures.help.requestsMade],
                ['Requests completed', figures.help.requestsCompleted],
                ['Requests cancelled', figures.help.requestsCancelled],
                ['Requests with no volunteer found', figures.help.requestsUnmatched],
              ]}
            />
          </div>
        </>
      )}
      {figures && reportView === 'coverage' && (
        <>
          <div className="analytics-report-grid">
            <ReportBars
              title="Visits by service"
              description="Verified visits by type of help"
              unit="Visits"
              rows={figures.byService.map((row) => ({ label: row.label, value: row.visits }))}
            />
            <ReportBars
              title={organizationId ? 'Visits by ward' : 'Visits by community'}
              description="Verified visits in the selected period"
              unit="Visits"
              color="#087f76"
              rows={
                organizationId
                  ? figures.byWard.map((row) => ({ label: row.label, value: row.visits }))
                  : (figures.communities ?? []).map((row) => ({
                      label: row.name,
                      value: row.visits,
                    }))
              }
            />
          </div>
          {figures.communities && (
            <div className="table-container glass-panel report-table-container">
              <table className="custom-table report-table">
                <caption className="report-caption">
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
          <VisitTable title="Help by service" label="Service" rows={figures.byService} />
          {organizationId && <VisitTable title="Help by ward" label="Ward" rows={figures.byWard} />}
        </>
      )}
      {figures && reportView === 'credits' && (
        <>
          <div className="analytics-report-grid">
            <ReportBars
              title="Time-credit activity"
              unit="Credits"
              rows={[
                { label: 'Earned', value: figures.credits.earned },
                { label: 'Donated', value: figures.credits.donated },
                { label: 'Spent', value: figures.credits.spent },
                { label: 'Put on hold', value: figures.credits.held },
              ]}
            />
            {figures.loyalty && (
              <ReportBars
                title="Local loyalty activity"
                unit="Coins"
                color="#087f76"
                rows={[
                  { label: 'Earned', value: figures.loyalty.earned },
                  { label: 'Redeemed', value: figures.loyalty.redeemed },
                  { label: 'Put on hold', value: figures.loyalty.held },
                  { label: 'Retired', value: figures.loyalty.retired },
                  { label: 'Restored', value: figures.loyalty.restored },
                ]}
              />
            )}
          </div>
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
          {figures.loyalty && (
            <>
              <FigureTable
                title="Local loyalty coins"
                unit="Coins"
                rows={[
                  ['Earned, including held awards', figures.loyalty.earned],
                  ['Redeemed with merchants', figures.loyalty.redeemed],
                  ['Earnings placed on hold', figures.loyalty.held],
                  ['Retired after account closure', figures.loyalty.retired],
                  ['Restored after reopening', figures.loyalty.restored],
                ]}
              />
              <FigureTable
                title="Merchants, as of today"
                rows={[['Approved business records', figures.loyalty.approvedMerchants]]}
              />
            </>
          )}
        </>
      )}
      {figures && reportView === 'safety' && (
        <>
          <ReportBars
            title="Safety and governance activity"
            description="Cases and actions recorded in the selected period"
            unit="Cases"
            color="#2c67b7"
            rows={[
              { label: 'Safety alerts', value: figures.safety.alertsRaised },
              { label: 'Complaints', value: figures.safety.complaintsReceived },
              { label: 'Restrictions recommended', value: figures.safety.restrictionsRecommended },
              { label: 'Appeals', value: figures.safety.appealsFiled },
            ]}
          />
          <FigureTable
            title="Safety and governance details"
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

      {reportView === 'sponsor' && (
        <>
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
            <p className="glass-panel empty-state">
              Choose a community to see its sponsor reports.
            </p>
          )}
          {organizationId && (
            <p className="help-text">
              Saved on the 1st of each month. They leave out safety matters, complaints,
              restrictions, closures and budgets. Download one and send it yourself; sponsors have
              no login.
            </p>
          )}
          {organizationId && sponsor === null && !error && (
            <p role="status">Loading saved reports…</p>
          )}
          {organizationId && sponsor?.length === 0 && (
            <p className="glass-panel empty-state">No sponsor reports yet.</p>
          )}
        </>
      )}
      {organizationId && sponsor && sponsor.length > 0 && (
        <div className="table-container glass-panel report-table-container">
          <table className="custom-table report-table">
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
