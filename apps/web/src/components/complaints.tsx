'use client';
import React, { useEffect, useState } from 'react';
import { ApiError, backend } from '@/lib/api';
import type { Action } from '@/lib/admin-types';
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

  return (
    <div className="request-workspace">
      <div className="section-heading">
        <div className="section-title-group"><h2>Complaints</h2><span className="record-count">{rows?.length ?? 0} {showClosed ? 'total' : 'open'}</span></div>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(event) => setShowClosed(event.target.checked)}
          />{' '}
          Show closed complaints
        </label>
      </div>
      <p className="help-text privacy-note">
        These are confidential. You see only complaints at your level, and never one you made or one
        about a visit you were part of. Nothing here moves credits. To restrict someone, use
        Restrictions and give this complaint’s reference. A member can appeal a decision, and that
        appeal also appears under Restrictions.
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!rows && !error && <p role="status">Loading complaints…</p>}
      {rows?.length === 0 && (
        <p className="glass-panel empty-state">
          {showClosed ? 'No complaints yet.' : 'No complaints need you right now.'}
        </p>
      )}
      {rows && rows.length > 0 && (
        <div className="table-container glass-panel">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Reference</th>
                {!organizationId && <th>Community</th>}
                <th>About</th>
                <th>With</th>
                <th>Status</th>
                <th>Made (IST)</th>
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-testid="complaint-row">
                  <td className="mono">{row.reference}</td>
                  {!organizationId && <td>{row.organizationName}</td>}
                  <td>{SUBJECT[row.subject]}</td>
                  <td>{LEVEL[row.level]}</td>
                  <td>{statusText(row)}</td>
                  <td>{indiaTime(row.createdAt)}</td>
                  <td>
                    <button
                      className="btn btn-secondary btn-open"
                      aria-label={`Open ${row.reference}`}
                      onClick={() => setChosen(row)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {chosen && !detail && <p role="status">Opening the complaint…</p>}
      {detail && base && (
        <section className="detail-panel glass-panel" data-testid="complaint-detail">
          <h3>
            {detail.reference} · {statusText(detail)}
          </h3>
          <p>
            <strong>About:</strong> {SUBJECT[detail.subject]}
          </p>
          <p>
            <strong>With:</strong> {LEVEL[detail.level]}
            {detail.handledByName ? ` · ${detail.handledByName} has this` : ''}
          </p>
          <p>“{detail.description}”</p>
          <p>
            <strong>Made by:</strong> {detail.raisedByName || 'No name'} · {detail.raisedByPhone}
            {detail.raisedByMemberNumber ? ` · ${detail.raisedByMemberNumber}` : ''} ·{' '}
            {indiaTime(detail.createdAt)}
          </p>
          {detail.visit && (
            <p>
              <strong>Visit:</strong> {detail.visit.serviceName} · {detail.visit.requestNumber} ·{' '}
              {indiaTime(detail.visit.scheduledStartTime)} · Beneficiary:{' '}
              {detail.visit.beneficiaryName || 'No name'}
              {detail.visit.volunteerNames.length > 0 &&
                ` · Volunteers: ${detail.visit.volunteerNames.join(', ')}`}
            </p>
          )}
          {isGlobal && detail.level !== 'SUPER_ADMIN' && (
            <p className="help-text">
              This is with {LEVEL[detail.level].toLowerCase()}. Your reading it is on the audit
              trail.
            </p>
          )}
          <h4>History</h4>
          {detail.events.map((event) => (
            <p key={event.id}>
              <strong>{EVENT[event.type]}</strong>
              {event.type !== 'RAISED' &&
                event.type !== 'APPEALED' &&
                ` by ${event.actorName || 'staff'}`}{' '}
              · {indiaTime(event.createdAt)}
              {event.notes && (
                <>
                  <br />
                  {event.notes}
                </>
              )}
            </p>
          ))}
          {closed && (
            <p>
              <strong>{outcomeText(detail.outcome)}.</strong> The member was told: “
              {detail.memberMessage}”
            </p>
          )}
          {!closed && (
            <div className="action-row">
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
