'use client';
import React, { useEffect, useState } from 'react';
import { ApiError, backend } from '@/lib/api';
import type { Action } from '@/lib/admin-types';
import { indiaTime } from '@/lib/request-utils';

type ClosureStatus = 'REPORTED' | 'REFUSED' | 'CLOSED' | 'REOPENED' | 'OVERTURNED';
type ClosureSummary = {
  id: string;
  reference: string;
  kind: 'DECEASED' | 'DUPLICATE';
  organizationId: string | null;
  organizationName: string | null;
  subjectName: string | null;
  subjectMemberNumber: string | null;
  subjectPhone: string | null;
  needsSuperAdmin: boolean;
  status: ClosureStatus;
  nomineeUnderReview: boolean;
  transferWaiting: boolean;
  transferredCredits: number;
  appealStatus: 'OPEN' | 'DECIDED' | null;
  createdAt: string;
  decidedAt: string | null;
};
type AccountReview = {
  label: string;
  name: string | null;
  phone: string | null;
  status: string | null;
  joined: string | null;
  verification: string | null;
  balance: number;
  frozen: number;
  walletStatus: string | null;
  memberships: number;
  creditEntries: number;
  visitsGiven: number;
  requestsMade: number;
  openRequests: number;
};
type Nominee = { name: string; phone: string; since: string; replacedAt?: string | null };
type ClosureDetail = ClosureSummary & {
  reason: string;
  dateOfDeath: string | null;
  evidenceType: string | null;
  evidenceLast4: string | null;
  memberMessage: string | null;
  reportedByName: string | null;
  decidedByName: string | null;
  primary: { name: string | null; phone: string } | null;
  nominee: Nominee | null;
  earlierNominees: Nominee[];
  transfer: {
    available: number;
    receiverName: string | null;
    receiverPhone: string | null;
    receiverMatchesNominee: boolean | null;
    transferred: number;
    lastTransferredAt: string | null;
  };
  accounts: AccountReview[];
  appeal: { reference: string; status: string; outcome: string | null } | null;
  events: {
    id: string;
    type: string;
    notes: string | null;
    actorName: string | null;
    createdAt: string;
  }[];
};

const REFRESH_MS = 60_000;
const KIND: Record<ClosureSummary['kind'], string> = {
  DECEASED: 'Death',
  DUPLICATE: 'Duplicate account',
};
const STATUS: Record<ClosureStatus, string> = {
  REPORTED: 'Waiting for a decision',
  REFUSED: 'Refused',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  OVERTURNED: 'Overturned on appeal',
};
const EVIDENCE: Record<string, string> = {
  DEATH_CERTIFICATE: 'Death certificate',
  MUNICIPAL_RECORD: 'Municipal record',
  HOSPITAL_RECORD: 'Hospital record',
};
const EVENT: Record<string, string> = {
  REPORTED: 'Reported',
  REFUSED: 'Refused',
  APPROVED: 'Approved',
  NOTE: 'Note',
  DISPUTED: 'Nominee disputed',
  DISPUTE_RESOLVED: 'Nominee reviewed',
  TRANSFER_RECOMMENDED: 'Transfer recommended',
  TRANSFER_REFUSED: 'Transfer refused',
  TRANSFERRED: 'Credits passed on',
  APPEALED: 'Appealed',
  APPEAL_STANDS: 'Appeal failed',
  OVERTURNED: 'Overturned on appeal',
  REOPENED: 'Reopened',
};
const plain = (code: string | null) => {
  if (!code) return '—';
  const words = code.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
const statusText = (row: ClosureSummary) =>
  row.status === 'REPORTED' && row.needsSuperAdmin
    ? 'Waiting for a Super Admin'
    : row.status === 'CLOSED' && row.appealStatus === 'OPEN'
      ? 'Closed, appeal waiting'
      : row.status === 'CLOSED' && row.nomineeUnderReview
        ? 'Closed, nominee under review'
        : row.status === 'CLOSED' && row.transferWaiting
          ? 'Closed, transfer waiting'
          : STATUS[row.status];
const basePath = (organizationId: string | null) =>
  organizationId ? `/organizations/${organizationId}` : '/admin';
const closuresPath = (organizationId: string | null, open: boolean) =>
  `${basePath(organizationId)}/closures${open ? '' : '?open=false'}`;

/** Reports and transfers waiting on this person. A null scope means every community. */
export function useWaitingClosures(
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
      backend<ClosureSummary[]>(
        closuresPath(organizationId, true),
        'GET',
        undefined,
        controller.signal,
      )
        .then((rows) =>
          setCount(
            rows.filter(
              (row) => row.status === 'REPORTED' || row.transferWaiting || row.nomineeUnderReview,
            ).length,
          ),
        )
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

export function Closures({
  organizationId,
  isGlobal,
  canDecide,
  revision,
  pending,
  openAction,
  onExpired,
}: {
  organizationId: string | null;
  isGlobal: boolean;
  canDecide: boolean;
  revision: number;
  pending: boolean;
  openAction: (action: Action) => void;
  onExpired: () => void;
}) {
  const [rows, setRows] = useState<ClosureSummary[] | null>(null);
  const [showEnded, setShowEnded] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClosureDetail | null>(null);
  const [error, setError] = useState('');
  const base = basePath(organizationId);

  const failed = (cause: unknown, fallback: string) => {
    if (cause instanceof ApiError && cause.status === 401) onExpired();
    else setError(cause instanceof Error ? cause.message : fallback);
  };

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      backend<ClosureSummary[]>(
        closuresPath(organizationId, !showEnded),
        'GET',
        undefined,
        controller.signal,
      )
        .then((next) => {
          setRows(next);
          setError('');
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) failed(cause, 'Could not load closures');
        });
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [organizationId, showEnded, revision]);

  useEffect(() => {
    setDetail(null);
    if (!chosen) return;
    const controller = new AbortController();
    backend<ClosureDetail>(`${base}/closures/${chosen}`, 'GET', undefined, controller.signal)
      .then(setDetail)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 404) setChosen(null);
        else failed(cause, 'Could not open this closure');
      });
    return () => controller.abort();
  }, [chosen, base, revision]);

  const notesAction = (
    title: string,
    description: string,
    submitLabel: string,
    label: string,
    path: string,
  ) =>
    openAction({
      title,
      description,
      submitLabel,
      fields: [{ key: 'notes', label, minLength: 3, maxLength: 2000 }],
      submit: (values) => backend(path, 'POST', { notes: values.notes }),
    });

  const reportDeath = () =>
    openAction({
      title: 'Report a death',
      description:
        'A Municipality Admin decides. Nothing changes until then. Do not keep or upload the document: record only what you saw.',
      submitLabel: 'Send report',
      fields: [
        { key: 'member', label: 'Member number or phone number', minLength: 3, maxLength: 50 },
        { key: 'dateOfDeath', label: 'Date of death', type: 'date' },
        {
          key: 'evidenceType',
          label: 'Record you saw',
          value: 'DEATH_CERTIFICATE',
          choices: Object.entries(EVIDENCE).map(([value, label]) => ({ value, label })),
        },
        {
          key: 'evidenceLast4',
          label: 'Last 4 characters of its number',
          minLength: 4,
          maxLength: 4,
        },
        { key: 'reason', label: 'Notes (staff only)', minLength: 10, maxLength: 4000 },
      ],
      submit: (values) =>
        backend(`${base}/closures`, 'POST', {
          kind: 'DECEASED',
          member: values.member,
          dateOfDeath: values.dateOfDeath,
          evidenceType: values.evidenceType,
          evidenceLast4: values.evidenceLast4,
          reason: values.reason,
        }),
    });

  const reportDuplicate = () =>
    openAction({
      title: 'Report a duplicate account',
      description:
        'For one person with two accounts. A Municipality Admin decides. Nothing is merged: the credits in the closed account stay frozen there for good.',
      submitLabel: 'Send report',
      fields: [
        {
          key: 'member',
          label: 'The account to close: member number or phone',
          minLength: 3,
          maxLength: 50,
        },
        {
          key: 'primaryMember',
          label: 'The account that stays: member number or phone',
          minLength: 3,
          maxLength: 50,
        },
        { key: 'reason', label: 'How you know (staff only)', minLength: 10, maxLength: 4000 },
      ],
      submit: (values) =>
        backend(`${base}/closures`, 'POST', {
          kind: 'DUPLICATE',
          member: values.member,
          primaryMember: values.primaryMember,
          reason: values.reason,
        }),
    });

  const approve = (row: ClosureDetail) =>
    openAction({
      title: row.kind === 'DECEASED' ? 'Close this account: death' : 'Close this duplicate account',
      description:
        row.kind === 'DECEASED'
          ? 'The person is signed out and cannot sign in. Requests that have not started are cancelled, offers and upcoming visits are released, and credits are frozen. Coordinators are told about visits under way.'
          : 'The person is signed out and can only read this message and appeal, within 30 days. Requests that have not started are cancelled. The credits stay frozen in this account for good.',
      submitLabel: 'Close the account',
      fields: [
        { key: 'notes', label: 'Your reason (staff only)', minLength: 3, maxLength: 2000 },
        ...(row.kind === 'DUPLICATE'
          ? [
              {
                key: 'memberMessage',
                label: 'What the person is told. Name no one.',
                minLength: 10,
                maxLength: 1000,
              },
            ]
          : []),
      ],
      submit: (values) =>
        backend(`${base}/closures/${row.id}/approve`, 'POST', {
          notes: values.notes,
          ...(values.memberMessage ? { memberMessage: values.memberMessage } : {}),
        }),
    });

  const recommendTransfer = (row: ClosureDetail) =>
    openAction({
      title: 'Recommend passing on the credits',
      description: `${row.transfer.available} credits can move now. The nominee needs their own account and a verified ID. A Municipality Admin decides.`,
      submitLabel: 'Recommend',
      fields: [
        { key: 'receiver', label: 'Nominee’s phone or member number', minLength: 3, maxLength: 50 },
        {
          key: 'notes',
          label: 'How you verified them (staff only)',
          minLength: 3,
          maxLength: 2000,
        },
      ],
      submit: (values) =>
        backend(`${base}/closures/${row.id}/recommend-transfer`, 'POST', {
          receiver: values.receiver,
          notes: values.notes,
        }),
    });

  const fileForMember = (row: ClosureDetail) =>
    openAction({
      title: 'File an appeal for this person',
      description:
        'For someone who does not use the app. Write what they told you. A Super Admin hears it.',
      submitLabel: 'File appeal',
      fields: [{ key: 'grounds', label: 'Their reasons', minLength: 10, maxLength: 2000 }],
      submit: (values) =>
        backend(`/organizations/${row.organizationId}/closures/${row.id}/appeal`, 'POST', {
          grounds: values.grounds,
        }),
    });

  const closureBase = detail && `${base}/closures/${detail.id}`;
  const canDecideThis = (row: ClosureSummary) => isGlobal || (canDecide && !row.needsSuperAdmin);

  return (
    <div className="request-workspace">
      <div className="section-heading">
        <h2>Account closures</h2>
        <div className="action-row">
          <label className="inline-check">
            <input
              type="checkbox"
              checked={showEnded}
              onChange={(event) => setShowEnded(event.target.checked)}
            />{' '}
            Show ended and refused
          </label>
          {organizationId && (
            <>
              <button className="btn btn-primary" disabled={pending} onClick={reportDeath}>
                Report a death
              </button>
              <button className="btn btn-secondary" disabled={pending} onClick={reportDuplicate}>
                Report a duplicate
              </button>
            </>
          )}
        </div>
      </div>
      <p className="help-text">
        A coordinator reports and a Municipality Admin decides. Someone in several communities goes
        to a Super Admin. Nobody acts on their own case, and whoever reported it cannot also decide.
        Nothing is merged or deleted.
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!rows && !error && <p role="status">Loading closures…</p>}
      {rows?.length === 0 && (
        <p className="glass-panel empty-state">
          {showEnded ? 'No closures yet.' : 'No reports or closed accounts right now.'}
        </p>
      )}
      {rows && rows.length > 0 && (
        <div className="table-container glass-panel">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Reference</th>
                {!organizationId && <th>Community</th>}
                <th>Person</th>
                <th>Type</th>
                <th>Status</th>
                <th>Reported (IST)</th>
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-testid="closure-row">
                  <td className="mono">{row.reference}</td>
                  {!organizationId && <td>{row.organizationName ?? '—'}</td>}
                  <td>
                    {row.subjectName || row.subjectPhone || 'No name'}
                    {row.subjectMemberNumber && (
                      <div className="mono">{row.subjectMemberNumber}</div>
                    )}
                  </td>
                  <td>{KIND[row.kind]}</td>
                  <td>{statusText(row)}</td>
                  <td>{indiaTime(row.createdAt)}</td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      aria-label={`Open ${row.reference}`}
                      onClick={() => setChosen(row.id)}
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

      {chosen && !detail && <p role="status">Opening the closure…</p>}
      {detail && closureBase && (
        <section className="detail-panel glass-panel" data-testid="closure-detail">
          <h3>
            {detail.reference} · {KIND[detail.kind]} · {statusText(detail)}
          </h3>
          <p>
            <strong>Person:</strong> {detail.subjectName || 'No name'} · {detail.subjectPhone}
            {detail.subjectMemberNumber ? ` · ${detail.subjectMemberNumber}` : ''}
          </p>
          {detail.kind === 'DECEASED' && (
            <p>
              <strong>Date of death:</strong> {detail.dateOfDeath} ·{' '}
              <strong>{EVIDENCE[detail.evidenceType ?? ''] ?? 'Record'}:</strong> ending{' '}
              <span className="mono">{detail.evidenceLast4}</span>
            </p>
          )}
          {detail.primary && (
            <p>
              <strong>The account that stays:</strong> {detail.primary.name || 'No name'} ·{' '}
              {detail.primary.phone}
            </p>
          )}
          <p>
            <strong>Notes:</strong> {detail.reason}
          </p>
          <p>
            <strong>Reported by:</strong> {detail.reportedByName || 'staff'}
            {detail.decidedAt && (
              <>
                {' · '}
                <strong>Decided by:</strong> {detail.decidedByName || 'staff'}
              </>
            )}
          </p>
          {detail.memberMessage && (
            <p>
              <strong>They were told:</strong> “{detail.memberMessage}”
            </p>
          )}
          {detail.appeal && (
            <p>
              <strong>Appeal:</strong> {detail.appeal.reference} ·{' '}
              {detail.appeal.status === 'OPEN'
                ? 'Waiting for a Super Admin (open it under Restrictions)'
                : detail.appeal.outcome === 'OVERTURNED'
                  ? 'Overturned'
                  : 'The decision stands'}
            </p>
          )}

          <h4>{detail.accounts.length > 1 ? 'The two accounts' : 'The account'}</h4>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Status</th>
                  <th>ID check</th>
                  <th>Credits</th>
                  <th>Frozen</th>
                  <th>Visits given</th>
                  <th>Requests</th>
                  <th>Open requests</th>
                </tr>
              </thead>
              <tbody>
                {detail.accounts.map((account) => (
                  <tr key={account.label} data-testid="closure-account">
                    <td>
                      {account.label}
                      <div>{account.name || account.phone || 'No name'}</div>
                    </td>
                    <td>{plain(account.status)}</td>
                    <td>{plain(account.verification)}</td>
                    <td>{account.balance}</td>
                    <td>{account.frozen}</td>
                    <td>{account.visitsGiven}</td>
                    <td>{account.requestsMade}</td>
                    <td>{account.openRequests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail.kind === 'DECEASED' && (
            <>
              <h4>Nominee</h4>
              {detail.nominee ? (
                <p>
                  <strong>{detail.nominee.name}</strong> · {detail.nominee.phone} · named{' '}
                  {indiaTime(detail.nominee.since)}
                  {detail.nomineeUnderReview ? ' · under review, no credits can move' : ''}
                </p>
              ) : (
                <p>This member named nobody, so the credits stay frozen in this account.</p>
              )}
              {detail.earlierNominees.map((earlier) => (
                <p key={earlier.since} className="help-text">
                  Before: {earlier.name} · {earlier.phone} · named {indiaTime(earlier.since)},
                  changed {indiaTime(earlier.replacedAt ?? earlier.since)}
                </p>
              ))}
              {detail.status === 'CLOSED' && (
                <p>
                  <strong>Can move now:</strong> {detail.transfer.available} credits ·{' '}
                  <strong>Passed on so far:</strong> {detail.transfer.transferred} credits
                </p>
              )}
              {detail.transferWaiting && (
                <p>
                  <strong>Waiting for a decision:</strong> to{' '}
                  {detail.transfer.receiverName || 'No name'} · {detail.transfer.receiverPhone}
                  {detail.transfer.receiverMatchesNominee === false
                    ? ' · this is not the phone the member named, so a Super Admin must decide'
                    : ''}
                </p>
              )}
            </>
          )}

          <h4>History</h4>
          {detail.events.map((event) => (
            <p key={event.id}>
              <strong>{EVENT[event.type] ?? event.type}</strong> by {event.actorName || 'staff'} ·{' '}
              {indiaTime(event.createdAt)}
              {event.notes && (
                <>
                  <br />
                  {event.notes}
                </>
              )}
            </p>
          ))}

          <div className="action-row">
            {detail.status === 'REPORTED' && canDecideThis(detail) && (
              <>
                <button
                  className="btn btn-primary"
                  disabled={pending}
                  onClick={() => approve(detail)}
                >
                  Close the account
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={pending}
                  onClick={() =>
                    notesAction(
                      'Refuse this report',
                      'Nothing happens to the account. Whoever reported it is told to look.',
                      'Refuse',
                      'Your reason (staff only)',
                      `${closureBase}/refuse`,
                    )
                  }
                >
                  Refuse
                </button>
              </>
            )}
            {detail.status === 'CLOSED' && detail.kind === 'DECEASED' && (
              <>
                {detail.nominee &&
                  !detail.nomineeUnderReview &&
                  !detail.transferWaiting &&
                  detail.transfer.available > 0 && (
                    <button
                      className="btn btn-primary"
                      disabled={pending}
                      onClick={() => recommendTransfer(detail)}
                    >
                      Recommend passing on the credits
                    </button>
                  )}
                {detail.transferWaiting && canDecideThis(detail) && (
                  <>
                    <button
                      className="btn btn-primary"
                      disabled={pending}
                      onClick={() =>
                        notesAction(
                          'Pass on the credits',
                          'They move to the nominee’s wallet now. Credits under an open review stay behind.',
                          'Pass on',
                          'Your reason (staff only)',
                          `${closureBase}/approve-transfer`,
                        )
                      }
                    >
                      Pass on the credits
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={pending}
                      onClick={() =>
                        notesAction(
                          'Refuse this transfer',
                          'The credits stay frozen. A coordinator can recommend again.',
                          'Refuse',
                          'Your reason (staff only)',
                          `${closureBase}/refuse-transfer`,
                        )
                      }
                    >
                      Refuse the transfer
                    </button>
                  </>
                )}
                {detail.nominee && !detail.nomineeUnderReview && (
                  <button
                    className="btn btn-secondary"
                    disabled={pending}
                    onClick={() =>
                      notesAction(
                        'Record a dispute about the nominee',
                        'No credits can move until a coordinator has looked. A waiting transfer is withdrawn.',
                        'Record dispute',
                        'What was said (staff only)',
                        `${closureBase}/dispute`,
                      )
                    }
                  >
                    Record a dispute
                  </button>
                )}
                {detail.nomineeUnderReview && (
                  <button
                    className="btn btn-secondary"
                    disabled={pending}
                    onClick={() =>
                      notesAction(
                        'Finish reviewing the nominee',
                        'Credits can then be recommended for transfer.',
                        'Finish review',
                        'What you found (staff only)',
                        `${closureBase}/resolve-dispute`,
                      )
                    }
                  >
                    Finish the nominee review
                  </button>
                )}
              </>
            )}
            {detail.status === 'CLOSED' &&
              detail.kind === 'DUPLICATE' &&
              !detail.appeal &&
              detail.organizationId && (
                <button
                  className="btn btn-secondary"
                  disabled={pending}
                  onClick={() => fileForMember(detail)}
                >
                  File an appeal for them
                </button>
              )}
            {detail.status === 'CLOSED' && isGlobal && (
              <button
                className="btn btn-secondary"
                disabled={pending}
                onClick={() =>
                  notesAction(
                    'Reopen this account',
                    'For a closure made by mistake. Sign-in, memberships and the wallet come back, but staff roles must be granted again. Credits already passed on must be corrected by hand.',
                    'Reopen',
                    'Your reason (staff only)',
                    `${closureBase}/reopen`,
                  )
                }
              >
                Reopen the account
              </button>
            )}
            {['REPORTED', 'CLOSED'].includes(detail.status) && (
              <button
                className="btn btn-secondary"
                disabled={pending}
                onClick={() =>
                  notesAction(
                    'Add a note',
                    'Kept in the history.',
                    'Add note',
                    'Note',
                    `${closureBase}/notes`,
                  )
                }
              >
                Add a note
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
