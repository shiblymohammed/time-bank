'use client';
import React, { useEffect, useState } from 'react';
import { ApiError, backend } from '@/lib/api';
import type { Action } from '@/lib/admin-types';
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

  return (
    <div className="request-workspace">
      <div className="section-heading">
        <h2>Safety alerts</h2>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(event) => setShowClosed(event.target.checked)}
          />{' '}
          Show closed alerts
        </label>
      </div>
      <p className="help-text">
        These are confidential. The other person on the visit is told only that it is paused or
        ended, never who raised the alert or why. This list refreshes every 30 seconds.
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!alerts && !error && <p role="status">Loading safety alerts…</p>}
      {alerts?.length === 0 && (
        <p className="glass-panel empty-state">
          {showClosed ? 'No safety alerts yet.' : 'No safety alerts need you right now.'}
        </p>
      )}
      {alerts?.map((alert) => {
        const paused = alert.visits.some((visit) => visit.pausedAt);
        const allowed = alert.visits.some((visit) => visit.restartAllowedAt);
        const closed = alert.status === 'RESOLVED';
        const underWay = alert.visits.some((visit) => visit.status === 'IN_PROGRESS');
        return (
          <section className="detail-panel glass-panel" key={alert.id} data-testid="safety-alert">
            <h3>
              {closed ? 'Closed' : alert.status === 'OPEN' ? 'New alert' : 'Being handled'} ·{' '}
              {alert.request.serviceName}
            </h3>
            <p>
              Raised {indiaTime(alert.createdAt)} by{' '}
              <strong>{alert.raisedByName || 'a member'}</strong> ({role(alert.raisedByRole)}), who
              chose to {alert.action === 'END' ? 'end the visit' : 'pause the visit'}.
            </p>
            {alert.notes && <p>“{alert.notes}”</p>}
            <p>
              <strong>Call:</strong> {alert.raisedByName || 'Person who raised it'}{' '}
              {alert.raisedByPhone}
            </p>
            <p>
              Beneficiary: {alert.request.beneficiaryName || 'No name'} ·{' '}
              {alert.request.beneficiaryPhone}
            </p>
            {alert.visits.map((visit) => (
              <p key={visit.id}>
                Volunteer: {visit.volunteerName || 'No name'} · {visit.volunteerPhone} ·{' '}
                {visit.pausedAt
                  ? visit.restartAllowedAt
                    ? 'Paused, cleared to restart'
                    : 'Paused'
                  : visit.status === 'IN_PROGRESS'
                    ? 'Visit restarted'
                    : `Visit ended${visit.reportedMinutes ? ` after ${visit.reportedMinutes} minutes` : ''}`}
              </p>
            ))}
            <p>
              Request {alert.request.requestNumber} · {alert.request.address}
            </p>
            {alert.visits.some((visit) => visit.creditsPending) && (
              <p className="help-text">
                No credits are paid until you decide. Use Pay for visit or Not delivered on this
                request in Requests &amp; matching.
              </p>
            )}
            {alert.staffNotes && <p className="help-text">Staff notes: {alert.staffNotes}</p>}
            {closed && alert.resolvedAt && (
              <p className="help-text">
                {alert.outcome === 'RESTARTED' ? 'Visit restarted' : 'Visit ended'}{' '}
                {indiaTime(alert.resolvedAt)}
              </p>
            )}
            {!closed && (
              <div className="action-row">
                {alert.status === 'OPEN' && (
                  <button
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
