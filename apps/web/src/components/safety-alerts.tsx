'use client';
import React, { useEffect, useState } from 'react';
import { ApiError, backend } from '@/lib/api';
import type { Action } from '@/lib/admin-types';
import { Icon } from '@/components/icons';
import { indiaTime } from '@/lib/request-utils';

type Visit = {
  id: string;
  status: string;
  volunteerName: string | null;
  volunteerPhone: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  restartAllowedAt: string | null;
  reportedMinutes: number | null;
  creditsPending: boolean;
};
type Alert = {
  id: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  action: 'PAUSE' | 'END';
  outcome: 'RESTARTED' | 'ENDED' | null;
  notes: string | null;
  staffNotes: string | null;
  raisedByRole: string;
  raisedByName: string | null;
  raisedByPhone: string | null;
  createdAt: string;
  /** When it was tapped, if the phone had no signal and sent it later (M8). */
  raisedOnPhoneAt?: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  request: {
    id: string;
    requestNumber: string;
    serviceName: string;
    address: string;
    beneficiaryName: string | null;
    beneficiaryPhone: string | null;
  };
  visits: Visit[];
};

const REFRESH_MS = 30_000;
const NOTES_FIELD = {
  key: 'notes',
  label: 'What you checked or decided',
  minLength: 3,
  maxLength: 1000,
};
const role = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();

/** How many alerts need someone now. Checks in the background wherever the coordinator is. */
export function useOpenSafetyAlerts(organizationId: string | null, revision: number): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!organizationId) {
      setCount(0);
      return;
    }
    const controller = new AbortController();
    const check = () =>
      backend<Alert[]>(
        `/organizations/${organizationId}/safety-alerts`,
        'GET',
        undefined,
        controller.signal,
      )
        .then((alerts) => setCount(alerts.length))
        // Members of staff without this permission, or a dropped connection: keep the last count.
        .catch(() => undefined);
    void check();
    const timer = setInterval(() => void check(), REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [organizationId, revision]);
  return count;
}

export function SafetyAlerts({
  organizationId,
  revision,
  pending,
  openAction,
  onExpired,
}: {
  organizationId: string;
  revision: number;
  pending: boolean;
  openAction: (action: Action) => void;
  onExpired: () => void;
}) {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [error, setError] = useState('');
  const base = `/organizations/${organizationId}/safety-alerts`;

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      backend<Alert[]>(
        `${base}${showClosed ? '?open=false' : ''}`,
        'GET',
        undefined,
        controller.signal,
      )
        .then((next) => {
          setAlerts(next);
          setError('');
        })
        .catch((cause: unknown) => {
          if (controller.signal.aborted) return;
          if (cause instanceof ApiError && cause.status === 401) onExpired();
          else setError(cause instanceof Error ? cause.message : 'Could not load safety alerts');
        });
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [base, showClosed, revision]);

  const act = (alert: Alert, path: string, action: Omit<Action, 'submit' | 'fields'>) =>
    openAction({
      ...action,
      fields: [NOTES_FIELD],
      submit: (values) => backend(`${base}/${alert.id}/${path}`, 'POST', { notes: values.notes }),
    });

  const totalAlerts = alerts?.length ?? 0;
  const openAlerts = alerts?.filter((a) => a.status === 'OPEN').length ?? 0;
  const acknowledgedAlerts = alerts?.filter((a) => a.status === 'ACKNOWLEDGED').length ?? 0;
  const resolvedAlerts = alerts?.filter((a) => a.status === 'RESOLVED').length ?? 0;

  return (
    <div className="request-workspace">
      <div className="section-heading" style={{ marginBottom: '16px' }}>
        <div>
          <h2>Safety Alerts & Incident Response</h2>
          <p className="section-description" style={{ margin: '4px 0 0' }}>
            Real-time monitoring of paused or emergency-interrupted service visits.
          </p>
        </div>
        <label className="coordinator-filter-checkbox">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(event) => setShowClosed(event.target.checked)}
          />
          Show closed alerts
        </label>
      </div>

      {/* KPI Stat Cards */}
      <div className="coordinator-kpi-row">
        {[
          {
            name: 'Active Alerts',
            val: openAlerts,
            icon: 'safety',
            color: '#E11D48',
            glow: 'rgba(225, 29, 72, 0.08)',
            tone: 'rose',
            pill: 'Immediate attention',
          },
          {
            name: 'Being Handled',
            val: acknowledgedAlerts,
            icon: 'clock',
            color: '#D97706',
            glow: 'rgba(217, 119, 6, 0.08)',
            tone: 'amber',
            pill: 'Staff investigating',
          },
          {
            name: 'Resolved Alerts',
            val: resolvedAlerts,
            icon: 'check',
            color: '#059669',
            glow: 'rgba(5, 150, 105, 0.08)',
            tone: 'emerald',
            pill: 'Resolved & cleared',
          },
          {
            name: 'Total Incidents',
            val: totalAlerts,
            icon: 'operations',
            color: '#2563EB',
            glow: 'rgba(37, 99, 235, 0.08)',
            tone: 'blue',
            pill: showClosed ? 'All recorded' : 'Active queue',
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

      {/* Emergency Protocol Banner */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 16px', background: 'rgba(225, 29, 72, 0.05)', border: '1px solid rgba(225, 29, 72, 0.18)', borderRadius: '12px', marginBottom: '18px' }}>
        <div style={{ color: '#e11d48', flexShrink: 0, marginTop: '2px' }}>
          <Icon name="safety" size={20} />
        </div>
        <div style={{ fontSize: '0.80rem', lineHeight: '1.45', color: '#334155' }}>
          <strong style={{ color: '#9f1239', display: 'block', marginBottom: '2px' }}>
            Emergency Protocol & Confidentiality
          </strong>
          These alerts are confidential. The other participant on the visit is informed only that it has been paused or ended, never who raised the alert or the underlying reason. Auto-refreshes every 30 seconds.
        </div>
      </div>

      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!alerts && !error && <p role="status">Loading safety alerts…</p>}

      {/* Empty State */}
      {alerts?.length === 0 && (
        <div className="glass-panel empty-state" style={{ padding: '36px 20px', textAlign: 'center', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', margin: '16px 0' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <Icon name="check" size={24} />
          </div>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>
            {showClosed ? 'No safety alerts recorded' : 'All clear — No active safety alerts'}
          </h4>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0 }}>
            {showClosed
              ? 'There are currently no closed safety alerts on record.'
              : 'Any emergency visit pauses or volunteer incidents will appear here immediately.'}
          </p>
        </div>
      )}

      {/* Alert Cards */}
      {alerts?.map((alert) => {
        const paused = alert.visits.some((visit) => visit.pausedAt);
        const allowed = alert.visits.some((visit) => visit.restartAllowedAt);
        const closed = alert.status === 'RESOLVED';
        const underWay = alert.visits.some((visit) => visit.status === 'IN_PROGRESS');
        const alertTone = closed ? 'emerald' : alert.status === 'OPEN' ? 'rose' : 'amber';

        return (
          <section
            className="detail-panel glass-panel"
            key={alert.id}
            data-testid="safety-alert"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderLeft: `4px solid ${closed ? '#10b981' : alert.status === 'OPEN' ? '#f43f5e' : '#f59e0b'}`,
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`kpi-card-pill kpi-tone-${alertTone}`} style={{ fontSize: '0.74rem' }}>
                  <span className="kpi-pill-dot" />
                  {closed ? 'Resolved' : alert.status === 'OPEN' ? 'Urgent: New Alert' : 'Being Handled'}
                </span>
                <span className="mono" style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569' }}>
                  {alert.request.requestNumber}
                </span>
              </div>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Raised: {indiaTime(alert.createdAt)}
              </span>
            </div>

            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
              {alert.request.serviceName}
            </h3>

            <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#334155', lineHeight: '1.45' }}>
              Raised by <strong>{alert.raisedByName || 'a member'}</strong> ({role(alert.raisedByRole)}), who chose to{' '}
              <strong style={{ color: alert.action === 'END' ? '#e11d48' : '#d97706' }}>
                {alert.action === 'END' ? 'end the visit' : 'pause the visit'}
              </strong>.
            </p>

            {alert.notes && (
              <div style={{ padding: '10px 14px', background: '#fff1f2', borderRadius: '8px', border: '1px solid #ffe4e6', color: '#9f1239', fontSize: '0.82rem', fontStyle: 'italic', marginBottom: '14px' }}>
                “{alert.notes}”
              </div>
            )}

            {/* Contact & Visit Detail Cards */}
            <div className="request-detail-grid" style={{ marginBottom: '14px' }}>
              <div className="request-detail-card" style={{ padding: '12px 14px' }}>
                <h5 className="request-detail-card-title">
                  <Icon name="phoneRecovery" size={15} /> Direct Contact
                </h5>
                <div className="request-detail-row">
                  <span className="row-label">Reporter ({role(alert.raisedByRole)})</span>
                  <span className="row-value">{alert.raisedByName || 'Member'} · {alert.raisedByPhone}</span>
                </div>
                <div className="request-detail-row">
                  <span className="row-label">Beneficiary</span>
                  <span className="row-value">{alert.request.beneficiaryName || 'N/A'} · {alert.request.beneficiaryPhone}</span>
                </div>
                <div className="request-detail-row">
                  <span className="row-label">Location</span>
                  <span className="row-value">{alert.request.address}</span>
                </div>
              </div>

              <div className="request-detail-card" style={{ padding: '12px 14px' }}>
                <h5 className="request-detail-card-title">
                  <Icon name="users" size={15} /> Assigned Volunteer Visits ({alert.visits.length})
                </h5>
                {alert.visits.map((visit) => (
                  <div key={visit.id} className="request-detail-row">
                    <span className="row-label">{visit.volunteerName || 'Volunteer'} ({visit.volunteerPhone})</span>
                    <span className="row-value">
                      {visit.pausedAt
                        ? visit.restartAllowedAt
                          ? 'Paused, cleared to restart'
                          : 'Paused'
                        : visit.status === 'IN_PROGRESS'
                          ? 'Visit restarted'
                          : `Ended (${visit.reportedMinutes ?? 0}m)`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {alert.visits.some((visit) => visit.creditsPending) && (
              <p className="help-text" style={{ padding: '8px 12px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #dbeafe', color: '#1d4ed8', margin: '0 0 12px' }}>
                ℹ️ No credits are paid until you decide. Use Pay for visit or Not delivered on this request in Requests &amp; matching.
              </p>
            )}

            {alert.staffNotes && (
              <p className="help-text" style={{ margin: '0 0 10px', color: '#64748b' }}>
                <strong>Staff notes:</strong> {alert.staffNotes}
              </p>
            )}

            {closed && alert.resolvedAt && (
              <p className="help-text" style={{ margin: '0 0 10px', color: '#059669', fontWeight: 600 }}>
                ✓ {alert.outcome === 'RESTARTED' ? 'Visit restarted' : 'Visit ended'} at {indiaTime(alert.resolvedAt)}
              </p>
            )}

            {/* Action Row */}
            {!closed && (
              <div className="action-row" style={{ marginTop: '12px' }}>
                {alert.status === 'OPEN' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={pending}
                    onClick={() =>
                      openAction({
                        title: 'Take this alert',
                        description: 'Other staff will see that someone is handling it.',
                        submitLabel: 'I am handling this',
                        fields: [],
                        submit: () => backend(`${base}/${alert.id}/acknowledge`, 'POST', {}),
                      })
                    }
                  >
                    I am handling this
                  </button>
                )}
                {paused && !allowed && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={pending}
                    onClick={() =>
                      act(alert, 'allow-restart', {
                        title: 'Allow this visit to restart',
                        description:
                          'Speak to both people first. The volunteer then chooses to restart, and either person can still end the visit.',
                        submitLabel: 'Allow restart',
                      })
                    }
                  >
                    Allow restart
                  </button>
                )}
                {underWay && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={pending}
                    onClick={() =>
                      act(alert, 'end-visit', {
                        title: 'End this visit',
                        description:
                          'The visit stops and this alert closes. You then decide its credits in Requests & matching.',
                        submitLabel: 'End visit',
                      })
                    }
                  >
                    End visit
                  </button>
                )}
                {!underWay && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={pending}
                    onClick={() =>
                      act(alert, 'close', {
                        title: 'Close this alert',
                        description: 'Record what you did. This does not decide the credits.',
                        submitLabel: 'Close alert',
                      })
                    }
                  >
                    Close alert
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
