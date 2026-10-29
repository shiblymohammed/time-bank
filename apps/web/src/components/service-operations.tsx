'use client';

import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import {
  BeneficiaryEligibilityType,
  CaregiverRelationshipType,
  ServiceRequestStatus,
} from '@ktb/shared-types';
import { api, ApiError, allMemberships } from '../lib/api';

interface Category {
  id: string;
  code: string;
  nameEn: string;
  isActive: boolean;
}
interface Service {
  id: string;
  code: string;
  nameEn: string;
  isActive: boolean;
}
interface CatalogueItem {
  id: string;
  globalServiceId: string;
  isEnabled: boolean;
  globalService?: Service;
}
interface Proposal {
  id: string;
  organizationId: string;
  proposedName: string;
  justification: string;
  status: string;
}
interface Zone {
  id: string;
  name: string;
  code: string;
  wardNumbers: string[];
  isActive: boolean;
}
interface Member {
  id: string;
  membershipNumber?: string;
  status: string;
  user?: { phoneE164: string };
}
interface RequestRecord {
  id: string;
  requestNumber: string;
  status: string;
  scheduledStartTime: string;
  locationAddressText: string;
  locationWardNumber: string;
  assignments?: { id: string; volunteerMembershipId: string; status: string }[];
}
interface Caregiver {
  id: string;
  caregiverMembershipId: string;
  status: string;
}
interface Props {
  organizationId: string | null;
  onError: (cause: unknown) => void;
}

function Field({
  name,
  label,
  type = 'text',
  value,
  min,
  maxLength,
  required = true,
}: {
  name: string;
  label: string;
  type?: string;
  value?: string | number;
  min?: number;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      {label}
      <input
        className="form-input"
        name={name}
        type={type}
        defaultValue={value}
        min={min}
        step={name === 'radius' ? 'any' : undefined}
        maxLength={maxLength}
        required={required}
      />
    </label>
  );
}
function Select({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      {label}
      <select className="form-input" name={name} required>
        {children}
      </select>
    </label>
  );
}
function ActionForm({
  title,
  children,
  submit,
  onSubmit,
}: {
  title: string;
  children: ReactNode;
  submit: string;
  onSubmit: (data: FormData) => Promise<void>;
}) {
  const [formError, setFormError] = useState('');
  return (
    <form
      style={{ display: 'grid', gap: 12, marginBlock: 24 }}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setFormError('');
        void Promise.resolve()
          .then(() => onSubmit(data))
          .catch((cause) =>
            setFormError(cause instanceof Error ? cause.message : 'Invalid form values'),
          );
      }}
    >
      <h3>{title}</h3>
      {formError && <p role="alert">{formError}</p>}
      {children}
      <button className="btn btn-primary">{submit}</button>
    </form>
  );
}
const str = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
const number = (data: FormData, key: string) => Number(data.get(key));
const list = (data: FormData, key: string) =>
  str(data, key)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const iso = (data: FormData, key: string) => new Date(str(data, key)).toISOString();

export function ServiceOperations({ organizationId, onError }: Props) {
  const [section, setSection] = useState('catalogue');
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState<RequestRecord | null>(null);
  const [beneficiary, setBeneficiary] = useState('');
  const [volunteer, setVolunteer] = useState<{
    id: string;
    availability: {
      isAvailableImmediate: boolean;
      maxTravelRadiusKm: number;
      preferredWardNumbers: string[];
    };
    skills: { id: string; skillCode: string; status: string }[];
    zones: { id: string; zoneId: string; zone?: { name: string } }[];
  } | null>(null);
  const [recordDetails, setRecordDetails] = useState<Record<string, unknown> | null>(null);

  const [eligibility, setEligibility] = useState<{ status: string; reviewDueAt: string } | null>(
    null,
  );
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const base = `/api/organizations/${organizationId}`;

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    setLoading(true);
    setError('');
    setDetail(null);
    setRecordDetails(null);
    setVolunteer(null);
    const load = async () => {
      if (section === 'profile') {
        const profile = await api<Record<string, unknown>>('/api/auth/me', options);
        if (!controller.signal.aborted) setRecordDetails(profile);
      } else if (section === 'catalogue') {
        const [cats, definitions, proposalsData, local] = await Promise.all([
          api<Category[]>('/api/catalogue/categories', options),
          api<Service[]>('/api/catalogue/global?activeOnly=false', options),
          api<Proposal[]>(
            organizationId ? `${base}/catalogue/proposals` : '/api/catalogue/proposals',
            options,
          ),
          organizationId
            ? api<CatalogueItem[]>(`${base}/catalogue?all=true`, options)
            : Promise.resolve([]),
        ]);
        if (controller.signal.aborted) return;
        setCategories(cats);
        setServices(definitions);
        setProposals(
          organizationId
            ? proposalsData.filter((p) => p.organizationId === organizationId)
            : proposalsData,
        );
        setCatalogue(local);
      } else if (organizationId) {
        const memberData = await allMemberships<Member>(organizationId, controller.signal);
        if (controller.signal.aborted) return;
        setMembers(memberData.filter((m) => m.status === 'APPROVED'));
        if (section === 'requests') {
          const query = new URLSearchParams({ page: String(page), limit: '20' });
          if (status) query.set('status', status);
          const local = await api<CatalogueItem[]>(`${base}/catalogue`, options);
          if (controller.signal.aborted) return;
          setCatalogue(local);
          const result = await api<{ data: RequestRecord[]; total: number }>(
            `${base}/requests?${query}`,
            options,
          );
          if (controller.signal.aborted) return;
          setRequests(result.data);
          setTotal(result.total);
        } else if (section === 'zones') {
          const result = await api<Zone[]>(`${base}/zones`, options);
          if (!controller.signal.aborted) setZones(result);
        }
      }
    };
    void load()
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Unable to load services');
          onError(cause);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [organizationId, base, section, revision, page, status, onError]);

  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed');
      onError(cause);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const save = (path: string, body: unknown, method = 'POST') =>
    run(async () => {
      await api(path, { method, body: JSON.stringify(body) });
      setNotice('Saved successfully.');
      setRevision((v) => v + 1);
      setEligibility(null);
      setCaregivers([]);
    });
  const memberOptions = members.map((member) => (
    <option key={member.id} value={member.id}>
      {member.user?.phoneE164 ?? member.membershipNumber ?? member.id}
    </option>
  ));
  const serviceOptions = services
    .filter((s) => s.isActive)
    .map((service) => (
      <option key={service.id} value={service.id}>
        {service.nameEn}
      </option>
    ));
  const viewBeneficiary = (membershipId: string) =>
    run(async () => {
      setEligibility(null);
      setCaregivers([]);
      setBeneficiary('');
      const [result, authorizations] = await Promise.all([
        api<{ status: string; reviewDueAt: string } | null>(
          `${base}/beneficiaries/${membershipId}/eligibility`,
        ).catch((cause) => {
          if (cause instanceof ApiError && cause.status === 404) return null;
          throw cause;
        }),
        api<Caregiver[]>(`${base}/beneficiaries/${membershipId}/caregivers`),
      ]);
      setBeneficiary(membershipId);
      setEligibility(result);
      setCaregivers(authorizations);
      setNotice(result ? '' : 'No eligibility record found.');
    });

  return (
    <section className="glass-panel" style={{ padding: 24 }} aria-busy={loading || busy}>
      <h1>Service operations</h1>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBlock: 20 }}>
        {['catalogue', 'requests', 'beneficiaries', 'zones', 'profile'].map((tab) => (
          <button
            key={tab}
            className={`btn ${section === tab ? 'btn-primary' : ''}`}
            disabled={busy}
            aria-pressed={section === tab}
            onClick={() => {
              setSection(tab);
              setError('');
              setNotice('');
            }}
          >
            {tab === 'zones' ? 'Zones & volunteers' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">Loading live service data…</p>}
      <button className="btn" disabled={busy || loading} onClick={() => setRevision((v) => v + 1)}>
        Refresh
      </button>
      {!organizationId && section !== 'catalogue' && section !== 'profile' && (
        <p>Select an active organization in Tenant Scope to manage {section}.</p>
      )}
      {recordDetails && (
        <section aria-label="Record details" style={{ marginBlock: 16 }}>
          <h2>{section === 'profile' ? 'Your account' : 'Details'}</h2>
          <dl>
            {Object.entries(recordDetails)
              .filter(([, value]) => value !== null && typeof value !== 'object')
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{key.replace(/([A-Z])/g, ' $1')}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
          </dl>
          <button className="btn" onClick={() => setRecordDetails(null)}>
            Close details
          </button>
        </section>
      )}
      <fieldset disabled={loading || busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
        {section === 'catalogue' && (
          <>
            <h2>Service categories</h2>
            {!categories.length && !loading && !error && <p>No categories yet.</p>}
            <ul>
              {categories.map((category) => (
                <li key={category.id}>
                  {category.nameEn} ({category.code}) · {category.isActive ? 'Active' : 'Inactive'}{' '}
                  <button
                    className="btn"
                    onClick={() =>
                      void save(
                        `/api/catalogue/categories/${category.id}`,
                        { isActive: !category.isActive },
                        'PATCH',
                      )
                    }
                  >
                    {category.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </li>
              ))}
            </ul>
            <ActionForm
              title="Create category"
              submit="Create category"
              onSubmit={(data) =>
                save('/api/catalogue/categories', {
                  code: str(data, 'code').toUpperCase(),
                  nameEn: str(data, 'nameEn'),
                  nameMl: str(data, 'nameMl'),
                })
              }
            >
              <Field name="code" label="Category code" maxLength={50} />
              <Field name="nameEn" label="English name" maxLength={100} />
              <Field name="nameMl" label="Malayalam name" maxLength={100} />
            </ActionForm>
            <h2>Global services</h2>
            {!services.length && !loading && !error && <p>No services yet.</p>}
            <ul>
              {services.map((service) => (
                <li key={service.id}>
                  {service.nameEn} ({service.code}) · {service.isActive ? 'Active' : 'Inactive'}{' '}
                  <button
                    className="btn"
                    onClick={() =>
                      void run(async () =>
                        setRecordDetails(
                          await api<Record<string, unknown>>(`/api/catalogue/global/${service.id}`),
                        ),
                      )
                    }
                  >
                    View service details
                  </button>{' '}
                  <button
                    className="btn"
                    onClick={() =>
                      void save(
                        `/api/catalogue/global/${service.id}`,
                        { isActive: !service.isActive },
                        'PATCH',
                      )
                    }
                  >
                    {service.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </li>
              ))}
            </ul>
            <ActionForm
              title="Create global service"
              submit="Create service"
              onSubmit={(data) =>
                save('/api/catalogue/global', {
                  categoryId: str(data, 'categoryId'),
                  code: str(data, 'code').toUpperCase(),
                  nameEn: str(data, 'nameEn'),
                  nameMl: str(data, 'nameMl'),
                  defaultMinVolunteers: number(data, 'minimum'),
                  defaultPreferredVolunteers: number(data, 'preferred'),
                })
              }
            >
              <Select name="categoryId" label="Category">
                {categories
                  .filter((c) => c.isActive)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameEn}
                    </option>
                  ))}
              </Select>
              <Field name="code" label="Service code" maxLength={60} />
              <Field name="nameEn" label="English name" maxLength={150} />
              <Field name="nameMl" label="Malayalam name" maxLength={150} />
              <Field name="minimum" label="Minimum volunteers" type="number" min={1} value={1} />
              <Field
                name="preferred"
                label="Preferred volunteers"
                type="number"
                min={1}
                value={1}
              />
            </ActionForm>
            {organizationId && (
              <>
                <h2>Organization catalogue</h2>
                {!catalogue.length && !loading && !error && (
                  <p>No services configured for this organization.</p>
                )}
                <ul>
                  {catalogue.map((item) => (
                    <li key={item.id}>
                      {item.globalService?.nameEn ?? item.globalServiceId} ·{' '}
                      {item.isEnabled ? 'Enabled' : 'Disabled'}{' '}
                      <button
                        className="btn"
                        onClick={() =>
                          void run(async () =>
                            setRecordDetails(
                              await api<Record<string, unknown>>(`${base}/catalogue/${item.id}`),
                            ),
                          )
                        }
                      >
                        View catalogue details
                      </button>{' '}
                      <button
                        className="btn"
                        onClick={() =>
                          void save(`${base}/catalogue/configure`, {
                            globalServiceId: item.globalServiceId,
                            isEnabled: !item.isEnabled,
                          })
                        }
                      >
                        {item.isEnabled ? 'Disable' : 'Enable'}
                      </button>
                    </li>
                  ))}
                </ul>
                <ActionForm
                  title="Configure organization service"
                  submit="Save service configuration"
                  onSubmit={(data) =>
                    save(`${base}/catalogue/configure`, {
                      globalServiceId: str(data, 'globalServiceId'),
                      isEnabled: true,
                      minVolunteers: number(data, 'minimum'),
                      preferredVolunteers: number(data, 'preferred'),
                      requiresCoordinatorDispatch: data.get('dispatch') === 'on',
                    })
                  }
                >
                  <Select name="globalServiceId" label="Service">
                    {serviceOptions}
                  </Select>
                  <Field
                    name="minimum"
                    label="Minimum volunteers"
                    type="number"
                    min={1}
                    value={1}
                  />
                  <Field
                    name="preferred"
                    label="Preferred volunteers"
                    type="number"
                    min={1}
                    value={1}
                  />
                  <label>
                    <input name="dispatch" type="checkbox" /> Require coordinator dispatch
                  </label>
                </ActionForm>
              </>
            )}
            {organizationId && (
              <ActionForm
                title="Submit local service proposal"
                submit="Submit proposal"
                onSubmit={(data) =>
                  save(`${base}/catalogue/proposals`, {
                    categoryId: str(data, 'categoryId'),
                    proposedName: str(data, 'name'),
                    description: str(data, 'description'),
                    justification: str(data, 'justification'),
                    suggestedMinVolunteers: number(data, 'minimum'),
                  })
                }
              >
                <Select name="categoryId" label="Category">
                  {categories
                    .filter((c) => c.isActive)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameEn}
                      </option>
                    ))}
                </Select>
                <Field name="name" label="Proposed service name" maxLength={150} />
                <Field
                  name="description"
                  label="Description (at least 10 characters)"
                  maxLength={1000}
                />
                <Field
                  name="justification"
                  label="Justification (at least 10 characters)"
                  maxLength={1000}
                />
                <Field name="minimum" label="Minimum volunteers" type="number" min={1} value={1} />
              </ActionForm>
            )}
            <h2>Service proposals</h2>
            {!proposals.length && !loading && !error && <p>No proposals.</p>}
            {proposals.map((proposal) => (
              <div key={proposal.id}>
                <h3>
                  {proposal.proposedName} · {proposal.status}
                </h3>
                <p>{proposal.justification}</p>
                {proposal.status === 'PENDING_REVIEW' && (
                  <ActionForm
                    title="Review proposal"
                    submit="Save review"
                    onSubmit={(data) =>
                      save(
                        `/api/catalogue/proposals/${proposal.id}/review`,
                        {
                          status: str(data, 'status'),
                          ...(str(data, 'service')
                            ? { resultingGlobalServiceId: str(data, 'service') }
                            : {}),
                          ...(str(data, 'reason') ? { rejectionReason: str(data, 'reason') } : {}),
                        },
                        'PATCH',
                      )
                    }
                  >
                    <Select name="status" label="Decision">
                      <option>APPROVED</option>
                      <option>REJECTED</option>
                    </Select>
                    <label>
                      Link approved service (optional)
                      <select className="form-input" name="service">
                        <option value="">No linked service</option>
                        {serviceOptions}
                      </select>
                    </label>
                    <Field
                      name="reason"
                      label="Rejection reason (required when rejecting)"
                      required={false}
                    />
                  </ActionForm>
                )}
              </div>
            ))}
          </>
        )}
        {organizationId && section === 'requests' && (
          <>
            <h2>Service requests</h2>
            <ActionForm
              title="Create service request"
              submit="Create request"
              onSubmit={(data) =>
                save(`${base}/requests`, {
                  serviceCatalogId: str(data, 'serviceCatalogId'),
                  beneficiaryMembershipId: str(data, 'beneficiaryMembershipId'),
                  creationChannel: 'COORDINATOR_ON_BEHALF',
                  urgency: 'SCHEDULED',
                  scheduledStartTime: iso(data, 'start'),
                  locationAddressText: str(data, 'address'),
                  locationWardNumber: str(data, 'ward'),
                  locationPostalCode: str(data, 'postal'),
                })
              }
            >
              <Select name="serviceCatalogId" label="Organization service">
                {catalogue
                  .filter((c) => c.isEnabled)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.globalService?.nameEn ?? c.globalServiceId}
                    </option>
                  ))}
              </Select>
              <Select name="beneficiaryMembershipId" label="Beneficiary membership">
                {memberOptions}
              </Select>
              <Field name="start" label="Scheduled start" type="datetime-local" />
              <Field name="address" label="Service address" maxLength={500} />
              <Field name="ward" label="Ward number" maxLength={20} />
              <Field name="postal" label="Postal code (6 digits)" maxLength={6} />
            </ActionForm>

            <label>
              Status{' '}
              <select
                className="form-input"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {Object.values(ServiceRequestStatus).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <p>
              {total} requests · Page {page}
            </p>
            <button className="btn" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button
              className="btn"
              disabled={page * 20 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Status</th>
                    <th>Scheduled</th>
                    <th>Ward</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!requests.length && !loading && !error && (
                    <tr>
                      <td colSpan={5}>No requests found.</td>
                    </tr>
                  )}
                  {requests.map((request) => (
                    <tr key={request.id}>
                      <td>{request.requestNumber}</td>
                      <td>{request.status}</td>
                      <td>{new Date(request.scheduledStartTime).toLocaleString()}</td>
                      <td>{request.locationWardNumber}</td>
                      <td>
                        <button
                          className="btn"
                          onClick={() =>
                            void run(async () =>
                              setDetail(await api<RequestRecord>(`${base}/requests/${request.id}`)),
                            )
                          }
                        >
                          View details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail && (
              <div>
                <h3>{detail.requestNumber}</h3>
                <p>
                  {detail.status} · {detail.locationAddressText}
                </p>
                <h4>Volunteer assignments</h4>
                <ul>
                  {detail.assignments?.map((assignment) => (
                    <li key={assignment.id}>
                      {assignment.volunteerMembershipId} · {assignment.status}
                    </li>
                  ))}
                </ul>
                <ActionForm
                  title="Dispatch volunteer"
                  submit="Dispatch"
                  onSubmit={(data) =>
                    save(`${base}/requests/${detail.id}/dispatch`, {
                      volunteerMembershipId: str(data, 'volunteer'),
                      dispatchNotes: str(data, 'notes'),
                    })
                  }
                >
                  <Select name="volunteer" label="Volunteer membership">
                    {memberOptions}
                  </Select>
                  <Field name="notes" label="Dispatch notes" required={false} />
                </ActionForm>
                <button
                  className="btn"
                  onClick={() => void save(`${base}/requests/${detail.id}/expand-radius`, {})}
                >
                  Expand matching radius
                </button>{' '}
                <button
                  className="btn"
                  onClick={() => void save(`${base}/requests/${detail.id}/progression`, {})}
                >
                  Evaluate matching progression
                </button>
                <ActionForm
                  title="Reschedule request"
                  submit="Reschedule"
                  onSubmit={(data) =>
                    save(`${base}/requests/${detail.id}/reschedule`, {
                      newStartTime: iso(data, 'start'),
                      reason: str(data, 'reason'),
                    })
                  }
                >
                  <Field name="start" label="New start time" type="datetime-local" />
                  <Field name="reason" label="Reason" maxLength={500} />
                </ActionForm>
                <ActionForm
                  title="Cancel request"
                  submit="Cancel request"
                  onSubmit={(data) =>
                    save(`${base}/requests/${detail.id}/cancel`, {
                      reasonCode: str(data, 'reasonCode'),
                      notes: str(data, 'notes'),
                    })
                  }
                >
                  <Field name="reasonCode" label="Reason code" maxLength={50} />
                  <Field name="notes" label="Cancellation notes" maxLength={500} />
                </ActionForm>
              </div>
            )}
          </>
        )}
        {organizationId && section === 'beneficiaries' && (
          <>
            <ActionForm
              title="Look up beneficiary"
              submit="Load eligibility & caregivers"
              onSubmit={(data) => viewBeneficiary(str(data, 'membershipId'))}
            >
              <Select name="membershipId" label="Membership">
                {memberOptions}
              </Select>
            </ActionForm>
            {eligibility && (
              <p>
                Eligibility: {eligibility.status} · Review due{' '}
                {new Date(eligibility.reviewDueAt).toLocaleDateString()}
              </p>
            )}
            {caregivers.map((caregiver) => (
              <div key={caregiver.id}>
                <p>
                  {caregiver.caregiverMembershipId} · {caregiver.status}
                </p>
                <ActionForm
                  title="Review caregiver authorization"
                  submit="Save caregiver review"
                  onSubmit={(data) =>
                    save(
                      `${base}/caregivers/${caregiver.id}/review`,
                      {
                        status: str(data, 'status'),
                        notes: str(data, 'notes'),
                        revocationReason: str(data, 'notes'),
                      },
                      'PATCH',
                    )
                  }
                >
                  <Select name="status" label="Decision">
                    <option>APPROVED</option>
                    <option>REVOKED</option>
                  </Select>
                  <Field name="notes" label="Review reason" />
                </ActionForm>
              </div>
            ))}
            <ActionForm
              title="Grant or renew eligibility"
              submit="Save eligibility"
              onSubmit={(data) =>
                save(`${base}/beneficiaries/eligibility`, {
                  membershipId: str(data, 'membershipId'),
                  eligibilityType: str(data, 'eligibilityType'),
                  reviewDueAt: iso(data, 'reviewDueAt'),
                  monthlyRequestQuota: number(data, 'quota'),
                  approvedAssistanceCategories: list(data, 'categories'),
                })
              }
            >
              <Select name="membershipId" label="Membership">
                {memberOptions}
              </Select>
              <Select name="eligibilityType" label="Eligibility type">
                {Object.values(BeneficiaryEligibilityType).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
              <Field name="reviewDueAt" label="Review due" type="datetime-local" />
              <Field name="quota" label="Monthly request quota" type="number" min={1} value={8} />
              <Field
                name="categories"
                label="Approved category IDs (comma separated, * for all)"
                value="*"
              />
            </ActionForm>
            <ActionForm
              title="Request caregiver authorization"
              submit="Request authorization"
              onSubmit={(data) =>
                save(`${base}/caregivers/authorize`, {
                  beneficiaryMembershipId: str(data, 'beneficiary'),
                  caregiverMembershipId: str(data, 'caregiver'),
                  relationshipType: str(data, 'relationship'),
                })
              }
            >
              <Select name="beneficiary" label="Beneficiary membership">
                {memberOptions}
              </Select>
              <Select name="caregiver" label="Caregiver membership">
                {memberOptions}
              </Select>
              <Select name="relationship" label="Relationship">
                {Object.values(CaregiverRelationshipType).map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
            </ActionForm>
            {beneficiary && <p>Last lookup membership: {beneficiary}</p>}
          </>
        )}
        {organizationId && section === 'zones' && (
          <>
            <ActionForm
              title="Look up volunteer"
              submit="Load availability, skills & zones"
              onSubmit={(data) =>
                run(async () => {
                  setVolunteer(null);
                  const id = str(data, 'membershipId');
                  const [availability, skills, assignedZones] = await Promise.all([
                    api<{
                      isAvailableImmediate: boolean;
                      maxTravelRadiusKm: number;
                      preferredWardNumbers: string[];
                    }>(`${base}/volunteers/${id}/availability`),
                    api<{ id: string; skillCode: string; status: string }[]>(
                      `${base}/volunteers/${id}/skills`,
                    ),
                    api<{ id: string; zoneId: string; zone?: { name: string } }[]>(
                      `${base}/volunteers/${id}/zones`,
                    ),
                  ]);
                  setVolunteer({ id, availability, skills, zones: assignedZones });
                })
              }
            >
              <Select name="membershipId" label="Volunteer membership">
                {memberOptions}
              </Select>
            </ActionForm>
            {volunteer && (
              <div>
                <h3>Skills</h3>
                {volunteer.skills.length === 0 && <p>No skills registered.</p>}
                <ul>
                  {volunteer.skills.map((skill) => (
                    <li key={skill.id}>
                      {skill.skillCode} · {skill.status}
                    </li>
                  ))}
                </ul>
                <h3>Assigned zones</h3>
                {volunteer.zones.length === 0 && <p>No assigned zones.</p>}
                <ul>
                  {volunteer.zones.map((zone) => (
                    <li key={zone.id}>
                      {zone.zone?.name ?? zone.zoneId}{' '}
                      <button
                        className="btn"
                        onClick={() =>
                          void save(
                            `${base}/zones/${zone.zoneId}/volunteers/${volunteer.id}`,
                            {},
                            'DELETE',
                          )
                        }
                      >
                        Remove from zone
                      </button>
                    </li>
                  ))}
                </ul>
                <ActionForm
                  key={volunteer.id}
                  title="Update volunteer availability"
                  submit="Save availability"
                  onSubmit={(data) =>
                    save(
                      `${base}/volunteers/${volunteer.id}/availability`,
                      {
                        isAvailableImmediate: str(data, 'available') === 'true',
                        maxTravelRadiusKm: number(data, 'radius'),
                        preferredWardNumbers: list(data, 'wards'),
                      },
                      'PUT',
                    )
                  }
                >
                  <label>
                    Available immediately{' '}
                    <select
                      name="available"
                      className="form-input"
                      defaultValue={String(volunteer.availability.isAvailableImmediate)}
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </label>
                  <Field
                    name="radius"
                    label="Travel radius in km (0.5–50)"
                    type="number"
                    min={0.5}
                    value={volunteer.availability.maxTravelRadiusKm}
                  />
                  <Field
                    name="wards"
                    label="Preferred wards (comma separated)"
                    required={false}
                    value={volunteer.availability.preferredWardNumbers.join(', ')}
                  />
                </ActionForm>
              </div>
            )}

            <h2>Operational zones</h2>
            <ul>
              {zones.map((zone) => (
                <li key={zone.id}>
                  {zone.name} ({zone.code}) · Wards {zone.wardNumbers.join(', ')} ·{' '}
                  {zone.isActive ? 'Active' : 'Inactive'}{' '}
                  <button
                    className="btn"
                    onClick={() =>
                      void run(async () =>
                        setRecordDetails(
                          await api<Record<string, unknown>>(`${base}/zones/${zone.id}`),
                        ),
                      )
                    }
                  >
                    View zone details
                  </button>{' '}
                  <button
                    className="btn"
                    onClick={() =>
                      void save(`${base}/zones/${zone.id}`, { isActive: !zone.isActive }, 'PUT')
                    }
                  >
                    {zone.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </li>
              ))}
            </ul>
            <ActionForm
              title="Create zone"
              submit="Create zone"
              onSubmit={(data) =>
                save(`${base}/zones`, {
                  code: str(data, 'code').toUpperCase(),
                  name: str(data, 'name'),
                  wardNumbers: list(data, 'wards'),
                })
              }
            >
              <Field name="code" label="Zone code" maxLength={50} />
              <Field name="name" label="Zone name" maxLength={100} />
              <Field name="wards" label="Ward numbers (comma separated)" />
            </ActionForm>
            <ActionForm
              title="Assign volunteer to zone"
              submit="Assign volunteer"
              onSubmit={(data) =>
                save(`${base}/zones/${str(data, 'zone')}/volunteers`, {
                  membershipId: str(data, 'membershipId'),
                })
              }
            >
              <Select name="zone" label="Zone">
                {zones
                  .filter((z) => z.isActive)
                  .map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
              </Select>
              <Select name="membershipId" label="Volunteer membership">
                {memberOptions}
              </Select>
            </ActionForm>
            <ActionForm
              title="Verify volunteer skill"
              submit="Save skill review"
              onSubmit={(data) =>
                save(`${base}/volunteers/skills/verify`, {
                  membershipId: str(data, 'membershipId'),
                  skillCode: str(data, 'skillCode'),
                  status: str(data, 'status'),
                  verificationNotes: str(data, 'notes'),
                })
              }
            >
              <Select name="membershipId" label="Volunteer membership">
                {memberOptions}
              </Select>
              <Field name="skillCode" label="Skill code" />
              <Select name="status" label="Decision">
                <option>VERIFIED</option>
                <option>REJECTED</option>
              </Select>
              <Field name="notes" label="Verification notes" required={false} />
            </ActionForm>
          </>
        )}
      </fieldset>
    </section>
  );
}
