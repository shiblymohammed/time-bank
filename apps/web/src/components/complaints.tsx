'use client';
import React, { useEffect, useState } from 'react';
import { ApiError, backend } from '@/lib/api';
import type { Action } from '@/lib/admin-types';
import { Icon } from '@/components/icons';
import { indiaTime } from '@/lib/request-utils';

type Summary = {
  id: string;
  organizationId: string;
  organizationName: string | null;
  reference: string;
  subject: 'SERVICE_OR_MEMBER' | 'COORDINATOR' | 'MUNICIPALITY_ADMIN';
  level: 'COORDINATOR' | 'MUNICIPALITY_ADMIN' | 'SUPER_ADMIN';
  status: 'OPEN' | 'IN_REVIEW' | 'CLOSED';
  outcome: 'UPHELD' | 'NOT_UPHELD' | null;
  hasVisit: boolean;
  beingHandled: boolean;
  createdAt: string;
  decidedAt: string | null;
};
type Detail = Summary & {
  description: string;
  raisedByName: string | null;
  raisedByPhone: string | null;
  raisedByMemberNumber: string | null;
  handledByName: string | null;
  memberMessage: string | null;
  visit: {
    requestNumber: string;
    serviceName: string;
    scheduledStartTime: string;
    beneficiaryName: string | null;
    volunteerNames: string[];
  } | null;
  events: {
    id: string;
    type: 'RAISED' | 'TAKEN' | 'NOTE' | 'PASSED_UP' | 'DECIDED' | 'APPEALED' | 'APPEAL_DECIDED';
    notes: string | null;
    actorName: string | null;
    createdAt: string;
  }[];
};

const REFRESH_MS = 60_000;
const SUBJECT: Record<Summary['subject'], string> = {
  SERVICE_OR_MEMBER: 'A volunteer, member or the service',
  COORDINATOR: 'A coordinator',
  MUNICIPALITY_ADMIN: 'A municipality administrator',
};
const LEVEL: Record<Summary['level'], string> = {
  COORDINATOR: 'Coordinators',
  MUNICIPALITY_ADMIN: 'Municipality administrator',
  SUPER_ADMIN: 'Super Admin',
};
const EVENT: Record<Detail['events'][number]['type'], string> = {
  RAISED: 'Made by the member',
  TAKEN: 'Taken on',
  NOTE: 'Note',
  PASSED_UP: 'Passed up',
  DECIDED: 'Closed',
  APPEALED: 'Appealed by the member',
  APPEAL_DECIDED: 'Appeal decided',
};
const outcomeText = (outcome: Summary['outcome']) =>
  outcome === 'UPHELD' ? 'Upheld' : 'Not upheld';
const statusText = (row: Summary) =>
  row.status === 'CLOSED'
    ? `Closed: ${outcomeText(row.outcome).toLowerCase()}`
    : row.status === 'IN_REVIEW'
      ? 'Being handled'
      : 'New';
const listPath = (organizationId: string | null, open: boolean) =>
  `${organizationId ? `/organizations/${organizationId}/complaints` : '/admin/complaints'}${open ? '' : '?open=false'}`;

/** How many complaints this person could pick up. A null scope means every community. */
export function useOpenComplaints(
  enabled: boolean,
  organizationId: string | null,
  revision: number,
): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    const controller = new AbortController();
    const check = () =>
      backend<Summary[]>(listPath(organizationId, true), 'GET', undefined, controller.signal)
        .then((rows) => setCount(rows.length))
        // A dropped connection keeps the last count.
        .catch(() => undefined);
    void check();
    const timer = setInterval(() => void check(), REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [enabled, organizationId, revision]);
  return count;
}

export function Complaints({
  organizationId,
  isGlobal,
  revision,
  pending,
  openAction,
  onExpired,
}: {
  organizationId: string | null;
  isGlobal: boolean;
  revision: number;
  pending: boolean;
  openAction: (action: Action) => void;
  onExpired: () => void;
}) {
  const [rows, setRows] = useState<Summary[] | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [chosen, setChosen] = useState<Summary | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');

  const failed = (cause: unknown, fallback: string) => {
    if (cause instanceof ApiError && cause.status === 401) onExpired();
    else setError(cause instanceof Error ? cause.message : fallback);
  };

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      backend<Summary[]>(listPath(organizationId, !showClosed), 'GET', undefined, controller.signal)
        .then((next) => {
          setRows(next);
          setError('');
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) failed(cause, 'Could not load complaints');
        });
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [organizationId, showClosed, revision]);

  useEffect(() => {
    setDetail(null);
    if (!chosen) return;
    const controller = new AbortController();
    backend<Detail>(
      `/organizations/${chosen.organizationId}/complaints/${chosen.id}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then(setDetail)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        // Passed up beyond this person's reach: it has left their hands.
        if (cause instanceof ApiError && cause.status === 404) setChosen(null);
        else failed(cause, 'Could not open this complaint');
      });
    return () => controller.abort();
  }, [chosen?.id, chosen?.organizationId, revision]);

  const base = detail && `/organizations/${detail.organizationId}/complaints/${detail.id}`;
  const closed = detail?.status === 'CLOSED';

  const totalComplaints = rows?.length ?? 0;
  const openComplaints = rows?.filter((r) => r.status === 'OPEN').length ?? 0;
  const inReviewComplaints = rows?.filter((r) => r.status === 'IN_REVIEW').length ?? 0;
  const closedComplaints = rows?.filter((r) => r.status === 'CLOSED').length ?? 0;

  return (
    <div className="request-workspace request-page">
      <div className="section-heading request-page-heading">
        <div>
          <h2>Complaints & Grievances</h2>
          <p className="section-description">
            Confidential member complaints, escalations, and dispute resolution.
          </p>
        </div>
        <label className="coordinator-filter-checkbox inline-check">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(event) => setShowClosed(event.target.checked)}
          />
          Show closed complaints
        </label>
      </div>

      {/* KPI Stat Cards */}
      <div className="coordinator-kpi-row">
        {[
          {
            name: 'Total Complaints',
            val: totalComplaints,
            icon: 'complaints',
            color: 'var(--admin-link, #2563EB)',
            glow: 'rgba(37, 99, 235, 0.08)',
            tone: 'blue',
            pill: showClosed ? 'All recorded' : 'Active queue',
          },
          {
            name: 'New / Open',
            val: openComplaints,
            icon: 'clock',
            color: '#D97706',
            glow: 'rgba(217, 119, 6, 0.08)',
            tone: 'amber',
            pill: 'Needs coordinator',
          },
          {
            name: 'Under Review',
            val: inReviewComplaints,
            icon: 'lightning',
            color: 'var(--admin-link, #7C3AED)',
            glow: 'rgba(124, 58, 237, 0.08)',
            tone: 'purple',
            pill: 'Being investigated',
          },
          {
            name: 'Resolved & Decided',
            val: closedComplaints,
            icon: 'check',
            color: 'var(--admin-success, #059669)',
            glow: 'rgba(5, 150, 105, 0.08)',
            tone: 'emerald',
            pill: 'Decisions rendered',
          },
        ].map((kpi) => (
          <div
            className={`modern-kpi-card kpi-tone-${kpi.tone}`}
            key={kpi.name}
            style={
              {
                '--kpi-color': kpi.color,
                '--kpi-glow': kpi.glow,
              } as React.CSSProperties
            }
          >
            <div className="kpi-card-header">
              <span className="kpi-card-label">{kpi.name}</span>
              <div className="kpi-card-icon" aria-hidden="true">
                <Icon name={kpi.icon as any} size={18} />
              </div>
            </div>
            <div className="kpi-card-body">
              <strong className="kpi-card-value">{kpi.val}</strong>
            </div>
            <div className="kpi-card-footer">
              <span className="kpi-card-pill">
                <span className="kpi-pill-dot" aria-hidden="true" />
                {kpi.pill}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Confidentiality Callout Banner */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 16px', background: 'rgba(37, 99, 235, 0.05)', border: '1px solid rgba(37, 99, 235, 0.15)', borderRadius: '12px', marginBottom: '18px' }}>
        <div style={{ color: 'var(--admin-link, #2563eb)', flexShrink: 0, marginTop: '2px' }}>
          <Icon name="complaints" size={20} />
        </div>
        <div style={{ fontSize: '0.80rem', lineHeight: '1.45', color: 'var(--admin-copy, #334155)' }}>
          <strong style={{ color: 'var(--admin-link, #1e3a8a)', display: 'block', marginBottom: '2px' }}>
            Confidential Grievance Protocol
          </strong>
          These are confidential. You see only complaints at your level, and never one you made or one about a visit you were part of. Nothing here moves credits. To restrict someone, use Restrictions and provide this complaint’s reference. A member can appeal a decision, and that appeal also appears under Restrictions.
        </div>
      </div>

      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!rows && !error && <p role="status">Loading complaints…</p>}

      {/* Empty State */}
      {rows?.length === 0 && (
        <div className="glass-panel empty-state" style={{ padding: '36px 20px', textAlign: 'center', background: 'var(--admin-panel, #ffffff)', borderRadius: '14px', border: '1px solid var(--admin-line, #e2e8f0)', margin: '16px 0' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--admin-success-tint, #ecfdf5)', color: 'var(--admin-success, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Icon name="check" size={24} />
          </div>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--admin-ink, #0f172a)', margin: '0 0 6px' }}>
            {showClosed ? 'No complaints recorded' : 'All clear — No complaints need your attention'}
          </h4>
          <p style={{ fontSize: '0.82rem', color: 'var(--admin-copy, #64748b)', margin: 0 }}>
            {showClosed
              ? 'There are currently no closed complaints on record.'
              : 'Any confidential member grievances or incident escalations will appear here.'}
          </p>
        </div>
      )}

      {/* Table */}
      {rows && rows.length > 0 && (
        <div className="table-container glass-panel modern-table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '16%' }}>Reference</th>
                {!organizationId && <th style={{ width: '18%' }}>Community</th>}
                <th style={{ width: '24%' }}>Subject</th>
                <th style={{ width: '16%' }}>Level</th>
                <th style={{ width: '16%' }}>Status</th>
                <th style={{ width: '18%' }}>Filed (IST)</th>
                <th style={{ width: '10%', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-testid="complaint-row">
                  <td>
                    <span className="mono" style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--admin-ink, #0f172a)' }}>
                      {row.reference}
                    </span>
                  </td>
                  {!organizationId && <td>{row.organizationName}</td>}
                  <td>
                    <span style={{ fontSize: '0.82rem', color: 'var(--admin-copy, #334155)', fontWeight: 550 }}>
                      {SUBJECT[row.subject]}
                    </span>
                  </td>
                  <td>
                    <span className="kpi-card-pill kpi-tone-purple" style={{ fontSize: '0.70rem' }}>
                      {LEVEL[row.level]}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`kpi-card-pill kpi-tone-${
                        row.status === 'CLOSED'
                          ? row.outcome === 'UPHELD'
                            ? 'emerald'
                            : 'slate'
                          : row.status === 'IN_REVIEW'
                            ? 'purple'
                            : 'amber'
                      }`}
                    >
                      <span className="kpi-pill-dot" />
                      {statusText(row)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.80rem', color: 'var(--admin-copy, #475569)' }}>
                      <Icon name="calendar" size={13} />
                      <span>{indiaTime(row.createdAt)}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                      aria-label={`Open ${row.reference}`}
                      onClick={() => setChosen(row)}
                    >
                      Open case →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {chosen && !detail && <p role="status">Opening the complaint…</p>}

      {/* Complaint Detail Inspection View */}
      {detail && base && (
        <section className="glass-panel detail-panel" data-testid="complaint-detail" style={{ marginTop: '24px', padding: '24px' }}>
          <div className="request-detail-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span className="mono" style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--admin-link, #2563eb)', background: 'var(--admin-selected, #eff6ff)', padding: '3px 8px', borderRadius: '6px' }}>
                  {detail.reference}
                </span>
                <span
                  className={`kpi-card-pill kpi-tone-${
                    detail.status === 'CLOSED'
                      ? detail.outcome === 'UPHELD'
                        ? 'emerald'
                        : 'slate'
                      : detail.status === 'IN_REVIEW'
                        ? 'purple'
                        : 'amber'
                  }`}
                >
                  <span className="kpi-pill-dot" />
                  {statusText(detail)}
                </span>
                <span className="kpi-card-pill kpi-tone-purple" style={{ fontSize: '0.72rem' }}>
                  {LEVEL[detail.level]}
                </span>
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--admin-ink, #0f172a)', margin: 0 }}>
                {SUBJECT[detail.subject]}
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setChosen(null);
                setDetail(null);
              }}
            >
              ✕ Close case
            </button>
          </div>

          {/* Structured Detail Grid */}
          <div className="request-detail-grid">
            <div className="request-detail-card">
              <h4 className="request-detail-card-title">
                <Icon name="complaints" size={16} /> Case Description
              </h4>
              <p style={{ margin: '6px 0 10px', fontSize: '0.85rem', color: 'var(--admin-ink, #1e293b)', lineHeight: '1.5', fontStyle: 'italic' }}>
                “{detail.description}”
              </p>
              <div className="request-detail-row">
                <span className="row-label">Filed by</span>
                <span className="row-value">{detail.raisedByName || 'Anonymous / Unnamed'}</span>
              </div>
              <div className="request-detail-row">
                <span className="row-label">Phone</span>
                <span className="row-value">{detail.raisedByPhone || 'N/A'}</span>
              </div>
              <div className="request-detail-row">
                <span className="row-label">Member No.</span>
                <span className="row-value mono">{detail.raisedByMemberNumber || 'N/A'}</span>
              </div>
              <div className="request-detail-row">
                <span className="row-label">Filed Time (IST)</span>
                <span className="row-value">{indiaTime(detail.createdAt)}</span>
              </div>
            </div>

            <div className="request-detail-card">
              <h4 className="request-detail-card-title">
                <Icon name="operations" size={16} /> Handling & Associated Visit
              </h4>
              <div className="request-detail-row">
                <span className="row-label">Assigned Level</span>
                <span className="row-value">{LEVEL[detail.level]}</span>
              </div>
              <div className="request-detail-row">
                <span className="row-label">Currently Handled By</span>
                <span className="row-value">{detail.handledByName || 'Unassigned'}</span>
              </div>
              {detail.visit ? (
                <>
                  <div className="request-detail-row">
                    <span className="row-label">Visit Service</span>
                    <span className="row-value">{detail.visit.serviceName} ({detail.visit.requestNumber})</span>
                  </div>
                  <div className="request-detail-row">
                    <span className="row-label">Visit Time</span>
                    <span className="row-value">{indiaTime(detail.visit.scheduledStartTime)}</span>
                  </div>
                  <div className="request-detail-row">
                    <span className="row-label">Beneficiary</span>
                    <span className="row-value">{detail.visit.beneficiaryName || 'N/A'}</span>
                  </div>
                  {detail.visit.volunteerNames.length > 0 && (
                    <div className="request-detail-row">
                      <span className="row-label">Volunteers</span>
                      <span className="row-value">{detail.visit.volunteerNames.join(', ')}</span>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ marginTop: '8px', fontSize: '0.80rem', color: 'var(--admin-copy, #64748b)' }}>
                  No visit associated with this complaint.
                </div>
              )}
            </div>
          </div>

          {isGlobal && detail.level !== 'SUPER_ADMIN' && (
            <p className="help-text" style={{ padding: '8px 12px', background: 'var(--admin-subtle, #f8fafc)', borderRadius: '8px', border: '1px solid var(--admin-line, #e2e8f0)', marginBottom: '16px' }}>
              ℹ️ This is with {LEVEL[detail.level].toLowerCase()}. Your reading it is recorded on the audit trail.
            </p>
          )}

          {/* Event History */}
          <div style={{ marginTop: '20px' }}>
            <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--admin-ink, #0f172a)', marginBottom: '10px' }}>
              Investigation History ({detail.events.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {detail.events.map((event) => (
                <div key={event.id} style={{ padding: '10px 14px', background: 'var(--admin-subtle, #f8fafc)', borderRadius: '8px', border: '1px solid var(--admin-line, #e2e8f0)', fontSize: '0.82rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: 'var(--admin-ink, #0f172a)' }}>
                      {EVENT[event.type]}
                      {event.type !== 'RAISED' && event.type !== 'APPEALED' && ` by ${event.actorName || 'staff'}`}
                    </strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--admin-copy, #64748b)' }}>{indiaTime(event.createdAt)}</span>
                  </div>
                  {event.notes && (
                    <div style={{ marginTop: '6px', color: 'var(--admin-copy, #334155)', fontStyle: 'italic' }}>
                      “{event.notes}”
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {closed && (
            <div style={{ marginTop: '16px', padding: '14px 16px', background: 'var(--admin-success-tint, #ecfdf5)', borderRadius: '10px', border: '1px solid var(--admin-success-line, #a7f3d0)' }}>
              <strong style={{ color: 'var(--admin-success, #065f46)' }}>Decision: {outcomeText(detail.outcome)}.</strong>
              <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--admin-success, #047857)' }}>
                The member was notified: “{detail.memberMessage}”
              </p>
            </div>
          )}

          {/* Action Row */}
          {!closed && (
            <div className="action-row" style={{ marginTop: '20px' }}>
              {!detail.beingHandled && (
                <button
                  className="btn btn-primary"
                  disabled={pending}
                  onClick={() =>
                    openAction({
                      title: 'Take this complaint',
                      description: 'Other staff will see that someone has it.',
                      submitLabel: 'I am handling this',
                      fields: [],
                      submit: () => backend(`${base}/take`, 'POST', {}),
                    })
                  }
                >
                  I am handling this
                </button>
              )}
              <button
                className="btn btn-secondary"
                disabled={pending}
                onClick={() =>
                  openAction({
                    title: 'Add a note',
                    description: 'Kept in the history. The member does not see it.',
                    submitLabel: 'Add note',
                    fields: [{ key: 'notes', label: 'Note', minLength: 3, maxLength: 2000 }],
                    submit: (values) => backend(`${base}/notes`, 'POST', { notes: values.notes }),
                  })
                }
              >
                Add a note
              </button>
              {detail.level !== 'SUPER_ADMIN' && (
                <button
                  className="btn btn-warning"
                  disabled={pending}
                  onClick={() =>
                    openAction({
                      title: 'Pass this up',
                      description: `It goes to ${detail.level === 'COORDINATOR' ? 'the municipality administrator' : 'a Super Admin'} with its full history. You may no longer be able to see it.`,
                      submitLabel: 'Pass up',
                      fields: [
                        {
                          key: 'notes',
                          label: 'Why, such as a conflict of interest',
                          minLength: 3,
                          maxLength: 2000,
                        },
                      ],
                      submit: (values) =>
                        backend(`${base}/pass-up`, 'POST', { notes: values.notes }),
                    })
                  }
                >
                  Pass up
                </button>
              )}
              <button
                className="btn btn-success"
                disabled={pending}
                onClick={() =>
                  openAction({
                    title: 'Close with a decision',
                    description:
                      'The member gets a notification and reads your message in the app.',
                    submitLabel: 'Close complaint',
                    fields: [
                      {
                        key: 'outcome',
                        label: 'Decision',
                        value: 'UPHELD',
                        choices: [
                          { value: 'UPHELD', label: 'Upheld' },
                          { value: 'NOT_UPHELD', label: 'Not upheld' },
                        ],
                      },
                      {
                        key: 'notes',
                        label: 'Your reason (staff only)',
                        minLength: 3,
                        maxLength: 2000,
                      },
                      {
                        key: 'memberMessage',
                        label: 'What the member is told',
                        minLength: 3,
                        maxLength: 1000,
                      },
                    ],
                    submit: (values) =>
                      backend(`${base}/decide`, 'POST', {
                        outcome: values.outcome,
                        notes: values.notes,
                        memberMessage: values.memberMessage,
                      }),
                  })
                }
              >
                Close with a decision
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
