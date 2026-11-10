'use client';
import React, { useEffect, useState } from 'react';
import { ApiError, backend } from '@/lib/api';
import type { Action } from '@/lib/admin-types';
import { indiaTime } from '@/lib/request-utils';

type RecoveryStatus = 'OPENED' | 'CONFIRMED' | 'COMPLETED' | 'REFUSED' | 'WITHDRAWN' | 'REVERSED';
type DocumentResult = 'MATCHED' | 'DIFFERENT' | 'NONE_ON_RECORD';
type RecoverySummary = {
  id: string;
  reference: string;
  organizationId: string;
  organizationName: string | null;
  subjectName: string | null;
  subjectMemberNumber: string | null;
  oldPhoneLast4: string;
  newPhoneLast4: string;
  needsSuperAdmin: boolean;
  status: RecoveryStatus;
  documentResult: DocumentResult;
  createdAt: string;
  decidedAt: string | null;
};
type RecoveryDetail = RecoverySummary & {
  oldPhone: string;
  newPhone: string;
  documentType: string;
  documentLast4: string;
  reason: string;
  openedByName: string | null;
  decidedByName: string | null;
  confirmedAt: string | null;
  reversedAt: string | null;
  newNumberAccount: 'NONE' | 'EMPTY' | 'WAITING_APPLICATION' | 'IN_USE' | null;
  newNumberIsNominee: boolean;
  nomineeEnded: boolean;
  canReverse: boolean;
  events: {
    id: string;
    type: string;
    notes: string | null;
    actorName: string | null;
    createdAt: string;
  }[];
};

const REFRESH_MS = 60_000;
const STATUS: Record<RecoveryStatus, string> = {
  OPENED: 'Waiting for a code from the new number',
  CONFIRMED: 'Waiting for a decision',
  COMPLETED: 'Moved',
  REFUSED: 'Refused',
  WITHDRAWN: 'Withdrawn',
  REVERSED: 'Undone',
};
const EVENT: Record<string, string> = {
  OPENED: 'Opened',
  CONFIRMED: 'New number confirmed',
  DECLINED: 'New number said this was not them',
  APPROVED: 'Approved',
  REFUSED: 'Refused',
  WITHDRAWN: 'Withdrawn',
  NOTE: 'Note',
  REVERSED: 'Undone',
};
const DOCUMENT_RESULT: Record<DocumentResult, string> = {
  MATCHED: 'Matches the document on record',
  DIFFERENT: 'Does not match the document on record, so a Super Admin must decide',
  NONE_ON_RECORD: 'This account has no document on record, so a Super Admin must decide',
};
const DOCUMENTS: { value: string; label: string }[] = [
  { value: 'AADHAAR_CARD', label: 'Aadhaar card' },
  { value: 'VOTER_ID', label: 'Voter ID' },
  { value: 'DRIVING_LICENSE', label: 'Driving licence' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'RATION_CARD', label: 'Ration card' },
  { value: 'OTHER_GOVERNMENT_ID', label: 'Other government ID' },
];
const NEW_NUMBER: Record<NonNullable<RecoveryDetail['newNumberAccount']>, string> = {
  NONE: 'No account on it yet.',
  EMPTY: 'It has an empty account, made by signing in. Approving retires it.',
  WAITING_APPLICATION:
    'It has a waiting membership application. Reject that first, then you can decide.',
  IN_USE: 'It has its own account now, so this case cannot go ahead. Refuse it.',
};
const documentName = (value: string) =>
  DOCUMENTS.find((document) => document.value === value)?.label ?? value;
const statusText = (row: RecoverySummary) =>
  row.status === 'CONFIRMED' && row.needsSuperAdmin
    ? 'Waiting for a Super Admin'
    : STATUS[row.status];
const basePath = (organizationId: string | null) =>
  organizationId ? `/organizations/${organizationId}` : '/admin';
const recoveriesPath = (organizationId: string | null, open: boolean) =>
  `${basePath(organizationId)}/phone-recoveries${open ? '' : '?open=false'}`;

/** Cases that have confirmed and wait on a decision. A null scope means every community. */
export function useWaitingRecoveries(
  enabled: boolean,
  isGlobal: boolean,
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
      backend<RecoverySummary[]>(
        recoveriesPath(organizationId, true),
        'GET',
        undefined,
        controller.signal,
      )
        .then((rows) =>
          setCount(
            rows.filter(
              (row) => row.status === 'CONFIRMED' && (isGlobal || !row.needsSuperAdmin),
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
  }, [enabled, isGlobal, organizationId, revision]);
  return count;
}

export function PhoneRecoveries({
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
  const [rows, setRows] = useState<RecoverySummary[] | null>(null);
  const [showEnded, setShowEnded] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [detail, setDetail] = useState<RecoveryDetail | null>(null);
  const [error, setError] = useState('');
  const base = basePath(organizationId);

  const failed = (cause: unknown, fallback: string) => {
    if (cause instanceof ApiError && cause.status === 401) onExpired();
    else setError(cause instanceof Error ? cause.message : fallback);
  };

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      backend<RecoverySummary[]>(
        recoveriesPath(organizationId, !showEnded),
        'GET',
        undefined,
        controller.signal,
      )
        .then((next) => {
          setRows(next);
          setError('');
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) failed(cause, 'Could not load phone number changes');
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
    backend<RecoveryDetail>(`${base}/phone-recoveries/${chosen}`, 'GET', undefined, controller.signal)
      .then(setDetail)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 404) setChosen(null);
        else failed(cause, 'Could not open this case');
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

  const openCase = () =>
    openAction({
      title: 'Change a phone number',
      description:
        'For someone who has lost their phone or SIM. See their ID in person first. Nothing changes until someone above you decides, and the document number is compared and not kept. Then ask them to sign in to the app with the new SIM and confirm with a code. A member with a basic phone can do this at your desk on any phone with the app: the code goes to their phone.',
      submitLabel: 'Open case',
      fields: [
        { key: 'member', label: 'Member number or old phone number', minLength: 3, maxLength: 50 },
        { key: 'newPhone', label: 'New phone number', minLength: 8, maxLength: 20 },
        {
          key: 'documentType',
          label: 'ID document you saw',
          value: 'AADHAAR_CARD',
          choices: DOCUMENTS,
        },
        { key: 'documentNumber', label: 'Its number', minLength: 4, maxLength: 40 },
        { key: 'reason', label: 'What you checked (staff only)', minLength: 10, maxLength: 4000 },
      ],
      submit: (values) =>
        backend(`${base}/phone-recoveries`, 'POST', {
          member: values.member,
          newPhone: values.newPhone,
          documentType: values.documentType,
          documentNumber: values.documentNumber,
          reason: values.reason,
        }),
    });

  const caseBase = detail ? `${base}/phone-recoveries/${detail.id}` : null;
  const canDecideThis = (row: RecoverySummary) => isGlobal || (canDecide && !row.needsSuperAdmin);
  const isOpen = (row: RecoverySummary) => row.status === 'OPENED' || row.status === 'CONFIRMED';

  return (
    <div className="request-workspace">
      <div className="section-heading">
        <h2>Phone number changes</h2>
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
            <button className="btn btn-primary" disabled={pending} onClick={openCase}>
              Change a phone number
            </button>
          )}
        </div>
      </div>
      <p className="help-text">
        A coordinator checks the person&apos;s ID, the new number confirms with a code, and a
        Municipality Admin decides. Someone in several communities, or a document that does not
        match, goes to a Super Admin. The account, wallet and memberships stay the same.
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!rows && !error && <p role="status">Loading phone number changes…</p>}
      {rows?.length === 0 && (
        <p className="glass-panel empty-state">
          {showEnded ? 'No phone number changes yet.' : 'No phone number changes waiting.'}
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
                <th>Number</th>
                <th>Status</th>
                <th>Opened (IST)</th>
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-testid="phone-recovery-row">
                  <td className="mono">{row.reference}</td>
                  {!organizationId && <td>{row.organizationName ?? '—'}</td>}
                  <td>
                    {row.subjectName || 'No name'}
                    {row.subjectMemberNumber && (
                      <div className="mono">{row.subjectMemberNumber}</div>
                    )}
                  </td>
                  <td className="mono">
                    …{row.oldPhoneLast4} to …{row.newPhoneLast4}
                  </td>
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

      {chosen && !detail && <p role="status">Opening the case…</p>}
      {detail && caseBase && (
        <section className="detail-panel glass-panel" data-testid="phone-recovery-detail">
          <h3>
            {detail.reference} · {statusText(detail)}
          </h3>
          <p>
            <strong>Person:</strong> {detail.subjectName || 'No name'}
            {detail.subjectMemberNumber ? ` · ${detail.subjectMemberNumber}` : ''}
          </p>
          <p>
            <strong>Old number:</strong> <span className="mono">{detail.oldPhone}</span> ·{' '}
            <strong>New number:</strong> <span className="mono">{detail.newPhone}</span>
          </p>
          <p>
            <strong>{documentName(detail.documentType)}</strong> ending{' '}
            <span className="mono">{detail.documentLast4}</span> ·{' '}
            {DOCUMENT_RESULT[detail.documentResult]}
          </p>
          <p>
            <strong>What was checked:</strong> {detail.reason}
          </p>
          <p>
            <strong>Opened by:</strong> {detail.openedByName || 'staff'}
            {detail.decidedAt && detail.decidedByName && (
              <>
                {' · '}
                <strong>Decided by:</strong> {detail.decidedByName}
              </>
            )}
          </p>
          {detail.status === 'OPENED' && (
            <p role="status">
              Read out <span className="mono">{detail.reference}</span>. They sign in to the app with
              the new SIM, check that it is the same reference, and confirm with a code.
            </p>
          )}
          {detail.newNumberAccount && (
            <p>
              <strong>On the new number:</strong> {NEW_NUMBER[detail.newNumberAccount]}
            </p>
          )}
          {detail.newNumberIsNominee && (
            <p role="alert">
              <strong>This is the number of the nominee this member named.</strong> Approving ends
              that nominee, and the member is asked to name someone else.
            </p>
          )}
          {detail.nomineeEnded && (
            <p>Their nominee had this number, so that nominee ended and they were asked to name someone else.</p>
          )}
          {detail.status === 'COMPLETED' && (
            <p className="help-text">
              The old number is held for 90 days, and signing in with it is refused. It can be undone
              during that time.
            </p>
          )}

          <h4>History</h4>
          {detail.events.map((event) => (
            <p key={event.id}>
              <strong>{EVENT[event.type] ?? event.type}</strong>
              {event.actorName ? ` by ${event.actorName}` : ''} · {indiaTime(event.createdAt)}
              {event.notes && (
                <>
                  <br />
                  {event.notes}
                </>
              )}
            </p>
          ))}

          <div className="action-row">
            {detail.status === 'CONFIRMED' && canDecideThis(detail) && (
              <button
                className="btn btn-primary"
                disabled={pending}
                onClick={() =>
                  notesAction(
                    'Move this account to the new number',
                    'Everyone signed in on the old phone is signed out, and so is the new phone: they sign in again with the new number. The account, wallet and memberships stay the same.',
                    'Move the account',
                    'Your reason (staff only)',
                    `${caseBase}/approve`,
                  )
                }
              >
                Approve
              </button>
            )}
            {isOpen(detail) && canDecideThis(detail) && (
              <button
                className="btn btn-secondary"
                disabled={pending}
                onClick={() =>
                  notesAction(
                    'Refuse this change',
                    'Nothing changes on the account.',
                    'Refuse',
                    'Your reason (staff only)',
                    `${caseBase}/refuse`,
                  )
                }
              >
                Refuse
              </button>
            )}
            {isOpen(detail) && (
              <button
                className="btn btn-secondary"
                disabled={pending}
                onClick={() =>
                  notesAction(
                    'Withdraw this case',
                    'For a mistyped number, or a phone that was found again. Only whoever opened it, or someone who could decide it, can withdraw it.',
                    'Withdraw',
                    'Your reason (staff only)',
                    `${caseBase}/withdraw`,
                  )
                }
              >
                Withdraw
              </button>
            )}
            {detail.canReverse && isGlobal && (
              <button
                className="btn btn-secondary"
                disabled={pending}
                onClick={() =>
                  notesAction(
                    'Undo this move',
                    'The old number comes back and everyone is signed out. Credits spent in between must be corrected by hand. Whoever approved the move cannot undo it.',
                    'Undo the move',
                    'Your reason (staff only)',
                    `${caseBase}/reverse`,
                  )
                }
              >
                Undo the move
              </button>
            )}
            <button
              className="btn btn-secondary"
              disabled={pending}
              onClick={() =>
                notesAction(
                  'Add a note',
                  'Kept in the history.',
                  'Add note',
                  'Note',
                  `${caseBase}/notes`,
                )
              }
            >
              Add a note
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
