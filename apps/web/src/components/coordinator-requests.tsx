'use client';
import React, { useEffect, useState } from 'react';
import { backend, ApiError } from '@/lib/api';
import type { Action } from '@/lib/admin-types';
import {
  REQUEST_STATUSES,
  indiaInput,
  indiaISO,
  indiaTime,
  dispatchMessage,
} from '@/lib/request-utils';

type Person = {
  id: string;
  membershipNumber?: string;
  phone?: string;
  user?: { phoneE164: string };
};
type RequestRow = {
  id: string;
  requestNumber: string;
  status: string;
  urgency: string;
  scheduledStartTime: string;
};
type Snapshot = {
  request: RequestRow & {
    serviceName: string;
    beneficiaryMembershipNumber: string;
    expectedDurationMinutes: number;
    minVolunteers: number;
    preferredVolunteers: number;
    matchingTier: number;
    matchingRadiusKm: number;
    locationAddressText: string;
    locationWardNumber: string;
    locationPostalCode: string;
    beneficiaryNotes?: string;
    requiredSkills: string[];
    requiresReconfirmation: boolean;
  };
  acceptedCount: number;
  pendingCount: number;
  assignments: {
    id: string;
    membershipNumber: string;
    phone: string;
    status: string;
    offeredAt: string;
    acceptedAt: string | null;
    offerExpiresAt: string;
    confirmedSchedule: string | null;
    scheduledStartTime: string | null;
  }[];
  rounds: {
    id: string;
    roundNumber: number;
    tier: number;
    status: string;
    searchRadiusKm: number;
    expiresAt: string;
    offersDispatchedCount: number;
    offersAcceptedCount: number;
  }[];
  reschedules: {
    id: string;
    previousStartTime: string;
    newStartTime: string;
    reason: string;
    createdAt: string;
  }[];
};
type Catalogue = {
  id: string;
  isEnabled: boolean;
  customLabelEn?: string;
  globalService: { nameEn: string };
};
const title = (value: string) => value.replaceAll('_', ' ').toLowerCase();
const personLabel = (p: Person) =>
  `${p.membershipNumber || 'Membership'} · ${p.phone || p.user?.phoneE164 || ''}`;

function People({
  path,
  kind,
  onSelect,
  onError,
}: {
  path: string;
  kind: 'beneficiary' | 'volunteer';
  onSelect: (person: Person) => void;
  onError: (error: unknown) => void;
}) {
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1);
  const [data, setData] = useState<{ people: Person[]; total: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    const query =
      kind === 'beneficiary'
        ? `status=APPROVED&role=BENEFICIARY&offset=${(page - 1) * 10}&limit=10`
        : `page=${page}&limit=10`;
    backend<{ memberships?: Person[]; volunteers?: Person[]; total: number }>(
      `${path}?${query}&search=${encodeURIComponent(search)}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((result) =>
        setData({ people: result.memberships || result.volunteers || [], total: result.total }),
      )
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          onError(e);
        }
      });
    return () => controller.abort();
    // The caller's error handler only reports session expiry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, kind, search, page]);
  return (
    <section className="detail-panel glass-panel">
      <h3>{kind === 'beneficiary' ? 'Choose a beneficiary' : 'Choose an eligible volunteer'}</h3>
      <label>
        Search by membership number or phone
        <input
          className="form-input"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </label>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading people…</p>}
      {data?.people.map((person) => (
        <div className="document-row" key={person.id}>
          <span>{personLabel(person)}</span>
          <button className="btn btn-secondary" onClick={() => onSelect(person)}>
            Select {person.membershipNumber || 'member'}
          </button>
        </div>
      ))}
      {data && data.people.length === 0 && (
        <p className="empty-state">
          No eligible {kind === 'beneficiary' ? 'beneficiaries' : 'volunteers'} found.
        </p>
      )}
      <div className="pagination">
        <button disabled={page === 1 || !data} onClick={() => setPage(page - 1)}>
          Previous people
        </button>
        <span>
          Page {page}
          {data ? ` · ${data.total} people` : ''}
        </span>
        <button disabled={!data || page * 10 >= data.total} onClick={() => setPage(page + 1)}>
          Next people
        </button>
      </div>
    </section>
  );
}

export function CoordinatorRequests({
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
  const base = `/organizations/${organizationId}`;
  const [status, setStatus] = useState(''),
    [urgency, setUrgency] = useState(''),
    [ward, setWard] = useState(''),
    [page, setPage] = useState(1);
  const [list, setList] = useState<{ data: RequestRow[]; total: number } | null>(null);
  const [selected, setSelected] = useState(''),
    [detail, setDetail] = useState<Snapshot | null>(null);
  const [catalogue, setCatalogue] = useState<Catalogue[]>([]),
    [creating, setCreating] = useState(false),
    [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState('');
  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) onExpired();
  };
  useEffect(() => {
    const controller = new AbortController();
    setList(null);
    setError('');
    const query = new URLSearchParams({
      page: String(page),
      limit: '10',
      ...(status ? { status } : {}),
      ...(urgency ? { urgency } : {}),
      ...(ward ? { ward } : {}),
    });
    backend<{ data: RequestRow[]; total: number }>(
      `${base}/requests?${query}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then(setList)
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          fail(e);
        }
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, revision, status, urgency, ward, page]);
  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    setDispatching(false);
    if (selected)
      backend<Snapshot>(
        `${base}/requests/${selected}/matching`,
        'GET',
        undefined,
        controller.signal,
      )
        .then(setDetail)
        .catch((e) => {
          if (!controller.signal.aborted) {
            setError(e.message);
            fail(e);
          }
        });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, selected, revision]);
  useEffect(() => {
    const controller = new AbortController();
    backend<Catalogue[]>(`${base}/catalogue`, 'GET', undefined, controller.signal)
      .then((rows) => setCatalogue(rows.filter((row) => row.isEnabled)))
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          fail(e);
        }
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, revision]);
  function create(person: Person) {
    const key = crypto.randomUUID();
    openAction({
      title: 'Create service request',
      description: `For ${personLabel(person)}. All dates and times use India time (IST).`,
      fields: [
        {
          key: 'serviceCatalogId',
          label: 'Service',
          choices: catalogue.map((c) => ({
            value: c.id,
            label: c.customLabelEn || c.globalService.nameEn,
          })),
        },
        { key: 'urgency', label: 'Urgency', options: ['SCHEDULED', 'IMMEDIATE'] },
        {
          key: 'time',
          label: 'Start time (IST)',
          type: 'datetime-local',
          min: indiaInput(new Date()),
        },
        {
          key: 'duration',
          label: 'Duration in minutes',
          type: 'number',
          value: '60',
          min: '15',
          max: '480',
          step: '1',
        },
        { key: 'address', label: 'Service address', minLength: 5, maxLength: 500 },
        { key: 'ward', label: 'Ward', maxLength: 20 },
        { key: 'pin', label: 'PIN code', pattern: '[1-9][0-9]{5}' },
        { key: 'notes', label: 'Beneficiary notes', optional: true, maxLength: 2000 },
      ],
      submit: async (v) => {
        const result = await backend(`${base}/requests`, 'POST', {
          serviceCatalogId: v.serviceCatalogId,
          beneficiaryMembershipId: person.id,
          creationChannel: 'COORDINATOR_ON_BEHALF',
          urgency: v.urgency,
          scheduledStartTime: indiaISO(v.time ?? ''),
          expectedDurationMinutes: Number(v.duration),
          locationAddressText: v.address,
          locationWardNumber: v.ward,
          locationPostalCode: v.pin,
          beneficiaryNotes: v.notes,
          idempotencyKey: key,
        });
        setCreating(false);
        setPage(1);
        return result;
      },
    });
  }
  const request = detail?.request;
  const mutable = request && !['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(request.status);
  const progressing = request && ['MATCHING_ACTIVE', 'PARTIALLY_ACCEPTED'].includes(request.status);
  const postAction = (name: string, suffix: string, description: string) =>
    openAction({
      title: name,
      description,
      fields: [],
      submit: () => backend(`${base}/requests/${selected}/${suffix}`, 'POST', {}),
    });
  return (
    <div className="request-workspace">
      <div className="section-heading">
        <h2>Service requests</h2>
        <button
          className="btn btn-primary"
          disabled={pending || !catalogue.length}
          onClick={() => setCreating(!creating)}
        >
          {creating ? 'Close beneficiary picker' : 'New service request'}
        </button>
      </div>
      <p className="section-description">
        Review local requests and staffing. Matching progression runs when you ask it to check.
        Dates use India time (IST).
      </p>
      {creating && (
        <People path={`${base}/memberships`} kind="beneficiary" onSelect={create} onError={fail} />
      )}
      <div className="action-row">
        <label>
          Status
          <select
            className="form-input"
            aria-label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {title(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Urgency
          <select
            className="form-input"
            aria-label="Urgency"
            value={urgency}
            onChange={(e) => {
              setUrgency(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All urgencies</option>
            <option>SCHEDULED</option>
            <option>IMMEDIATE</option>
          </select>
        </label>
        <label>
          Ward
          <input
            className="form-input"
            value={ward}
            maxLength={20}
            onChange={(e) => {
              setWard(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!list && !error && <p role="status">Loading requests…</p>}
      {list && (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Status</th>
                <th>Start (IST)</th>
                <th>Urgency</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((row) => (
                <tr key={row.id}>
                  <td>{row.requestNumber}</td>
                  <td>{title(row.status)}</td>
                  <td>{indiaTime(row.scheduledStartTime)}</td>
                  <td>{title(row.urgency)}</td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setSelected(row.id);
                        setError('');
                      }}
                    >
                      Review {row.requestNumber}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.data.length && <p className="empty-state">No requests match these filters.</p>}
        </div>
      )}
      <div className="pagination">
        <button disabled={!list || page === 1} onClick={() => setPage(page - 1)}>
          Previous requests
        </button>
        <span>
          Page {page}
          {list ? ` · ${list.total} requests` : ''}
        </span>
        <button disabled={!list || page * 10 >= list.total} onClick={() => setPage(page + 1)}>
          Next requests
        </button>
      </div>
      {selected && !detail && !error && <p role="status">Loading matching details…</p>}
      {detail && request && (
        <section className="glass-panel detail-panel" aria-label="Request details">
          <div className="section-heading">
            <h2>
              {request.requestNumber} · {request.serviceName}
            </h2>
            <button
              onClick={() => {
                setSelected('');
                setDetail(null);
              }}
            >
              Close request
            </button>
          </div>
          <p>
            Status: {title(request.status)} · Beneficiary: {request.beneficiaryMembershipNumber}
          </p>
          <p>
            Start: {indiaTime(request.scheduledStartTime)} · {request.expectedDurationMinutes}{' '}
            minutes
          </p>
          <p>
            {request.locationAddressText} · Ward {request.locationWardNumber} · PIN{' '}
            {request.locationPostalCode}
          </p>
          {request.beneficiaryNotes && <p>Notes: {request.beneficiaryNotes}</p>}
          <p>
            {detail.acceptedCount} accepted · {detail.pendingCount} pending · Minimum{' '}
            {request.minVolunteers} · Preferred {request.preferredVolunteers}
          </p>
          <p>
            Matching tier {request.matchingTier} · Radius {request.matchingRadiusKm} km
            {request.requiredSkills.length
              ? ` · Required skills: ${request.requiredSkills.join(', ')}`
              : ''}
          </p>
          {mutable && (
            <div className="action-row">
              <button
                className="btn btn-secondary"
                disabled={pending || detail.acceptedCount >= request.preferredVolunteers}
                onClick={() => setDispatching(!dispatching)}
              >
                {dispatching ? 'Close volunteer picker' : 'Dispatch volunteer'}
              </button>
              <button
                className="btn btn-secondary"
                disabled={pending}
                onClick={() =>
                  openAction({
                    title: 'Reschedule request',
                    description:
                      'Current commitments will be cancelled. Volunteers must confirm the new time before they are counted as accepted.',
                    fields: [
                      {
                        key: 'time',
                        label: 'New start time (IST)',
                        type: 'datetime-local',
                        value: indiaInput(request.scheduledStartTime),
                        min: indiaInput(new Date()),
                      },
                      { key: 'reason', label: 'Reason', minLength: 3, maxLength: 500 },
                    ],
                    submit: (v) =>
                      backend(`${base}/requests/${selected}/reschedule`, 'POST', {
                        newStartTime: indiaISO(v.time ?? ''),
                        reason: v.reason,
                      }),
                  })
                }
              >
                Reschedule request
              </button>
              <button
                className="btn btn-secondary"
                disabled={pending}
                onClick={() =>
                  openAction({
                    title: 'Cancel request',
                    description: 'This cancels the request and its remaining commitments.',
                    fields: [
                      { key: 'reason', label: 'Reason code', minLength: 3, maxLength: 50 },
                      { key: 'notes', label: 'Notes', minLength: 3, maxLength: 500 },
                    ],
                    submit: (v) =>
                      backend(`${base}/requests/${selected}/cancel`, 'POST', {
                        reasonCode: v.reason,
                        notes: v.notes,
                      }),
                  })
                }
              >
                Cancel request
              </button>
              {progressing && (
                <div className="action-row">
                  <button
                    disabled={pending}
                    onClick={() =>
                      postAction(
                        'Check matching progression',
                        'progression',
                        'Evaluate expired offers and the current matching round.',
                      )
                    }
                  >
                    Check progression
                  </button>
                  <button
                    disabled={pending}
                    onClick={() =>
                      postAction(
                        request.matchingTier >= 3 ? 'Escalate to coordinator' : 'Expand search',
                        'expand-radius',
                        'Move to the next matching tier, or escalate when the final tier is reached.',
                      )
                    }
                  >
                    {request.matchingTier >= 3 ? 'Escalate to coordinator' : 'Expand search'}
                  </button>
                </div>
              )}
            </div>
          )}
          {dispatching && mutable && (
            <People
              path={`${base}/requests/${selected}/dispatch-volunteers`}
              kind="volunteer"
              onError={fail}
              onSelect={(person) =>
                openAction({
                  title: request.requiresReconfirmation
                    ? 'Send confirmation offer'
                    : 'Dispatch volunteer',
                  description: `${personLabel(person)} · ${indiaTime(request.scheduledStartTime)}. ${request.requiresReconfirmation ? 'The volunteer must accept the new time in their app.' : 'Confirm availability with the volunteer before assigning them.'}`,
                  fields: [
                    ...(!request.requiresReconfirmation
                      ? [
                          {
                            key: 'confirmed',
                            label: 'I confirmed the volunteer is available at this time',
                            type: 'checkbox',
                          },
                        ]
                      : []),
                    { key: 'notes', label: 'Dispatch notes', optional: true, maxLength: 1000 },
                  ],
                  submit: async (v) => {
                    if (!request.requiresReconfirmation && v.confirmed !== 'on')
                      throw new Error('Confirm availability first.');
                    const result = await backend(`${base}/requests/${selected}/dispatch`, 'POST', {
                      volunteerMembershipId: person.id,
                      dispatchNotes: v.notes,
                    });
                    setDispatching(false);
                    return result;
                  },
                  successMessage: dispatchMessage,
                })
              }
            />
          )}
          <h3>Assignments and offers</h3>
          {!detail.assignments.length && <p>No assignments yet.</p>}
          {detail.assignments.map((a) => (
            <div className="document-row" key={a.id}>
              <div>
                <strong>{a.membershipNumber}</strong> · {a.phone} · {title(a.status)}
                <p className="help-text">
                  Offered {indiaTime(a.offeredAt)} · Accepted {indiaTime(a.acceptedAt)}
                  {a.status === 'OFFERED' ? ` · Expires ${indiaTime(a.offerExpiresAt)}` : ''}
                  {` · Offered schedule ${indiaTime(a.scheduledStartTime)}`}
                </p>
              </div>
            </div>
          ))}
          <h3>Matching rounds</h3>
          {!detail.rounds.length && <p>No matching rounds recorded.</p>}
          {detail.rounds.map((r) => (
            <p key={r.id}>
              Round {r.roundNumber} · Tier {r.tier} · {r.searchRadiusKm} km · {title(r.status)} ·{' '}
              {r.offersDispatchedCount} offered / {r.offersAcceptedCount} accepted · Expires{' '}
              {indiaTime(r.expiresAt)}
            </p>
          ))}
          <h3>Reschedule history</h3>
          {!detail.reschedules.length && <p>No reschedules recorded.</p>}
          {detail.reschedules.map((r) => (
            <p key={r.id}>
              {indiaTime(r.previousStartTime)} → {indiaTime(r.newStartTime)} · {r.reason} · Recorded{' '}
              {indiaTime(r.createdAt)}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
