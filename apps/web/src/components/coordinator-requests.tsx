'use client';
import React, { useEffect, useState } from 'react';
import { backend, ApiError } from '@/lib/api';
import type { Action } from '@/lib/admin-types';
import { Icon } from '@/components/icons';
import {
  REQUEST_STATUSES,
  indiaInput,
  indiaISO,
  indiaTime,
  dispatchMessage,
  reviewReasonLabel,
} from '@/lib/request-utils';

function RequestStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    MATCHING_ACTIVE: { label: 'Matching active', tone: 'purple' },
    PARTIALLY_ACCEPTED: { label: 'Partially accepted', tone: 'amber' },
    MATCHED: { label: 'Fully matched', tone: 'blue' },
    IN_PROGRESS: { label: 'In progress', tone: 'blue' },
    COMPLETED: { label: 'Completed', tone: 'emerald' },
    CANCELLED: { label: 'Cancelled', tone: 'slate' },
    EXPIRED_UNMATCHED: { label: 'Expired', tone: 'rose' },
  };
  const item = map[status] ?? { label: title(status), tone: 'slate' };
  return (
    <span className={`kpi-card-pill kpi-tone-${item.tone}`}>
      <span className="kpi-pill-dot" />
      {item.label}
    </span>
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  if (urgency === 'IMMEDIATE') {
    return (
      <span className="kpi-card-pill kpi-tone-amber" style={{ fontWeight: 700 }}>
        ⚡ Immediate
      </span>
    );
  }
  return (
    <span className="kpi-card-pill kpi-tone-blue">
      ⏱️ Scheduled
    </span>
  );
}

type Person = {
  id: string;
  membershipNumber?: string;
  fullName?: string | null;
  phone?: string;
  user?: { phoneE164: string; fullName?: string | null };
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
    beneficiaryName: string | null;
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
    belowMinimumAt: string | null;
    belowMinimumAlertedAt: string | null;
    replacementEscalatedAt: string | null;
  };
  acceptedCount: number;
  pendingCount: number;
  assignments: {
    id: string;
    membershipNumber: string;
    fullName: string | null;
    phone: string;
    status: string;
    offeredAt: string;
    acceptedAt: string | null;
    offerExpiresAt: string;
    arrivedAt: string | null;
    leavingReason: string | null;
    invitedByName: string | null;
    confirmedSchedule: string | null;
    scheduledStartTime: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    /** Set only when the phone had no signal and sent the change later (M8). */
    startReceivedAt?: string | null;
    finishReceivedAt?: string | null;
    /** Set when the visit ran long and coordinators were told. */
    longVisitAlertedAt?: string | null;
    reportedMinutes: number | null;
    completionNotes: string | null;
    confirmedAt: string | null;
    reviewReason: string | null;
    reviewNotes: string | null;
    reviewMinutes: number | null;
    reviewRequestedAt: string | null;
    reviewResolvedAt: string | null;
    pausedAt: string | null;
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
const personName = (p: Person) => p.fullName || p.user?.fullName || '';
const personLabel = (p: Person) =>
  [personName(p), p.membershipNumber || 'Membership', p.phone || p.user?.phoneE164 || '']
    .filter(Boolean)
    .join(' · ');

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
        Search by name, membership number or phone
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
            Select {personName(person) || person.membershipNumber || 'member'}
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
    [needsReview, setNeedsReview] = useState(false),
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
      ...(needsReview ? { needsReview: 'true' } : {}),
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
  }, [base, revision, status, urgency, ward, needsReview, page]);
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
  const mutable =
    request &&
    !['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED_UNMATCHED'].includes(request.status);
  // During a visit: too few volunteers on site, or the only one has handed over.
  const short = request?.status === 'IN_PROGRESS' && Boolean(request.belowMinimumAt);
  const decideVisit = (assignment: Snapshot['assignments'][number], pay: boolean) => {
    const unfinished = assignment.status === 'IN_PROGRESS';
    openAction({
      title: pay ? 'Pay for this visit' : 'Mark as not delivered',
      description: pay
        ? 'Time credits go to the volunteer. This cannot be undone here.'
        : 'No time credits are paid for this visit.',
      submitLabel: pay ? 'Pay credits' : 'Not delivered',
      fields: [
        ...(pay
          ? [
              {
                key: 'minutes',
                label: 'Minutes to pay',
                type: 'number',
                optional: !unfinished,
                min: '1',
                max: String(assignment.reportedMinutes ?? 720),
              },
            ]
          : []),
        { key: 'notes', label: 'Reason for this decision', minLength: 3, maxLength: 500 },
      ],
      submit: (v) =>
        backend(`${base}/requests/${selected}/assignments/${assignment.id}/resolve`, 'POST', {
          decision: pay ? 'PAY' : 'REJECT',
          ...(v.minutes ? { minutes: Number(v.minutes) } : {}),
          notes: v.notes,
        }),
    });
  };
  const progressing = request && ['MATCHING_ACTIVE', 'PARTIALLY_ACCEPTED'].includes(request.status);
  const postAction = (name: string, suffix: string, description: string) =>
    openAction({
      title: name,
      description,
      fields: [],
      submit: () => backend(`${base}/requests/${selected}/${suffix}`, 'POST', {}),
    });
  const totalRequests = list?.total ?? 0;
  const immediateRequests = list?.data.filter((r) => r.urgency === 'IMMEDIATE').length ?? 0;
  const activeMatching =
    list?.data.filter((r) =>
      ['MATCHING_ACTIVE', 'PARTIALLY_ACCEPTED', 'IN_PROGRESS'].includes(r.status),
    ).length ?? 0;
  const completedCount = list?.data.filter((r) => r.status === 'COMPLETED').length ?? 0;
  const hasRequestFilters = Boolean(status || urgency || ward || needsReview);

  return (
    <div className="request-workspace request-page">
      <div className="section-heading request-page-heading">
        <div>
          <h2>Service requests</h2>
          <p className="section-description">
            Review local requests, volunteer staffing, and matching rounds. All times use India Standard Time (IST).
          </p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={pending || !catalogue.length}
          onClick={() => setCreating(!creating)}
          title={!catalogue.length ? 'Add an active service in Service Catalogue first' : undefined}
        >
          <Icon name="plus" size={16} />
          {creating ? 'Close beneficiary picker' : 'New service request'}
        </button>
      </div>

      {/* KPI Stat Cards */}
      <div className="coordinator-kpi-row">
        {[
          {
            name: 'Total Requests',
            val: totalRequests,
            icon: 'requests',
            color: '#2563EB',
            glow: 'rgba(37, 99, 235, 0.08)',
            tone: 'blue',
            pill: 'Local community',
          },
          {
            name: 'Active Matching',
            val: activeMatching,
            icon: 'lightning',
            color: '#7C3AED',
            glow: 'rgba(124, 58, 237, 0.08)',
            tone: 'purple',
            pill: 'Volunteer search active',
          },
          {
            name: 'Immediate Urgency',
            val: immediateRequests,
            icon: 'clock',
            color: '#D97706',
            glow: 'rgba(217, 119, 6, 0.08)',
            tone: 'amber',
            pill: 'Priority dispatch',
          },
          {
            name: 'Available Services',
            val: catalogue.length,
            icon: 'catalogue',
            color: '#059669',
            glow: 'rgba(5, 150, 105, 0.08)',
            tone: 'emerald',
            pill: 'Active in chapter',
          },
        ].map((kpi) => (
          <div
            className={`modern-kpi-card request-kpi-card kpi-tone-${kpi.tone}`}
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

      {creating && (
        <People path={`${base}/memberships`} kind="beneficiary" onSelect={create} onError={fail} />
      )}

      {/* Filter Toolbar */}
      <div className="coordinator-filter-toolbar">
        <div className="filter-left">
          <div className="filter-group">
            <span className="filter-label">Status</span>
            <select
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
          </div>
          <div className="filter-group">
            <span className="filter-label">Urgency</span>
            <select
              aria-label="Urgency"
              value={urgency}
              onChange={(e) => {
                setUrgency(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All urgencies</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="IMMEDIATE">Immediate</option>
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">Ward</span>
            <input
              placeholder="Filter ward"
              value={ward}
              maxLength={20}
              onChange={(e) => {
                setWard(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div className="filter-right">
          <label className="coordinator-filter-checkbox inline-check">
            <input
              type="checkbox"
              checked={needsReview}
              onChange={(e) => {
                setNeedsReview(e.target.checked);
                setPage(1);
              }}
            />
            Waiting for my decision
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!list && !error && <p role="status">Loading requests…</p>}

      {/* Requests Table */}
      {list && (
        <div className="table-container glass-panel modern-table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th style={{ width: '22%' }}>Request</th>
                <th style={{ width: '20%' }}>Status</th>
                <th style={{ width: '26%' }}>Start Time (IST)</th>
                <th style={{ width: '16%' }}>Urgency</th>
                <th style={{ width: '16%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className="mono" style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0f172a' }}>
                      {row.requestNumber}
                    </span>
                  </td>
                  <td>
                    <RequestStatusBadge status={row.status} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: '#334155' }}>
                      <Icon name="calendar" size={14} />
                      <span>{indiaTime(row.scheduledStartTime)}</span>
                    </div>
                  </td>
                  <td>
                    <UrgencyBadge urgency={row.urgency} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                      onClick={() => {
                        setSelected(row.id);
                        setError('');
                      }}
                    >
                      Review matching →
                    </button>
                  </td>
                </tr>
              ))}
              {!list.data.length && (
                <tr>
                  <td colSpan={5}>
                    <div className="request-empty-state">
                      <span className="request-empty-icon" aria-hidden="true">
                        <Icon name="requests" size={20} />
                      </span>
                      <strong>{hasRequestFilters ? 'No requests match these filters' : 'No service requests yet'}</strong>
                      <p>
                        {!catalogue.length
                          ? 'Add an active service in Service Catalogue before creating a request.'
                          : hasRequestFilters
                            ? 'Adjust or clear the filters to see more requests.'
                            : 'Create a service request to start matching members with volunteers.'}
                      </p>
                      {hasRequestFilters && (
                        <button
                          type="button"
                          className="btn btn-secondary request-clear-filters"
                          onClick={() => {
                            setStatus('');
                            setUrgency('');
                            setWard('');
                            setNeedsReview(false);
                            setPage(1);
                          }}
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="pagination">
        <button disabled={!list || page === 1} onClick={() => setPage(page - 1)}>
          Previous requests
        </button>
        <span className="request-pagination-summary" aria-live="polite">
          {list
            ? list.total === 0
              ? 'No requests'
              : `Showing ${(page - 1) * 10 + 1}–${Math.min(page * 10, list.total)} of ${list.total} requests`
            : `Page ${page}`}
        </span>
        <button disabled={!list || page * 10 >= list.total} onClick={() => setPage(page + 1)}>
          Next requests
        </button>
      </div>

      {selected && !detail && !error && <p role="status">Loading matching details…</p>}

      {/* Detailed Request Inspection View */}
      {detail && request && (
        <section className="glass-panel detail-panel" aria-label="Request details" style={{ marginTop: '24px', padding: '24px' }}>
          <div className="request-detail-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span className="mono" style={{ fontSize: '0.88rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '3px 8px', borderRadius: '6px' }}>
                  {request.requestNumber}
                </span>
                <RequestStatusBadge status={request.status} />
                <UrgencyBadge urgency={request.urgency} />
              </div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                {request.serviceName}
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSelected('');
                setDetail(null);
              }}
            >
              ✕ Close request
            </button>
          </div>

          {/* Structured Detail Cards Grid */}
          <div className="request-detail-grid">
            {/* Beneficiary Card */}
            <div className="request-detail-card">
              <h4 className="request-detail-card-title">
                <Icon name="users" size={16} /> Beneficiary Information
              </h4>
              <div className="request-detail-row">
                <span className="row-label">Name</span>
                <span className="row-value">{request.beneficiaryName || 'Not specified'}</span>
              </div>
              <div className="request-detail-row">
                <span className="row-label">Membership No.</span>
                <span className="row-value mono">{request.beneficiaryMembershipNumber || 'N/A'}</span>
              </div>
              <div className="request-detail-row">
                <span className="row-label">Ward & PIN</span>
                <span className="row-value">Ward {request.locationWardNumber} · PIN {request.locationPostalCode}</span>
              </div>
              <div className="request-detail-row">
                <span className="row-label">Address</span>
                <span className="row-value">{request.locationAddressText}</span>
              </div>
              {request.beneficiaryNotes && (
                <div style={{ marginTop: '6px', padding: '8px 10px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.78rem', color: '#475569' }}>
                  <strong>Notes:</strong> {request.beneficiaryNotes}
                </div>
              )}
            </div>

            {/* Schedule & Matching Status */}
            <div className="request-detail-card">
              <h4 className="request-detail-card-title">
                <Icon name="operations" size={16} /> Schedule & Matching Status
              </h4>
              <div className="request-detail-row">
                <span className="row-label">Scheduled Start (IST)</span>
                <span className="row-value">{indiaTime(request.scheduledStartTime)}</span>
              </div>
              <div className="request-detail-row">
                <span className="row-label">Expected Duration</span>
                <span className="row-value">{request.expectedDurationMinutes} minutes</span>
              </div>
              <div className="request-detail-row">
                <span className="row-label">Staffing Headcount</span>
                <span className="row-value">
                  <strong style={{ color: '#059669' }}>{detail.acceptedCount} accepted</strong> · {detail.pendingCount} pending (Min {request.minVolunteers}, Pref {request.preferredVolunteers})
                </span>
              </div>
              <div className="request-detail-row">
                <span className="row-label">Matching Scope</span>
                <span className="row-value">Tier {request.matchingTier} · {request.matchingRadiusKm} km radius</span>
              </div>
              <div className="request-detail-row">
                <span className="row-label">Required Skills</span>
                <span className="row-value">
                  {request.requiredSkills.length ? request.requiredSkills.join(', ') : 'No skills required'}
                </span>
              </div>
            </div>
          </div>

          {/* Understaffed Alert if short */}
          {short && (
            <div className="glass-panel" role="status" data-testid="team-short" style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
              <p style={{ margin: '0 0 6px', color: '#b45309', fontWeight: 700 }}>
                {detail.acceptedCount === 0
                  ? '⚠️ Nobody is on this visit now. A volunteer handed it over.'
                  : `⚠️ This visit is short of volunteers (minimum ${request.minVolunteers}).`}
              </p>
              <p className="help-text" style={{ margin: '0 0 12px' }}>
                {request.replacementEscalatedAt
                  ? 'Nobody is being offered the open place. Dispatch someone, or stop looking if nobody else is coming.'
                  : request.belowMinimumAlertedAt
                    ? 'The open place is on offer to other volunteers.'
                    : 'A teammate has finished. If nobody else stops soon, this becomes an alert.'}
              </p>
              <div className="action-row">
                <button
                  className="btn btn-secondary"
                  disabled={pending || detail.acceptedCount >= request.preferredVolunteers}
                  onClick={() => setDispatching(!dispatching)}
                >
                  {dispatching ? 'Close volunteer picker' : 'Dispatch volunteer'}
                </button>
                <button
                  className="btn btn-danger"
                  disabled={pending}
                  onClick={() =>
                    openAction({
                      title: 'Stop looking for someone',
                      description:
                        'Open offers close. Anyone still on the visit carries on. If nobody is left and no help was given, the request is cancelled.',
                      submitLabel: 'Stop looking',
                      fields: [
                        {
                          key: 'notes',
                          label: 'What you checked or decided',
                          minLength: 3,
                          maxLength: 1000,
                        },
                      ],
                      submit: (v) =>
                        backend(`${base}/requests/${selected}/stop-replacement`, 'POST', {
                          notes: v.notes,
                        }),
                    })
                  }
                >
                  Stop looking
                </button>
              </div>
            </div>
          )}

          {/* Action Toolbar */}
          {mutable && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '14px 16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
              <button
                className="btn btn-secondary"
                disabled={pending || detail.acceptedCount >= request.preferredVolunteers}
                onClick={() => setDispatching(!dispatching)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Icon name="users" size={15} />
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
                <>
                  <button
                    className="btn btn-secondary"
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
                    className="btn btn-secondary"
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
                </>
              )}
            </div>
          )}

          {/* Volunteer Dispatch Picker */}
          {dispatching && (mutable || short) && (
            <div style={{ marginBottom: '20px' }}>
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
            </div>
          )}

          {/* Volunteer Assignments & Offers */}
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
              Volunteer Assignments & Offers ({detail.assignments.length})
            </h3>
            {!detail.assignments.length && (
              <p className="empty-state" style={{ padding: '20px', background: '#f8fafc', borderRadius: '12px' }}>
                No volunteer assignments or offers dispatched yet.
              </p>
            )}
            {detail.assignments.map((a) => (
              <div className="volunteer-assignment-card" key={a.id}>
                <div className="volunteer-assignment-header">
                  <div className="volunteer-meta">
                    <div className="volunteer-avatar-badge">
                      {(a.fullName || a.membershipNumber || 'V')[0]?.toUpperCase()}
                    </div>
                    <div className="volunteer-name-block">
                      <strong>{a.fullName || a.membershipNumber}</strong>
                      <span>{a.membershipNumber} · {a.phone}</span>
                    </div>
                  </div>
                  <RequestStatusBadge status={a.status} />
                </div>

                <div className="volunteer-timeline-chips">
                  <span className="volunteer-timeline-chip">
                    Offered: {indiaTime(a.offeredAt)}
                  </span>
                  {a.acceptedAt && (
                    <span className="volunteer-timeline-chip">
                      · Accepted: {indiaTime(a.acceptedAt)}
                    </span>
                  )}
                  {a.status === 'OFFERED' && (
                    <span className="volunteer-timeline-chip" style={{ color: '#b45309' }}>
                      · Expires: {indiaTime(a.offerExpiresAt)}
                    </span>
                  )}
                  {a.arrivedAt && (
                    <span className="volunteer-timeline-chip" style={{ color: '#2563eb' }}>
                      · Arrived: {indiaTime(a.arrivedAt)}
                    </span>
                  )}
                  {a.startedAt && (
                    <span className="volunteer-timeline-chip" style={{ color: '#059669' }}>
                      · Started: {indiaTime(a.startedAt)}
                    </span>
                  )}
                  {a.finishedAt && (
                    <span className="volunteer-timeline-chip" style={{ color: '#059669', fontWeight: 600 }}>
                      · Finished: {indiaTime(a.finishedAt)} ({a.reportedMinutes} mins)
                    </span>
                  )}
                  {a.invitedByName && (
                    <span className="volunteer-timeline-chip">
                      · Invited by {a.invitedByName}
                    </span>
                  )}
                </div>

                {a.completionNotes && (
                  <p style={{ margin: '4px 0 0', fontSize: '0.80rem', color: '#475569', fontStyle: 'italic' }}>
                    “{a.completionNotes}”
                  </p>
                )}

                {a.status === 'REPLACED' && (
                  <p className="help-text" style={{ color: '#64748b', margin: '4px 0 0' }}>
                    <strong>Handed over.</strong> No time credits: only the volunteer who finishes this visit earns them.
                  </p>
                )}

                {a.leavingReason && a.startedAt && (
                  <p className="help-text" style={{ color: '#d97706', margin: '4px 0 0' }}>
                    <strong>Reason for leaving:</strong> {a.leavingReason}
                  </p>
                )}

                {a.status === 'IN_PROGRESS' && a.longVisitAlertedAt && (
                  <p className="help-text" data-testid="running-long" style={{ color: '#dc2626', margin: '4px 0 0' }}>
                    ⚠️ <strong>Running long.</strong> Expected {request?.expectedDurationMinutes} mins and still active. Call the volunteer, then pay or mark not delivered.
                  </p>
                )}

                {(a.startReceivedAt || a.finishReceivedAt) && (
                  <p className="help-text" data-testid="recorded-offline" style={{ color: '#64748b', margin: '4px 0 0' }}>
                    <strong>Recorded offline.</strong> Times are when tapped on device.
                  </p>
                )}

                {a.reviewRequestedAt && !a.reviewResolvedAt && (
                  <p className="help-text" style={{ color: '#7c3aed', margin: '4px 0 0' }}>
                    <strong>Review: {reviewReasonLabel(a.reviewReason)}.</strong>
                    {a.reviewNotes ? ` “${a.reviewNotes}”` : ''}
                    {a.reviewMinutes ? ` Confirmed ${a.reviewMinutes} mins.` : ''}
                  </p>
                )}

                {a.pausedAt && (
                  <p className="help-text" style={{ color: '#dc2626', margin: '4px 0 0' }}>
                    <strong>Paused by a safety alert.</strong> Handle it in Safety alerts first.
                  </p>
                )}

                {!a.pausedAt &&
                  (a.status === 'IN_PROGRESS' ||
                    (a.status === 'COMPLETED' && a.reviewRequestedAt && !a.reviewResolvedAt)) && (
                    <div className="action-row" style={{ marginTop: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={pending}
                        onClick={() => decideVisit(a, true)}
                      >
                        ✓ Pay for visit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={pending}
                        onClick={() => decideVisit(a, false)}
                      >
                        ✕ Not delivered
                      </button>
                    </div>
                  )}
              </div>
            ))}
          </div>

          {/* Matching Rounds & Reschedules */}
          <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div className="request-detail-card">
              <h4 className="request-detail-card-title">
                <Icon name="lightning" size={16} /> Matching Rounds ({detail.rounds.length})
              </h4>
              {!detail.rounds.length && <p className="help-text" style={{ margin: 0 }}>No matching rounds recorded.</p>}
              {detail.rounds.map((r) => (
                <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '0.78rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 650, color: '#0f172a' }}>
                    <span>Round {r.roundNumber} (Tier {r.tier})</span>
                    <span>{title(r.status)}</span>
                  </div>
                  <div style={{ color: '#64748b', marginTop: '2px' }}>
                    {r.searchRadiusKm} km radius · {r.offersDispatchedCount} offered / {r.offersAcceptedCount} accepted
                  </div>
                </div>
              ))}
            </div>

            <div className="request-detail-card">
              <h4 className="request-detail-card-title">
                <Icon name="calendar" size={16} /> Reschedule History ({detail.reschedules.length})
              </h4>
              {!detail.reschedules.length && <p className="help-text" style={{ margin: 0 }}>No reschedules recorded.</p>}
              {detail.reschedules.map((r) => (
                <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px dashed #e2e8f0', fontSize: '0.78rem' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>
                    {indiaTime(r.previousStartTime)} → {indiaTime(r.newStartTime)}
                  </div>
                  <div style={{ color: '#64748b', marginTop: '2px' }}>
                    {r.reason} · Recorded {indiaTime(r.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
