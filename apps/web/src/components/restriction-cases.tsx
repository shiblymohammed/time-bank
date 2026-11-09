'use client';
import React, { useEffect, useState } from 'react';
import { ApiError, backend } from '@/lib/api';
import type { Action } from '@/lib/admin-types';
import { indiaTime } from '@/lib/request-utils';

type Level = 'COORDINATOR' | 'MUNICIPALITY_ADMIN' | 'SUPER_ADMIN';
type CaseStatus = 'RECOMMENDED' | 'REFUSED' | 'ACTIVE' | 'REINSTATED' | 'OVERTURNED';
type CaseSummary = {
  id: string;
  reference: string;
  organizationId: string | null;
  organizationName: string | null;
  subjectName: string | null;
  subjectMemberNumber: string | null;
  subjectPhone: string | null;
  restrictionType: string;
  scope: 'COMMUNITY' | 'PLATFORM' | null;
  level: Level;
  status: CaseStatus;
  reinstatementRecommended: boolean;
  reviewOn: string | null;
  reviewDue: boolean;
  appealStatus: 'OPEN' | 'DECIDED' | null;
  createdAt: string;
  decidedAt: string | null;
};
type CaseDetail = CaseSummary & {
  reason: string;
  memberMessage: string | null;
  complaintReference: string | null;
  recommendedByName: string | null;
  decidedByName: string | null;
  appeal: { reference: string; status: string; outcome: string | null } | null;
  events: {
    id: string;
    type: string;
    notes: string | null;
    actorName: string | null;
    createdAt: string;
  }[];
};
type AppealSummary = {
  id: string;
  reference: string;
  kind: 'RESTRICTION' | 'COMPLAINT' | 'CLOSURE';
  organizationId: string | null;
  organizationName: string | null;
  level: Level;
  status: 'OPEN' | 'DECIDED';
  outcome: 'STANDS' | 'OVERTURNED' | null;
  createdAt: string;
  decidedAt: string | null;
};
type AppealDetail = AppealSummary & {
  grounds: string;
  appellantName: string | null;
  appellantPhone: string | null;
  filedByStaff: boolean;
  staffNotes: string | null;
  memberMessage: string | null;
  decidedByName: string | null;
  restriction: {
    reference: string;
    restrictionType: string;
    scope: string | null;
    reason: string;
    memberMessage: string | null;
    recommendedByName: string | null;
    decidedByName: string | null;
    decidedAt: string | null;
  } | null;
  closure: {
    reference: string;
    reason: string;
    memberMessage: string | null;
    primaryName: string | null;
    primaryPhone: string | null;
    reportedByName: string | null;
    decidedByName: string | null;
    decidedAt: string | null;
  } | null;
  complaint: {
    reference: string;
    description: string;
    outcome: string | null;
    memberMessage: string | null;
    decidedAt: string | null;
  } | null;
};

const REFRESH_MS = 60_000;
const TYPE: Record<string, string> = {
  TEMPORARY_SUSPENSION: 'Suspension',
  PERMANENT_BAN: 'Ban',
  DUPLICATE_FREEZE: 'Duplicate account hold',
  FRAUD_INVESTIGATION_HOLD: 'Fraud investigation hold',
};
const STATUS: Record<CaseStatus, string> = {
  RECOMMENDED: 'Waiting for a decision',
  REFUSED: 'Refused',
  ACTIVE: 'In force',
  REINSTATED: 'Ended',
  OVERTURNED: 'Overturned on appeal',
};
const EVENT: Record<string, string> = {
  RECOMMENDED: 'Recommended',
  REFUSED: 'Refused',
  APPROVED: 'Approved',
  IMPOSED_DIRECTLY: 'Imposed directly',
  NOTE: 'Note',
  REINSTATEMENT_RECOMMENDED: 'Reinstatement recommended',
  REINSTATEMENT_REFUSED: 'Reinstatement refused',
  REINSTATED: 'Reinstated',
  APPEALED: 'Appealed',
  APPEAL_STANDS: 'Appeal failed',
  OVERTURNED: 'Overturned on appeal',
};
const scopeText = (scope: CaseSummary['scope']) =>
  scope === 'COMMUNITY' ? 'This community only' : scope === 'PLATFORM' ? 'All communities' : '—';
const statusText = (row: CaseSummary) =>
  row.status === 'ACTIVE' && row.appealStatus === 'OPEN'
    ? 'In force, appeal waiting'
    : row.status === 'ACTIVE' && row.reinstatementRecommended
      ? 'In force, reinstatement recommended'
      : row.status === 'ACTIVE' && row.reviewDue
        ? 'In force, review due'
        : STATUS[row.status];
const APPEAL_ABOUT: Record<AppealSummary['kind'], string> = {
  RESTRICTION: 'A restriction',
  COMPLAINT: 'A complaint’s outcome',
  CLOSURE: 'A duplicate closure',
};
const appealStatusText = (row: AppealSummary) =>
  row.status === 'OPEN'
    ? 'Waiting'
    : row.outcome === 'OVERTURNED'
      ? 'Overturned'
      : 'Decision stands';
const basePath = (organizationId: string | null) =>
  organizationId ? `/organizations/${organizationId}` : '/admin';
const casesPath = (organizationId: string | null, open: boolean) =>
  `${basePath(organizationId)}/restriction-cases${open ? '' : '?open=false'}`;
const appealsPath = (organizationId: string | null, open: boolean) =>
  `${basePath(organizationId)}/appeals${open ? '' : '?open=false'}`;

/** Decisions waiting on this person. A null scope means every community. */
export function useWaitingRestrictions(
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
      Promise.all([
        backend<CaseSummary[]>(
          casesPath(organizationId, true),
          'GET',
          undefined,
          controller.signal,
        ),
        backend<AppealSummary[]>(
          appealsPath(organizationId, true),
          'GET',
          undefined,
          controller.signal,
        ),
      ])
        .then(([cases, appeals]) =>
          setCount(
            cases.filter(
              (row) =>
                row.status === 'RECOMMENDED' || row.reinstatementRecommended || row.reviewDue,
            ).length + appeals.length,
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

export function RestrictionCases({
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
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [appeals, setAppeals] = useState<AppealSummary[]>([]);
  const [showEnded, setShowEnded] = useState(false);
  const [chosenCase, setChosenCase] = useState<string | null>(null);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [chosenAppeal, setChosenAppeal] = useState<string | null>(null);
  const [appealDetail, setAppealDetail] = useState<AppealDetail | null>(null);
  const [error, setError] = useState('');
  const base = basePath(organizationId);

  const failed = (cause: unknown, fallback: string) => {
    if (cause instanceof ApiError && cause.status === 401) onExpired();
    else setError(cause instanceof Error ? cause.message : fallback);
  };

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      Promise.all([
        backend<CaseSummary[]>(
          casesPath(organizationId, !showEnded),
          'GET',
          undefined,
          controller.signal,
        ),
        backend<AppealSummary[]>(
          appealsPath(organizationId, !showEnded),
          'GET',
          undefined,
          controller.signal,
        ),
      ])
        .then(([nextCases, nextAppeals]) => {
          setCases(nextCases);
          setAppeals(nextAppeals);
          setError('');
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) failed(cause, 'Could not load restrictions');
        });
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [organizationId, showEnded, revision]);

  useEffect(() => {
    setCaseDetail(null);
    if (!chosenCase) return;
    const controller = new AbortController();
    backend<CaseDetail>(
      `${base}/restriction-cases/${chosenCase}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then(setCaseDetail)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 404) setChosenCase(null);
        else failed(cause, 'Could not open this case');
      });
    return () => controller.abort();
  }, [chosenCase, base, revision]);

  useEffect(() => {
    setAppealDetail(null);
    if (!chosenAppeal) return;
    const controller = new AbortController();
    backend<AppealDetail>(`${base}/appeals/${chosenAppeal}`, 'GET', undefined, controller.signal)
      .then(setAppealDetail)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 404) setChosenAppeal(null);
        else failed(cause, 'Could not open this appeal');
      });
    return () => controller.abort();
  }, [chosenAppeal, base, revision]);

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

  const recommend = () =>
    openAction({
      title: 'Recommend a restriction',
      description:
        'A Municipality Admin decides. Nothing happens to the person until then. They never see your reason, or who recommended this.',
      submitLabel: 'Send recommendation',
      fields: [
        { key: 'member', label: 'Member number or phone number', minLength: 3, maxLength: 50 },
        {
          key: 'restrictionType',
          label: 'Recommendation',
          value: 'TEMPORARY_SUSPENSION',
          choices: [
            { value: 'TEMPORARY_SUSPENSION', label: 'Suspension' },
            { value: 'PERMANENT_BAN', label: 'Ban' },
          ],
        },
        {
          key: 'reason',
          label: 'Reason and evidence (staff only)',
          minLength: 10,
          maxLength: 4000,
        },
        { key: 'complaintReference', label: 'Complaint reference', optional: true, maxLength: 30 },
      ],
      submit: (values) =>
        backend(`${base}/restriction-cases`, 'POST', {
          member: values.member,
          restrictionType: values.restrictionType,
          reason: values.reason,
          ...(values.complaintReference ? { complaintReference: values.complaintReference } : {}),
        }),
    });

  const restrictDirectly = () =>
    openAction({
      title: 'Restrict directly',
      description:
        'For emergencies. This blocks the person in every community at once, with no recommendation. They can appeal.',
      submitLabel: 'Restrict now',
      fields: [
        { key: 'member', label: 'Phone number or member number', minLength: 3, maxLength: 50 },
        {
          key: 'restrictionType',
          label: 'Restriction',
          value: 'TEMPORARY_SUSPENSION',
          choices: Object.entries(TYPE).map(([value, label]) => ({ value, label })),
        },
        { key: 'reasonCode', label: 'Short reason code', minLength: 3, maxLength: 100 },
        { key: 'notes', label: 'Reason and evidence (staff only)', minLength: 10, maxLength: 4000 },
        {
          key: 'memberMessage',
          label: 'What the person is told. Name no one and no complaint.',
          minLength: 10,
          maxLength: 1000,
        },
      ],
      submit: (values) => backend('/admin/restrictions', 'POST', values),
    });

  const approve = (row: CaseDetail) =>
    openAction({
      title: `Approve this ${row.restrictionType === 'PERMANENT_BAN' ? 'ban' : 'suspension'}`,
      description:
        row.restrictionType === 'PERMANENT_BAN'
          ? 'This blocks the person in every community and freezes their credits. Requests that have not started are cancelled.'
          : 'Requests that have not started are cancelled, and their offers and upcoming visits are released. A review date only reminds staff: access never returns by itself.',
      submitLabel: 'Approve',
      fields: [
        ...(row.restrictionType === 'PERMANENT_BAN'
          ? []
          : [
              {
                key: 'scope',
                label: 'How far it reaches',
                value: 'COMMUNITY',
                choices: [
                  { value: 'COMMUNITY', label: 'This community only. Credits are not touched.' },
                  { value: 'PLATFORM', label: 'All communities. Credits are frozen.' },
                ],
              },
              { key: 'reviewOn', label: 'Review date', type: 'date', optional: true },
            ]),
        { key: 'notes', label: 'Your reason (staff only)', minLength: 3, maxLength: 2000 },
        {
          key: 'memberMessage',
          label: 'What the person is told. Name no one and no complaint.',
          minLength: 10,
          maxLength: 1000,
        },
      ],
      submit: (values) =>
        backend(`${base}/restriction-cases/${row.id}/approve`, 'POST', {
          scope: values.scope ?? 'PLATFORM',
          notes: values.notes,
          memberMessage: values.memberMessage,
          ...(values.reviewOn ? { reviewOn: values.reviewOn } : {}),
        }),
    });

  const fileForMember = (row: CaseDetail) =>
    openAction({
      title: 'File an appeal for this person',
      description:
        'For someone who does not use the app. Write what they told you. A Super Admin hears it.',
      submitLabel: 'File appeal',
      fields: [{ key: 'grounds', label: 'Their reasons', minLength: 10, maxLength: 2000 }],
      submit: (values) =>
        backend(`/organizations/${row.organizationId}/restriction-cases/${row.id}/appeal`, 'POST', {
          grounds: values.grounds,
        }),
    });

  const hearAppeal = (row: AppealDetail) =>
    openAction({
      title: 'Decide this appeal',
      description:
        row.kind === 'RESTRICTION'
          ? 'If you overturn it, access and credits come back at once. Requests that were cancelled stay cancelled. Your decision is final.'
          : row.kind === 'CLOSURE'
            ? 'If you overturn it, the account and its credits come back at once, but staff roles must be granted again. Your decision is final.'
            : 'If you overturn it, the complaint’s outcome changes. The member reads your message in the app.',
      submitLabel: 'Decide appeal',
      fields: [
        {
          key: 'outcome',
          label: 'Decision',
          value: 'STANDS',
          choices: [
            { value: 'STANDS', label: 'The decision stands' },
            { value: 'OVERTURNED', label: 'Overturn the decision' },
          ],
        },
        { key: 'notes', label: 'Your reason (staff only)', minLength: 3, maxLength: 2000 },
        { key: 'memberMessage', label: 'What the person is told', minLength: 3, maxLength: 1000 },
      ],
      submit: (values) =>
        backend(`${base}/appeals/${row.id}/decide`, 'POST', {
          outcome: values.outcome,
          notes: values.notes,
          memberMessage: values.memberMessage,
        }),
    });

  const caseBase = caseDetail && `${base}/restriction-cases/${caseDetail.id}`;

  return (
    <div className="request-workspace">
      <div className="section-heading">
        <h2>Restrictions</h2>
        <div className="action-row">
          <label className="inline-check">
            <input
              type="checkbox"
              checked={showEnded}
              onChange={(event) => setShowEnded(event.target.checked)}
            />{' '}
            Show ended and decided
          </label>
          {organizationId && (
            <button className="btn btn-primary" disabled={pending} onClick={recommend}>
              Recommend a restriction
            </button>
          )}
          {isGlobal && (
            <button className="btn btn-secondary" disabled={pending} onClick={restrictDirectly}>
              Restrict directly
            </button>
          )}
        </div>
      </div>
      <p className="help-text">
        A coordinator recommends and a Municipality Admin decides. Nobody acts on their own case,
        and whoever recommended cannot also decide. You see only cases at your level.
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!cases && !error && <p role="status">Loading restrictions…</p>}

      {appeals.length > 0 && (
        <>
          <h3>Appeals</h3>
          <div className="table-container glass-panel">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  {!organizationId && <th>Community</th>}
                  <th>About</th>
                  <th>Status</th>
                  <th>Made (IST)</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {appeals.map((row) => (
                  <tr key={row.id} data-testid="appeal-row">
                    <td className="mono">{row.reference}</td>
                    {!organizationId && <td>{row.organizationName ?? '—'}</td>}
                    <td>{APPEAL_ABOUT[row.kind]}</td>
                    <td>{appealStatusText(row)}</td>
                    <td>{indiaTime(row.createdAt)}</td>
                    <td>
                      <button
                        className="btn btn-secondary"
                        aria-label={`Open ${row.reference}`}
                        onClick={() => setChosenAppeal(row.id)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {chosenAppeal && !appealDetail && <p role="status">Opening the appeal…</p>}
      {appealDetail && (
        <section className="detail-panel glass-panel" data-testid="appeal-detail">
          <h3>
            {appealDetail.reference} · {appealStatusText(appealDetail)}
          </h3>
          <p>
            <strong>From:</strong> {appealDetail.appellantName || 'No name'} ·{' '}
            {appealDetail.appellantPhone}
            {appealDetail.filedByStaff ? ' · filed by staff for them' : ''}
          </p>
          <p>“{appealDetail.grounds}”</p>
          {appealDetail.restriction && (
            <>
              <h4>The decision</h4>
              <p>
                <strong>
                  {TYPE[appealDetail.restriction.restrictionType]} ·{' '}
                  {scopeText(appealDetail.restriction.scope as CaseSummary['scope'])}
                </strong>{' '}
                · Decided by {appealDetail.restriction.decidedByName || 'staff'}, recommended by{' '}
                {appealDetail.restriction.recommendedByName || 'staff'}
              </p>
              <p>
                <strong>Reason:</strong> {appealDetail.restriction.reason}
              </p>
              <p>
                <strong>They were told:</strong> “{appealDetail.restriction.memberMessage}”
              </p>
            </>
          )}
          {appealDetail.closure && (
            <>
              <h4>The closure</h4>
              <p>
                <strong>A duplicate account</strong> · {appealDetail.closure.reference} · Decided by{' '}
                {appealDetail.closure.decidedByName || 'staff'}, reported by{' '}
                {appealDetail.closure.reportedByName || 'staff'}
              </p>
              <p>
                <strong>The account that stays:</strong>{' '}
                {appealDetail.closure.primaryName || 'No name'} ·{' '}
                {appealDetail.closure.primaryPhone}
              </p>
              <p>
                <strong>Notes:</strong> {appealDetail.closure.reason}
              </p>
              <p>
                <strong>They were told:</strong> “{appealDetail.closure.memberMessage}”
              </p>
            </>
          )}
          {appealDetail.complaint && (
            <>
              <h4>The complaint</h4>
              <p>
                <strong>{appealDetail.complaint.reference}</strong> ·{' '}
                {appealDetail.complaint.outcome === 'UPHELD' ? 'Upheld' : 'Not upheld'}
              </p>
              <p>“{appealDetail.complaint.description}”</p>
              <p>
                <strong>They were told:</strong> “{appealDetail.complaint.memberMessage}”
              </p>
            </>
          )}
          {appealDetail.status === 'OPEN' ? (
            <div className="action-row">
              <button
                className="btn btn-primary"
                disabled={pending}
                onClick={() => hearAppeal(appealDetail)}
              >
                Decide appeal
              </button>
            </div>
          ) : (
            <p>
              <strong>Decided by {appealDetail.decidedByName || 'staff'}:</strong>{' '}
              {appealDetail.staffNotes}
              <br />
              They were told: “{appealDetail.memberMessage}”
            </p>
          )}
        </section>
      )}

      <h3>Cases</h3>
      {cases?.length === 0 && (
        <p className="glass-panel empty-state">
          {showEnded ? 'No cases yet.' : 'No recommendations or restrictions right now.'}
        </p>
      )}
      {cases && cases.length > 0 && (
        <div className="table-container glass-panel">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Reference</th>
                {!organizationId && <th>Community</th>}
                <th>Person</th>
                <th>Type</th>
                <th>Reach</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cases.map((row) => (
                <tr key={row.id} data-testid="restriction-row">
                  <td className="mono">{row.reference}</td>
                  {!organizationId && <td>{row.organizationName ?? '—'}</td>}
                  <td>
                    {row.subjectName || row.subjectPhone || 'No name'}
                    {row.subjectMemberNumber && (
                      <div className="mono">{row.subjectMemberNumber}</div>
                    )}
                  </td>
                  <td>{TYPE[row.restrictionType]}</td>
                  <td>{scopeText(row.scope)}</td>
                  <td>{statusText(row)}</td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      aria-label={`Open ${row.reference}`}
                      onClick={() => setChosenCase(row.id)}
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

      {chosenCase && !caseDetail && <p role="status">Opening the case…</p>}
      {caseDetail && caseBase && (
        <section className="detail-panel glass-panel" data-testid="restriction-detail">
          <h3>
            {caseDetail.reference} · {statusText(caseDetail)}
          </h3>
          <p>
            <strong>Person:</strong> {caseDetail.subjectName || 'No name'} ·{' '}
            {caseDetail.subjectPhone}
            {caseDetail.subjectMemberNumber ? ` · ${caseDetail.subjectMemberNumber}` : ''}
          </p>
          <p>
            <strong>{TYPE[caseDetail.restrictionType]}</strong> · {scopeText(caseDetail.scope)}
            {caseDetail.reviewOn ? ` · Review ${indiaTime(caseDetail.reviewOn)}` : ''}
          </p>
          <p>
            <strong>Reason:</strong> {caseDetail.reason}
          </p>
          <p>
            <strong>Recommended by:</strong> {caseDetail.recommendedByName || 'staff'}
            {caseDetail.decidedAt && (
              <>
                {' · '}
                <strong>Decided by:</strong> {caseDetail.decidedByName || 'staff'}
              </>
            )}
            {caseDetail.complaintReference && (
              <>
                {' · '}
                <strong>Complaint:</strong> {caseDetail.complaintReference}
              </>
            )}
          </p>
          {caseDetail.memberMessage && (
            <p>
              <strong>They were told:</strong> “{caseDetail.memberMessage}”
            </p>
          )}
          {caseDetail.appeal && (
            <p>
              <strong>Appeal:</strong> {caseDetail.appeal.reference} ·{' '}
              {caseDetail.appeal.status === 'OPEN'
                ? 'Waiting for a Super Admin'
                : caseDetail.appeal.outcome === 'OVERTURNED'
                  ? 'Overturned'
                  : 'The decision stands'}
            </p>
          )}
          <h4>History</h4>
          {caseDetail.events.map((event) => (
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
            {caseDetail.status === 'RECOMMENDED' && canDecide && (
              <>
                <button
                  className="btn btn-primary"
                  disabled={pending}
                  onClick={() => approve(caseDetail)}
                >
                  Approve
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={pending}
                  onClick={() =>
                    notesAction(
                      'Refuse this recommendation',
                      'Nothing happens to the person. Whoever recommended it is told to look.',
                      'Refuse',
                      'Your reason (staff only)',
                      `${caseBase}/refuse`,
                    )
                  }
                >
                  Refuse
                </button>
              </>
            )}
            {caseDetail.status === 'ACTIVE' &&
              caseDetail.restrictionType !== 'PERMANENT_BAN' &&
              !caseDetail.reinstatementRecommended && (
                <button
                  className="btn btn-secondary"
                  disabled={pending}
                  onClick={() =>
                    notesAction(
                      'Recommend reinstatement',
                      'A Municipality Admin decides. Access does not return until then.',
                      'Recommend',
                      'Why they should come back (staff only)',
                      `${caseBase}/recommend-reinstatement`,
                    )
                  }
                >
                  Recommend reinstatement
                </button>
              )}
            {caseDetail.status === 'ACTIVE' && canDecide && caseDetail.reinstatementRecommended && (
              <button
                className="btn btn-secondary"
                disabled={pending}
                onClick={() =>
                  notesAction(
                    'Refuse reinstatement',
                    'The restriction stays in force.',
                    'Refuse',
                    'Your reason (staff only)',
                    `${caseBase}/refuse-reinstatement`,
                  )
                }
              >
                Refuse reinstatement
              </button>
            )}
            {caseDetail.status === 'ACTIVE' &&
              (isGlobal || (canDecide && caseDetail.reinstatementRecommended)) && (
                <button
                  className="btn btn-primary"
                  disabled={pending}
                  onClick={() =>
                    notesAction(
                      'Reinstate this person',
                      'Access comes back now, along with credits held during the restriction.',
                      'Reinstate',
                      'Your reason (staff only)',
                      `${caseBase}/reinstate`,
                    )
                  }
                >
                  Reinstate
                </button>
              )}
            {caseDetail.status === 'ACTIVE' && !caseDetail.appeal && caseDetail.organizationId && (
              <button
                className="btn btn-secondary"
                disabled={pending}
                onClick={() => fileForMember(caseDetail)}
              >
                File an appeal for them
              </button>
            )}
            {['RECOMMENDED', 'ACTIVE'].includes(caseDetail.status) && (
              <button
                className="btn btn-secondary"
                disabled={pending}
                onClick={() =>
                  notesAction(
                    'Add a note',
                    'Kept in the history. The person does not see it.',
                    'Add note',
                    'Note',
                    `${caseBase}/notes`,
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
