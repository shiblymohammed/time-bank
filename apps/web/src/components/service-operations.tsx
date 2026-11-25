'use client';

import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { BeneficiaryEligibilityType, CaregiverRelationshipType } from '@ktb/shared-types';
import { api as request, gatewayFetch as api, ApiError, allMemberships } from '../lib/api';
import { Icon } from './icons';

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
interface Proposal {
  id: string;
  organizationId: string;
  proposedName: string;
  justification: string;
  status: string;
}
interface Zone {
  nearbyVisible?: boolean;
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
  user?: { phoneE164: string; fullName?: string | null };
}
interface Caregiver {
  id: string;
  caregiverMembershipId: string;
  status: string;
}
interface Props {
  organizationId: string | null;
  bookings: ReactNode;
  /** Central catalogue writes are Super Admin only; hide them from local staff. */
  isGlobal: boolean;
  onError: (cause: unknown) => void;
  dashboardRevision: number;
}

function Field({
  name,
  label,
  type = 'text',
  value,
  min,
  maxLength,
  step,
  required = true,
}: {
  name: string;
  label: string;
  type?: string;
  value?: string | number;
  min?: number;
  maxLength?: number;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="ops-field">
      {label}
      <input
        className="form-input"
        name={name}
        type={type}
        defaultValue={value}
        min={min}
        step={step ?? (name === 'radius' ? 'any' : undefined)}
        maxLength={maxLength}
        required={required}
      />
    </label>
  );
}
function Select({
  name,
  label,
  children,
  fullWidth = false,
}: {
  name: string;
  label: string;
  children: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <label className={`ops-field ${fullWidth ? 'ops-field-full' : ''}`}>
      {label}
      <select className="form-input" name={name} required>
        {children}
      </select>
    </label>
  );
}
function ActionForm({
  title,
  icon = 'plus',
  className = '',
  children,
  submit,
  onSubmit,
}: {
  title: string;
  icon?: 'plus' | 'catalogue' | 'operations' | 'memberships' | 'overview' | 'check' | 'requests';
  className?: string;
  children: ReactNode;
  submit: string;
  onSubmit: (data: FormData) => Promise<void>;
}) {
  const [formError, setFormError] = useState('');
  return (
    <form
      className={`ops-form ${className}`}
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
      <h3 className="ops-form-title">
        <div className="ops-form-icon-badge">
          <Icon name={icon} size={15} />
        </div>
        <span>{title}</span>
      </h3>
      {formError && (
        <p className="ops-form-error" role="alert">
          {formError}
        </p>
      )}
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

export function ServiceOperations({ organizationId, bookings, isGlobal, onError, dashboardRevision }: Props) {
  const [section, setSection] = useState(organizationId ? 'bookings' : 'catalogue');
  const [beneficiaryTask, setBeneficiaryTask] = useState<
    'lookup' | 'eligibility' | 'caregivers'
  >('lookup');
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
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
  const sectionDescriptions: Record<string, string> = {
    catalogue: 'Manage shared service definitions and review community proposals.',
    beneficiaries: 'Review service eligibility and caregiver authorizations for members.',
    zones: 'Set up operational zones and manage volunteer coverage and skills.',
    profile: 'View the staff account and organization access used for this session.',
  };

  useEffect(() => {
    if (section === 'bookings') {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const options = { signal: controller.signal };
    setLoading(true);
    setError('');
    const load = async () => {
      if (section === 'profile') {
        const profile = await request<Record<string, unknown>>(
          '/api/session',
          'GET',
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) setRecordDetails(profile);
      } else if (section === 'catalogue') {
        const [cats, definitions, proposalsData] = await Promise.all([
          api<Category[]>('/api/catalogue/categories', options),
          api<Service[]>('/api/catalogue/global?activeOnly=false', options),
          api<Proposal[]>(
            organizationId ? `${base}/catalogue/proposals` : '/api/catalogue/proposals',
            options,
          ),
        ]);
        if (controller.signal.aborted) return;
        setCategories(cats);
        setServices(definitions);
        setProposals(
          organizationId
            ? proposalsData.filter((p) => p.organizationId === organizationId)
            : proposalsData,
        );
      } else if (organizationId) {
        const memberData = await allMemberships<Member>(organizationId, controller.signal);
        if (controller.signal.aborted) return;
        setMembers(memberData.filter((m) => m.status === 'APPROVED'));
        if (section === 'zones') {
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
  }, [organizationId, base, section, revision, dashboardRevision, onError]);

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
      {[member.user?.fullName, member.user?.phoneE164 ?? member.membershipNumber ?? member.id]
        .filter(Boolean)
        .join(' · ')}
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

  const TABS = [
    ...(organizationId ? [{ id: 'bookings', label: 'Bookings', icon: 'requests' as const }] : []),
    { id: 'catalogue', label: 'Catalogue', icon: 'catalogue' as const },
    { id: 'beneficiaries', label: 'Beneficiaries', icon: 'memberships' as const },
    { id: 'zones', label: 'Zones & Volunteers', icon: 'overview' as const },
    { id: 'profile', label: 'Session Profile', icon: 'users' as const },
  ];

  const navigation = (
      <div className="ops-segmented-tabs" role="group" aria-label="Operations Section">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="ops-segmented-tab"
            disabled={busy}
            aria-pressed={section === tab.id}
            onClick={() => {
              setSection(tab.id);
              setRecordDetails(null);
              setVolunteer(null);
              setError('');
              setNotice('');
            }}
          >
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
          </button>
        ))}
        {section !== 'bookings' && (
          <button
            type="button"
            className="ops-refresh-btn"
            disabled={busy || loading}
            onClick={() => setRevision((v) => v + 1)}
            title="Refresh operational data"
          >
            <Icon name="refresh" />
            <span>Refresh</span>
          </button>
        )}
      </div>
  );

  if (section === 'bookings') {
    return <section className="ops">{navigation}{bookings}</section>;
  }

  return (
    <section className="ops" aria-busy={loading || busy}>
      {navigation}
      {/* SECTION HEADING */}
      <div className="ops-section-heading">
        <div>
          <span className="ops-section-kicker">Service Operations</span>
          <h2>
            {TABS.find((t) => t.id === section)?.label || section}
          </h2>
          <p>{sectionDescriptions[section]}</p>
        </div>
        <span className="ops-scope-badge">
          <Icon name="organizations" />
          <span>{organizationId ? 'Organization Workspace' : 'Central Workspace'}</span>
        </span>
      </div>

      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success-message">
          {notice}
        </p>
      )}
      {loading && (
        <p role="status" className="loading-line">
          Loading operational data…
        </p>
      )}

      {!organizationId && section !== 'catalogue' && section !== 'profile' && (
        <div className="empty-state">
          Please select an organization in the top bar to manage {section}.
        </div>
      )}

      {/* RECORD DETAILS MODAL / DRAWER */}
      {recordDetails && (
        <div className="ops-card" style={{ borderLeft: '4px solid #0052ff' }}>
          <div className="ops-card-header">
            <h3 className="ops-card-title">
              <Icon name="operations" />
              <span>{section === 'profile' ? 'Account & Session Info' : 'Record Details'}</span>
            </h3>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setRecordDetails(null)}
            >
              Close
            </button>
          </div>
          <div className="profile-grid">
            {Object.entries(recordDetails)
              .filter(([, value]) => value !== null && typeof value !== 'object')
              .map(([key, value]) => (
                <div key={key} className="profile-item">
                  <span className="profile-item-label">{key.replace(/([A-Z])/g, ' $1')}</span>
                  <span className="profile-item-val">{String(value)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <fieldset className="ops-content" disabled={loading || busy}>
        {/* ─────────────────────────────────────────────────────────────
            TAB 1: CATALOGUE & PROPOSALS
        ───────────────────────────────────────────────────────────── */}
        {section === 'catalogue' && (
          <>
            {/* SERVICE CATEGORIES CARD */}
            <div className="ops-card">
              <div className="ops-card-header">
                <h3 className="ops-card-title">
                  <Icon name="catalogue" />
                  <span>Service Categories</span>
                </h3>
                <span className="ops-card-count">{categories.length} categories</span>
              </div>

              {!categories.length && !loading && !error ? (
                <div className="empty-state">No categories configured yet.</div>
              ) : (
                <div className="table-container" style={{ margin: 0 }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th style={{ width: '42%' }}>Category Name</th>
                        <th style={{ width: '28%' }}>Code</th>
                        <th style={{ width: '15%' }}>Status</th>
                        <th style={{ width: '15%', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((category) => (
                        <tr key={category.id}>
                          <td>
                            <div className="category-identity">
                              <div className="category-icon-box">
                                <Icon name="catalogue" />
                              </div>
                              <div className="category-name-box">
                                <strong className="category-name-title">{category.nameEn}</strong>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="code-chip font-mono">{category.code}</span>
                          </td>
                          <td>
                            <span
                              className={`status-badge ${
                                category.isActive ? 'status-active' : 'status-inactive'
                              }`}
                            >
                              <span
                                className={`status-dot ${
                                  category.isActive ? 'dot-active' : 'dot-inactive'
                                }`}
                              />
                              {category.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {isGlobal && (
                              <button
                                type="button"
                                className={`btn-service-action ${
                                  category.isActive
                                    ? 'btn-action-deactivate'
                                    : 'btn-action-activate'
                                }`}
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
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* CREATE CATEGORY FORM */}
            {isGlobal && (
              <div className="ops-card">
                <ActionForm
                  title="Create New Category"
                  className="ops-form-3col"
                  submit="+ Create Category"
                  onSubmit={(data) =>
                    save('/api/catalogue/categories', {
                      code: str(data, 'code').toUpperCase(),
                      nameEn: str(data, 'nameEn'),
                      nameMl: str(data, 'nameMl'),
                    })
                  }
                >
                  <Field name="code" label="Category Code (e.g. ELDER_CARE)" maxLength={50} />
                  <Field name="nameEn" label="English Name" maxLength={100} />
                  <Field name="nameMl" label="Malayalam Name" maxLength={100} />
                </ActionForm>
              </div>
            )}

            {/* GLOBAL CANONICAL SERVICES */}
            <div className="ops-card">
              <div className="ops-card-header">
                <h3 className="ops-card-title">
                  <Icon name="operations" />
                  <span>Canonical Services</span>
                </h3>
                <span className="ops-card-count">{services.length} services</span>
              </div>

              {!services.length && !loading && !error ? (
                <div className="empty-state">No canonical services registered yet.</div>
              ) : (
                <div className="table-container" style={{ margin: 0 }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th style={{ width: '42%' }}>Service</th>
                        <th style={{ width: '28%' }}>Code</th>
                        <th style={{ width: '15%' }}>Status</th>
                        <th style={{ width: '15%', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {services.map((service) => (
                        <tr key={service.id}>
                          <td>
                            <div className="category-identity">
                              <div className="category-icon-box">
                                <Icon name="operations" />
                              </div>
                              <strong className="category-name-title">{service.nameEn}</strong>
                            </div>
                          </td>
                          <td>
                            <span className="code-chip font-mono">{service.code}</span>
                          </td>
                          <td>
                            <span
                              className={`status-badge ${
                                service.isActive ? 'status-active' : 'status-inactive'
                              }`}
                            >
                              <span
                                className={`status-dot ${
                                  service.isActive ? 'dot-active' : 'dot-inactive'
                                }`}
                              />
                              {service.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="service-actions-row">
                              <button
                                type="button"
                                className="btn-service-action btn-action-edit"
                                onClick={() =>
                                  void run(async () =>
                                    setRecordDetails(
                                      await api<Record<string, unknown>>(
                                        `/api/catalogue/global/${service.id}`,
                                      ),
                                    ),
                                  )
                                }
                              >
                                Details
                              </button>
                              {isGlobal && (
                                <button
                                  type="button"
                                  className={`btn-service-action ${
                                    service.isActive
                                      ? 'btn-action-deactivate'
                                      : 'btn-action-activate'
                                  }`}
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
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* CREATE GLOBAL SERVICE FORM */}
            {isGlobal && (
              <div className="ops-card">
                <ActionForm
                  title="Create Canonical Service"
                  submit="+ Create Service"
                  onSubmit={(data) =>
                    save('/api/catalogue/global', {
                      categoryId: str(data, 'categoryId'),
                      code: str(data, 'code').toUpperCase(),
                      nameEn: str(data, 'nameEn'),
                      nameMl: str(data, 'nameMl'),
                      defaultMinVolunteers: number(data, 'minimum'),
                      defaultPreferredVolunteers: number(data, 'preferred'),
                      isHazardousPhysical: str(data, 'hazardous') === 'true',
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
                  <Field name="code" label="Service Code (e.g. HOME_MAINTENANCE)" maxLength={60} />
                  <Field name="nameEn" label="English Name" maxLength={150} />
                  <Field name="nameMl" label="Malayalam Name" maxLength={150} />
                  <Field
                    name="minimum"
                    label="Minimum Volunteers"
                    type="number"
                    min={1}
                    value={1}
                  />
                  <Field
                    name="preferred"
                    label="Preferred Volunteers"
                    type="number"
                    min={1}
                    value={1}
                  />
                  <Select name="hazardous" label="Heavy or Risky Physical Work" fullWidth>
                    <option value="false">No (Standard activity)</option>
                    <option value="true">
                      Yes (Stop work if team falls below safety minimum)
                    </option>
                  </Select>
                </ActionForm>
              </div>
            )}

            {/* SUBMIT LOCAL SERVICE PROPOSAL */}
            {organizationId && (
              <div className="ops-card local-service-proposal-card">
                <ActionForm
                  title="Submit Local Service Proposal"
                  submit="Submit Proposal"
                  className="local-service-proposal-form"
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
                  <Field name="name" label="Proposed Service Name" maxLength={150} />
                  <Field
                    name="description"
                    label="Description (at least 10 characters)"
                    maxLength={1000}
                  />
                  <Field
                    name="justification"
                    label="Community Justification (at least 10 characters)"
                    maxLength={1000}
                  />
                  <Field
                    name="minimum"
                    label="Suggested Volunteers"
                    type="number"
                    min={1}
                    value={1}
                  />
                </ActionForm>
              </div>
            )}

            {/* SERVICE PROPOSALS LIST */}
            <div className="ops-card">
              <div className="ops-card-header">
                <h3 className="ops-card-title">
                  <Icon name="requests" />
                  <span>Community Service Proposals</span>
                </h3>
                <span className="ops-card-count">{proposals.length} proposals</span>
              </div>

              {!proposals.length && !loading && !error ? (
                <div className="empty-state">No service proposals awaiting review.</div>
              ) : (
                proposals.map((proposal) => (
                  <div key={proposal.id} className="proposal-card">
                    <div className="proposal-header">
                      <h4 className="proposal-title">{proposal.proposedName}</h4>
                      <span
                        className={`status-badge ${
                          proposal.status === 'APPROVED'
                            ? 'status-active'
                            : proposal.status === 'REJECTED'
                              ? 'status-inactive'
                              : 'status-draft'
                        }`}
                      >
                        {proposal.status}
                      </span>
                    </div>
                    <p className="proposal-desc">{proposal.justification}</p>

                    {isGlobal && proposal.status === 'PENDING_REVIEW' && (
                      <ActionForm
                        title="Review Service Proposal"
                        submit="Save Review"
                        onSubmit={(data) =>
                          save(
                            `/api/catalogue/proposals/${proposal.id}/review`,
                            {
                              status: str(data, 'status'),
                              ...(str(data, 'service')
                                ? { resultingGlobalServiceId: str(data, 'service') }
                                : {}),
                              ...(str(data, 'reason')
                                ? { rejectionReason: str(data, 'reason') }
                                : {}),
                            },
                            'PATCH',
                          )
                        }
                      >
                        <Select name="status" label="Decision">
                          <option>APPROVED</option>
                          <option>REJECTED</option>
                        </Select>
                        <label className="ops-field">
                          Link Canonical Service (Optional)
                          <select className="form-input" name="service">
                            <option value="">No linked service</option>
                            {serviceOptions}
                          </select>
                        </label>
                        <Field
                          name="reason"
                          label="Rejection Reason (Required when rejecting)"
                          required={false}
                        />
                      </ActionForm>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* ─────────────────────────────────────────────────────────────
            TAB 2: BENEFICIARIES & CAREGIVERS
        ───────────────────────────────────────────────────────────── */}
        {organizationId && section === 'beneficiaries' && (
          <>
            <div className="beneficiary-task-switch" role="group" aria-label="Beneficiary tasks">
              {([
                ['lookup', 'Find a member'],
                ['eligibility', 'Eligibility'],
                ['caregivers', 'Caregiver access'],
              ] as const).map(([task, label]) => (
                <button
                  key={task}
                  type="button"
                  className={`beneficiary-task-button${beneficiaryTask === task ? ' is-active' : ''}`}
                  aria-pressed={beneficiaryTask === task}
                  onClick={() => setBeneficiaryTask(task)}
                >
                  {label}
                </button>
              ))}
            </div>

            {beneficiaryTask === 'lookup' && (
              <>
            <div className="ops-card ops-beneficiary-card">
              <ActionForm
                title="Find a member’s service access"
                className="ops-form-beneficiary-lookup"
                submit="View member details"
                onSubmit={(data) => viewBeneficiary(str(data, 'membershipId'))}
              >
                <Select name="membershipId" label="Select Member">
                  {memberOptions}
                </Select>
              </ActionForm>
            </div>

            {eligibility && (
              <div className="ops-card ops-beneficiary-card" style={{ borderLeft: '4px solid #10b981' }}>
                <div className="ops-card-header">
                  <h3 className="ops-card-title">
                    <Icon name="check" />
                    <span>Eligibility Status</span>
                  </h3>
                  <span className="status-badge status-active">{eligibility.status}</span>
                </div>
                <p style={{ margin: 0, color: 'var(--admin-copy, #334155)', fontSize: '0.85rem' }}>
                  Review Due Date: <strong>{new Date(eligibility.reviewDueAt).toLocaleDateString()}</strong>
                </p>
              </div>
            )}
            {beneficiary && !eligibility && (
              <div className="ops-card ops-beneficiary-card ops-beneficiary-empty">
                No eligibility record is currently set for this member.
              </div>
            )}

            {caregivers.length > 0 && (
              <div className="ops-card ops-beneficiary-card">
                <div className="ops-card-header">
                  <h3 className="ops-card-title">
                    <Icon name="memberships" />
                    <span>Authorized Caregivers</span>
                  </h3>
                  <span className="ops-card-count">{caregivers.length}</span>
                </div>
                {caregivers.map((caregiver) => (
                  <div key={caregiver.id} className="proposal-card">
                    <div className="proposal-header">
                      <strong>Member: {caregiver.caregiverMembershipId}</strong>
                      <span className="status-badge status-active">{caregiver.status}</span>
                    </div>
                    <ActionForm
                      title="Review Caregiver Authorization"
                      submit="Save Review"
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
                      <Field name="notes" label="Review Reason" />
                    </ActionForm>
                  </div>
                ))}
              </div>
            )}
            {beneficiary && !caregivers.length && (
              <div className="ops-card ops-beneficiary-card ops-beneficiary-empty">
                No caregiver authorizations are recorded for this member.
              </div>
            )}
              </>
            )}

            {beneficiaryTask === 'eligibility' && (
              <div className="ops-card ops-beneficiary-card">
              <ActionForm
                title="Grant or Renew Eligibility"
                className="ops-form-beneficiary-eligibility"
                submit="Save Eligibility"
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
                <Select name="membershipId" label="Member">
                  {memberOptions}
                </Select>
                <Select name="eligibilityType" label="Eligibility Type">
                  {Object.values(BeneficiaryEligibilityType).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
                <Field name="reviewDueAt" label="Review Due Date & Time" type="datetime-local" />
                <Field name="quota" label="Monthly Request Quota" type="number" min={1} value={8} />
                <Field
                  name="categories"
                  label="Approved Categories (* for all, or comma-separated IDs)"
                  value="*"
                />
              </ActionForm>
              </div>
            )}

            {beneficiaryTask === 'caregivers' && (
              <div className="ops-card ops-beneficiary-card">
              <ActionForm
                title="Request Caregiver Authorization"
                submit="Request Authorization"
                onSubmit={(data) =>
                  save(`${base}/caregivers/authorize`, {
                    beneficiaryMembershipId: str(data, 'beneficiary'),
                    caregiverMembershipId: str(data, 'caregiver'),
                    relationshipType: str(data, 'relationship'),
                  })
                }
              >
                <Select name="beneficiary" label="Beneficiary Member">
                  {memberOptions}
                </Select>
                <Select name="caregiver" label="Caregiver Member">
                  {memberOptions}
                </Select>
                <Select name="relationship" label="Relationship Type">
                  {Object.values(CaregiverRelationshipType).map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              </ActionForm>
              </div>
            )}
          </>
        )}

        {/* ─────────────────────────────────────────────────────────────
            TAB 3: ZONES & VOLUNTEERS
        ───────────────────────────────────────────────────────────── */}
        {organizationId && section === 'zones' && (
          <>
            {/* VOLUNTEER LOOKUP & AVAILABILITY */}
            <div className="ops-card">
              <ActionForm
                title="Look Up Volunteer Profile"
                submit="Load Profile, Skills & Coverage"
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
                <Select name="membershipId" label="Select Volunteer Member">
                  {memberOptions}
                </Select>
              </ActionForm>
            </div>

            {volunteer && (
              <div className="ops-card" style={{ borderLeft: '4px solid #0052ff' }}>
                <div className="ops-card-header">
                  <h3 className="ops-card-title">
                    <Icon name="memberships" />
                    <span>Volunteer Information</span>
                  </h3>
                  <span
                    className={`status-badge ${
                      volunteer.availability.isAvailableImmediate
                        ? 'status-active'
                        : 'status-draft'
                    }`}
                  >
                    {volunteer.availability.isAvailableImmediate
                      ? '● Immediate Dispatch'
                      : 'Scheduled Only'}
                  </span>
                </div>

                <div className="profile-grid">
                  <div className="profile-item">
                    <span className="profile-item-label">Travel Radius</span>
                    <span className="profile-item-val">
                      🚗 {volunteer.availability.maxTravelRadiusKm} km
                    </span>
                  </div>
                  <div className="profile-item">
                    <span className="profile-item-label">Preferred Wards</span>
                    <span className="profile-item-val">
                      {volunteer.availability.preferredWardNumbers.length > 0
                        ? volunteer.availability.preferredWardNumbers.join(', ')
                        : 'Any ward'}
                    </span>
                  </div>
                  <div className="profile-item">
                    <span className="profile-item-label">Verified Skills</span>
                    <span className="profile-item-val">
                      {volunteer.skills.length > 0
                        ? volunteer.skills.map((s) => s.skillCode).join(', ')
                        : 'None registered'}
                    </span>
                  </div>
                  <div className="profile-item">
                    <span className="profile-item-label">Assigned Zones</span>
                    <span className="profile-item-val">
                      {volunteer.zones.length > 0
                        ? volunteer.zones.map((z) => z.zone?.name ?? z.zoneId).join(', ')
                        : 'None assigned'}
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <ActionForm
                    key={volunteer.id}
                    title="Update Volunteer Availability"
                    submit="Save Availability"
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
                    <label className="ops-field">
                      Available immediately
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
              </div>
            )}

            {/* OPERATIONAL ZONES TABLE */}
            <div className="ops-card">
              <div className="ops-card-header">
                <h3 className="ops-card-title">
                  <Icon name="overview" />
                  <span>Operational Zones</span>
                </h3>
                <span className="ops-card-count">{zones.length} zones</span>
              </div>

              <p className="help-text" style={{ margin: '0 0 16px' }}>
                Nearby shows only explicitly enabled areas to approved community members. Review area
                names and ward coverage before publishing.
              </p>

              {!zones.length && !loading && !error ? (
                <div className="empty-state">No zones defined yet.</div>
              ) : (
                <div className="table-container" style={{ margin: 0 }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th style={{ width: '28%' }}>Zone Name</th>
                        <th style={{ width: '18%' }}>Code</th>
                        <th style={{ width: '22%' }}>Wards</th>
                        <th style={{ width: '14%' }}>Nearby View</th>
                        <th style={{ width: '18%', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zones.map((zone) => (
                        <tr key={zone.id}>
                          <td>
                            <strong style={{ color: 'var(--admin-ink, #0f172a)' }}>{zone.name}</strong>
                          </td>
                          <td>
                            <span className="code-chip font-mono">{zone.code}</span>
                          </td>
                          <td>
                            <div className="ward-badge-group">
                              {zone.wardNumbers.map((w) => (
                                <span key={w} className="ward-badge">
                                  Ward {w}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`visibility-badge ${
                                zone.nearbyVisible ? 'visibility-shown' : 'visibility-hidden'
                              }`}
                            >
                              {zone.nearbyVisible ? '👁️ Shown' : '🔒 Hidden'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="service-actions-row">
                              <button
                                type="button"
                                className="btn-service-action btn-action-edit"
                                onClick={() =>
                                  void run(async () =>
                                    setRecordDetails(
                                      await api<Record<string, unknown>>(`${base}/zones/${zone.id}`),
                                    ),
                                  )
                                }
                              >
                                Details
                              </button>
                              <button
                                type="button"
                                className={`btn-service-action ${
                                  zone.isActive ? 'btn-action-deactivate' : 'btn-action-activate'
                                }`}
                                onClick={() =>
                                  void save(
                                    `${base}/zones/${zone.id}`,
                                    { isActive: !zone.isActive },
                                    'PUT',
                                  )
                                }
                              >
                                {zone.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                              <button
                                type="button"
                                className="btn-service-action btn-action-edit"
                                onClick={() =>
                                  void save(
                                    `/api/organizations/${organizationId}/community/nearby/areas/${zone.id}`,
                                    { visible: !zone.nearbyVisible },
                                    'PUT',
                                  )
                                }
                              >
                                {zone.nearbyVisible ? 'Hide' : 'Show'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* CREATE ZONE FORM */}
            <div className="ops-card">
              <ActionForm
                title="Create New Operational Zone"
                submit="+ Create Zone"
                onSubmit={(data) =>
                  save(`${base}/zones`, {
                    code: str(data, 'code').toUpperCase(),
                    name: str(data, 'name'),
                    wardNumbers: list(data, 'wards'),
                  })
                }
              >
                <Field name="code" label="Zone Code (e.g. ZN_NORTH_01)" maxLength={50} />
                <Field name="name" label="Zone Name" maxLength={100} />
                <Field name="wards" label="Ward Numbers (comma-separated, e.g. 1, 2, 3)" />
              </ActionForm>
            </div>

            {/* SET AREA MAP CENTRE */}
            <div className="ops-card">
              <ActionForm
                title="Set Approximate Area Map Centre"
                submit="Save Area Centre"
                onSubmit={(data) =>
                  save(
                    `${base}/zones/${str(data, 'zone')}`,
                    {
                      centerLat: number(data, 'latitude'),
                      centerLng: number(data, 'longitude'),
                      radiusKm: number(data, 'radius'),
                    },
                    'PUT',
                  )
                }
              >
                <Select name="zone" label="Select Area / Zone">
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </Select>
                <Field
                  name="latitude"
                  label="Area Centre Latitude (8–38)"
                  type="number"
                  min={8}
                  step="any"
                />
                <Field
                  name="longitude"
                  label="Area Centre Longitude (68–98)"
                  type="number"
                  min={68}
                  step="any"
                />
                <Field
                  name="radius"
                  label="Area Radius in km (0.5–50)"
                  type="number"
                  min={0.5}
                  value={5}
                />
              </ActionForm>
            </div>

            {/* ASSIGN VOLUNTEER TO ZONE */}
            <div className="ops-card">
              <ActionForm
                title="Assign Volunteer to Zone"
                submit="Assign Volunteer"
                onSubmit={(data) =>
                  save(`${base}/zones/${str(data, 'zone')}/volunteers`, {
                    membershipId: str(data, 'membershipId'),
                  })
                }
              >
                <Select name="zone" label="Select Zone">
                  {zones
                    .filter((z) => z.isActive)
                    .map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                </Select>
                <Select name="membershipId" label="Volunteer Member">
                  {memberOptions}
                </Select>
              </ActionForm>
            </div>

            {/* VERIFY VOLUNTEER SKILL */}
            <div className="ops-card">
              <ActionForm
                title="Verify Volunteer Skill"
                submit="Save Skill Review"
                onSubmit={(data) =>
                  save(`${base}/volunteers/skills/verify`, {
                    membershipId: str(data, 'membershipId'),
                    skillCode: str(data, 'skillCode'),
                    status: str(data, 'status'),
                    verificationNotes: str(data, 'notes'),
                  })
                }
              >
                <Select name="membershipId" label="Volunteer Member">
                  {memberOptions}
                </Select>
                <Field name="skillCode" label="Skill Code (e.g. FIRST_AID)" />
                <Select name="status" label="Decision">
                  <option>VERIFIED</option>
                  <option>REJECTED</option>
                </Select>
                <Field name="notes" label="Verification Notes" required={false} />
              </ActionForm>
            </div>
          </>
        )}
      </fieldset>
    </section>
  );
}
