'use client';
import React, { useEffect, useRef, useState } from 'react';
import type { Action } from '@/lib/admin-types';
import { CoordinatorRequests } from '@/components/coordinator-requests';
import { ServiceCatalogue } from '@/components/service-catalogue';
import { api, ApiError, backend } from '@/lib/api';

type Tab =
  | 'overview'
  | 'organizations'
  | 'memberships'
  | 'requests'
  | 'catalogue'
  | 'restrictions'
  | 'audit';
type Grant = { id: string; role: string; status: string };
type Membership = {
  id: string;
  userId: string;
  organizationId: string;
  status: string;
  membershipNumber?: string | null;
  user?: { phoneE164: string };
  roleGrants: Grant[];
  rejectionReason?: string | null;
};
type Profile = {
  id: string;
  phoneE164: string;
  status: string;
  memberships: { organizationId: string; status: string; roles: string[] }[];
};
type Organization = {
  id: string;
  code: string;
  name: string;
  district: string;
  type: string;
  status: string;
  branding?: { appDisplayName: string; primaryColor: string; secondaryColor: string };
};
type Restriction = {
  id: string;
  userId: string;
  user?: { phoneE164: string };
  restrictionType: string;
  reasonCode: string;
  status: string;
};
type Audit = {
  id: string;
  eventType: string;
  actorId?: string;
  organizationId?: string;
  createdAt: string;
  payload: Record<string, unknown>;
};
type Document = { id: string; documentType: string; storageKey: string; reviewStatus: string };
type Metrics = {
  totalUsers: number;
  totalOrganizations: number;
  activeOrganizations: number;
  totalUniversalWallets: number;
  totalBalanceCredits: number;
  pendingMemberships: number;
};
type View = {
  memberships: Membership[];
  restrictions: Restriction[];
  events: Audit[];
  metrics: Metrics | null;
  total: number;
};
const empty = (): View => ({
  memberships: [],
  restrictions: [],
  events: [],
  metrics: null,
  total: 0,
});
const OPERATIONS = ['VOLUNTEER', 'BENEFICIARY', 'CAREGIVER', 'MERCHANT'];
const STAFF = ['COORDINATOR', 'MUNICIPALITY_ADMIN', 'SUPER_ADMIN'];
const approved = (profile: Profile) =>
  profile.memberships.filter((member) => member.status === 'APPROVED');
const globalAdmin = (profile: Profile) =>
  approved(profile).some((member) => member.roles.includes('SUPER_ADMIN'));
const staffMemberships = (profile: Profile) =>
  approved(profile).filter((member) => member.roles.some((role) => STAFF.includes(role)));
const label = (value: string) =>
  value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (char) => char.toUpperCase());
function Badge({ value }: { value: string }) {
  const tone = ['ACTIVE', 'APPROVED', 'RESOLVED'].includes(value)
    ? 'active'
    : ['SUSPENDED', 'REJECTED', 'ARCHIVED'].includes(value)
      ? 'suspended'
      : 'pending';
  return <span className={`badge badge-${tone}`}>{label(value)}</span>;
}
function SignIn({ onSignedIn }: { onSignedIn: (profile: Profile) => void }) {
  const [phone, setPhone] = useState(''),
    [code, setCode] = useState(''),
    [error, setError] = useState('');
  const [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [development, setDevelopment] = useState(false);
  return (
    <main className="login-shell">
      <section className="glass-panel login-panel">
        <div className="brand-icon">ITB</div>
        <h1>Administration sign in</h1>
        <p>
          Use your registered mobile number. Your current organization permissions determine
          dashboard access.
        </p>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError('');
            const normalized = phone.startsWith('+') ? phone : `+91${phone}`;
            try {
              if (!sent) {
                const result = await api<{ devOtp?: string }>('/api/session', 'POST', {
                  action: 'request-code',
                  phone: normalized,
                });
                setCode(result.devOtp ?? '');
                setDevelopment(Boolean(result.devOtp));
                setSent(true);
              } else
                onSignedIn(
                  await api<Profile>('/api/session', 'POST', {
                    action: 'verify',
                    phone: normalized,
                    code,
                  }),
                );
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Unable to sign in');
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Mobile number
            <input
              className="form-input"
              autoComplete="tel"
              type="tel"
              required
              pattern="(\+[1-9][0-9]{7,14}|[6-9][0-9]{9})"
              value={phone}
              disabled={busy || sent}
              onChange={(event) => setPhone(event.target.value.trim())}
            />
          </label>
          {sent && (
            <label>
              Verification code
              <input
                className="form-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                pattern="[0-9]{6}"
                value={code}
                disabled={busy}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
          )}
          {development && (
            <p className="help-text">
              Development code supplied by the local server. SMS delivery is not enabled here.
            </p>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Please wait…' : sent ? 'Verify and sign in' : 'Send code'}
          </button>
          {sent && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => {
                setSent(false);
                setCode('');
                setDevelopment(false);
                setError('');
              }}
            >
              Change number or request another code
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
function ActionDialog({
  action,
  onClose,
  onSaved,
  onExpired,
  setPending,
}: {
  action: Action;
  onClose: () => void;
  onSaved: (result: unknown) => void;
  onExpired: () => void;
  setPending: (value: boolean) => void;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  return (
    <div className="modal-backdrop">
      <section
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) onClose();
        }}
      >
        <h2 id="action-title" tabIndex={-1} ref={title}>
          {action.title}
        </h2>
        {action.description && <p>{action.description}</p>}
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const values = Object.fromEntries(
              new FormData(event.currentTarget).entries(),
            ) as Record<string, string>;
            setBusy(true);
            setPending(true);
            setError('');
            try {
              const result = await action.submit(values);
              onSaved(result);
            } catch (cause) {
              if (cause instanceof ApiError && cause.status === 401) onExpired();
              else setError(cause instanceof Error ? cause.message : 'Unable to save');
            } finally {
              setBusy(false);
              setPending(false);
            }
          }}
        >
          <fieldset disabled={busy} className="stack">
            {action.fields.map((field) => (
              <label key={field.key}>
                {field.label}
                {field.type === 'checkbox' ? (
                  <input
                    type="checkbox"
                    name={field.key}
                    required={!field.optional}
                    defaultChecked={field.value === 'true'}
                  />
                ) : field.options || field.choices ? (
                  <select
                    name={field.key}
                    className="form-input"
                    defaultValue={field.value ?? field.choices?.[0]?.value ?? field.options?.[0]}
                    required={!field.optional}
                  >
                    {field.choices
                      ? field.choices.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))
                      : field.options?.map((value) => (
                          <option key={value} value={value}>
                            {label(value)}
                          </option>
                        ))}
                  </select>
                ) : (
                  <input
                    name={field.key}
                    className="form-input"
                    type={field.type ?? 'text'}
                    required={!field.optional}
                    defaultValue={field.value ?? ''}
                    pattern={field.pattern}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    minLength={field.minLength}
                    maxLength={field.maxLength}
                  />
                )}
              </label>
            ))}
          </fieldset>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <div className="action-row">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
export default function AdminDashboard(): React.JSX.Element {
  const [profile, setProfile] = useState<Profile | null>(null),
    [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<Tab>('overview'),
    [tenant, setTenant] = useState('GLOBAL');
  const [organizations, setOrganizations] = useState<Organization[]>([]),
    [view, setView] = useState<View>(empty);
  const [offset, setOffset] = useState(0),
    [status, setStatus] = useState(''),
    [eventType, setEventType] = useState(''),
    [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [action, setAction] = useState<Action | null>(null),
    [detail, setDetail] = useState<{ membership: Membership; documents: Document[] } | null>(null);
  const epoch = useRef(0);
  const isGlobal = profile ? globalAdmin(profile) : false;
  const localRoles = profile
    ? (approved(profile).find((member) => member.organizationId === tenant)?.roles ?? [])
    : [];
  const canManageRoles = isGlobal || localRoles.includes('MUNICIPALITY_ADMIN');
  const initialRoles = [
    ...OPERATIONS,
    ...(canManageRoles ? ['COORDINATOR'] : []),
    ...(isGlobal ? ['MUNICIPALITY_ADMIN'] : []),
  ];
  const tabs: { id: Tab; text: string }[] = isGlobal
    ? [
        { id: 'overview', text: 'Overview' },
        { id: 'organizations', text: 'Organizations' },
        { id: 'memberships', text: 'Memberships' },
        { id: 'requests', text: 'Requests & matching' },
        { id: 'catalogue', text: 'Service catalogue' },
        { id: 'restrictions', text: 'Global restrictions' },
        { id: 'audit', text: 'Audit trail' },
      ]
    : [
        { id: 'organizations', text: 'Organizations' },
        { id: 'memberships', text: 'Memberships' },
        { id: 'requests', text: 'Requests & matching' },
        { id: 'catalogue', text: 'Service catalogue' },
      ];
  const selectedOrg = organizations.find((organization) => organization.id === tenant);
  function signedIn(next: Profile) {
    epoch.current++;
    setProfile(next);
    setView(empty());
    setDetail(null);
    setError('');
    setNotice('');
    const central = globalAdmin(next);
    setTenant((previous) =>
      central || staffMemberships(next).some((member) => member.organizationId === previous)
        ? previous
        : (staffMemberships(next)[0]?.organizationId ?? 'GLOBAL'),
    );
    if (!central)
      setTab((current) =>
        ['organizations', 'memberships', 'requests', 'catalogue'].includes(current)
          ? current
          : 'requests',
      );
  }
  function expired() {
    epoch.current++;
    setProfile(null);
    setOrganizations([]);
    setView(empty());
    setDetail(null);
    setAction(null);
    setTenant('GLOBAL');
    setTab('overview');
    setNotice('');
    setError('');
  }
  useEffect(() => {
    const controller = new AbortController();
    api<Profile>('/api/session', 'GET', undefined, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) signedIn(next);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && (!(cause instanceof ApiError) || cause.status !== 401))
          setError(cause instanceof Error ? cause.message : 'Unable to load the session');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBooting(false);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!profile) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setView(empty());
    setDetail(null);
    async function load() {
      const result = await backend<{ data: Organization[] }>(
        '/v1/organizations',
        'GET',
        undefined,
        controller.signal,
      );
      const allowed = new Set(staffMemberships(profile!).map((member) => member.organizationId));
      if (controller.signal.aborted) return;
      setOrganizations(
        isGlobal ? result.data : result.data.filter((organization) => allowed.has(organization.id)),
      );
      let next = empty();
      const query = new URLSearchParams({ limit: '20', offset: String(offset) });
      if (tab === 'overview' && isGlobal)
        next.metrics = await backend<Metrics>(
          '/admin/overview',
          'GET',
          undefined,
          controller.signal,
        );
      if (tab === 'memberships' && tenant !== 'GLOBAL') {
        if (status) query.set('status', status);
        next = {
          ...next,
          ...(await backend<{ memberships: Membership[]; total: number }>(
            `/organizations/${tenant}/memberships?${query}`,
            'GET',
            undefined,
            controller.signal,
          )),
        };
      }
      if (tab === 'restrictions' && isGlobal)
        next.restrictions = await backend<Restriction[]>(
          `/admin/restrictions${status ? `?status=${status}` : ''}`,
          'GET',
          undefined,
          controller.signal,
        );
      if (tab === 'audit' && isGlobal) {
        if (tenant !== 'GLOBAL') query.set('organizationId', tenant);
        if (eventType) query.set('eventType', eventType);
        next = {
          ...next,
          ...(await backend<{ events: Audit[]; total: number }>(
            `/admin/audit-logs?${query}`,
            'GET',
            undefined,
            controller.signal,
          )),
        };
      }
      if (!controller.signal.aborted) setView(next);
    }
    load()
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 401) expired();
        else setError(cause instanceof Error ? cause.message : 'Unable to load records');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [profile, tab, tenant, offset, status, eventType, revision, isGlobal]);
  function changeScope(value: string) {
    setTenant(value);
    setOffset(0);
    setDetail(null);
    setView(empty());
    setNotice('');
  }
  function changeTab(value: Tab) {
    setTab(value);
    setStatus('');
    setOffset(0);
    setDetail(null);
    setView(empty());
    setNotice('');
  }
  function openAction(next: Action) {
    setAction(next);
    setError('');
    setNotice('');
  }
  async function review(member: Membership) {
    const current = epoch.current;
    setPending(true);
    setError('');
    try {
      const [membership, documents] = await Promise.all([
        backend<Membership>(`/organizations/${member.organizationId}/memberships/${member.id}`),
        backend<Document[]>(
          `/organizations/${member.organizationId}/memberships/${member.id}/documents`,
        ),
      ]);
      if (current === epoch.current) setDetail({ membership, documents });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) expired();
      else setError(cause instanceof Error ? cause.message : 'Unable to open membership');
    } finally {
      setPending(false);
    }
  }
  const membershipBase = detail
    ? `/organizations/${detail.membership.organizationId}/memberships/${detail.membership.id}`
    : '';
  if (booting)
    return (
      <main className="login-shell">
        <p role="status">Checking your session…</p>
      </main>
    );
  if (!profile)
    return (
      <>
        <SignIn onSignedIn={signedIn} />
        {error && (
          <p className="session-error" role="alert">
            {error}
          </p>
        )}
      </>
    );
  return (
    <div className="app-container">
      <aside className="sidebar" inert={action !== null}>
        <div className="brand-badge">
          <div className="brand-icon">ITB</div>
          <div>
            <div className="brand-title">Indian Time Bank</div>
            <div className="brand-subtitle">Administration</div>
          </div>
        </div>
        <nav className="nav-group" aria-label="Dashboard">
          {tabs.map((item) => (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              className={`nav-item ${tab === item.id ? 'active' : ''}`}
              aria-current={tab === item.id ? 'page' : undefined}
              disabled={pending}
              onClick={() => changeTab(item.id)}
            >
              {item.text}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <p>{profile.phoneE164}</p>
          <p>{isGlobal ? 'Central administrator' : 'Organization staff'}</p>
          <button
            className="btn btn-secondary"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await api('/api/session', 'DELETE');
                expired();
              } catch (cause) {
                if (cause instanceof ApiError && cause.status === 401) expired();
                else setError(cause instanceof Error ? cause.message : 'Unable to sign out');
              } finally {
                setPending(false);
              }
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="main-wrapper" inert={action !== null}>
        <header className="top-bar">
          <label className="scope-label">
            Organization scope
            <select
              id="tenant-select"
              className="form-input"
              value={tab === 'overview' || tab === 'restrictions' ? 'GLOBAL' : tenant}
              disabled={pending || tab === 'overview' || tab === 'restrictions'}
              onChange={(event) => changeScope(event.target.value)}
            >
              {isGlobal && <option value="GLOBAL">All organizations</option>}
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name} ({organization.code})
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-secondary"
            disabled={pending || loading}
            onClick={async () => {
              setPending(true);
              setNotice('');
              try {
                signedIn(await api<Profile>('/api/session'));
                setRevision((value) => value + 1);
              } catch (cause) {
                if (cause instanceof ApiError && [401, 403].includes(cause.status)) expired();
                else setError(cause instanceof Error ? cause.message : 'Unable to refresh');
              } finally {
                setPending(false);
              }
            }}
          >
            Refresh
          </button>
        </header>
        <main className="content-body" aria-busy={loading || pending}>
          <h1>{tabs.find((item) => item.id === tab)?.text}</h1>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="success-message" role="status">
              {notice}
            </p>
          )}
          {loading && <p role="status">Loading live records…</p>}
          {tab === 'overview' && (
            <>
              <p className="section-description">Platform-wide totals across all organizations.</p>
              {view.metrics && (
                <div className="metric-grid">
                  {[
                    ['Registered users', view.metrics.totalUsers],
                    ['Organizations', view.metrics.totalOrganizations],
                    ['Active organizations', view.metrics.activeOrganizations],
                    ['Time wallets', view.metrics.totalUniversalWallets],
                    ['Time credits', view.metrics.totalBalanceCredits],
                    ['Pending memberships', view.metrics.pendingMemberships],
                  ].map(([name, value]) => (
                    <section className="glass-panel metric-card" key={name}>
                      <div className="metric-label">{name}</div>
                      <div className="metric-value">{value}</div>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
          {tab === 'requests' &&
            (tenant === 'GLOBAL' ? (
              <p className="empty-state">Select an organization to review requests and matching.</p>
            ) : (
              <CoordinatorRequests
                key={tenant}
                organizationId={tenant}
                revision={revision}
                pending={pending}
                openAction={openAction}
                onExpired={expired}
              />
            ))}
          {tab === 'catalogue' && (
            <ServiceCatalogue
              key={tenant}
              organizationId={tenant === 'GLOBAL' ? null : tenant}
              isGlobal={isGlobal}
              revision={revision}
              pending={pending}
              openAction={openAction}
              onExpired={expired}
            />
          )}
          {tab === 'organizations' && (
            <>
              <div className="section-heading">
                <p>Organizations and their current branding.</p>
                {isGlobal && (
                  <button
                    className="btn btn-primary"
                    disabled={pending}
                    onClick={() =>
                      openAction({
                        title: 'Create organization',
                        fields: [
                          { key: 'code', label: 'Organization code', pattern: '[A-Z0-9_-]{2,50}' },
                          { key: 'name', label: 'Organization name' },
                          { key: 'district', label: 'District' },
                          {
                            key: 'type',
                            label: 'Organization type',
                            options: [
                              'MUNICIPALITY',
                              'MUNICIPAL_CORPORATION',
                              'GRAMA_PANCHAYAT',
                              'SPECIAL_ADMINISTRATIVE_ZONE',
                            ],
                          },
                          { key: 'appDisplayName', label: 'App display name' },
                          {
                            key: 'primaryColor',
                            label: 'Primary color',
                            type: 'color',
                            value: '#0D5C75',
                          },
                          {
                            key: 'secondaryColor',
                            label: 'Secondary color',
                            type: 'color',
                            value: '#F59E0B',
                          },
                        ],
                        submit: (values) =>
                          backend('/v1/organizations', 'POST', {
                            code: values['code'],
                            name: values['name'],
                            district: values['district'],
                            type: values['type'],
                            branding: {
                              appDisplayName: values['appDisplayName'],
                              primaryColor: values['primaryColor'],
                              secondaryColor: values['secondaryColor'],
                            },
                          }),
                      })
                    }
                  >
                    Create organization
                  </button>
                )}
              </div>
              <div className="table-container glass-panel">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Organization</th>
                      <th>District</th>
                      <th>Status</th>
                      <th>Branding</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {organizations
                      .filter((organization) => tenant === 'GLOBAL' || organization.id === tenant)
                      .map((organization) => (
                        <tr key={organization.id}>
                          <td>
                            {organization.name}
                            <div className="help-text">{organization.code}</div>
                          </td>
                          <td>
                            {organization.district}
                            <div className="help-text">{label(organization.type)}</div>
                          </td>
                          <td>
                            <Badge value={organization.status} />
                          </td>
                          <td>
                            {organization.branding?.appDisplayName ?? 'Not configured'}
                            <div>
                              {organization.branding?.primaryColor} /{' '}
                              {organization.branding?.secondaryColor}
                            </div>
                          </td>
                          <td>
                            <div className="action-row">
                              {isGlobal && (
                                <button
                                  className="btn btn-secondary"
                                  disabled={pending}
                                  onClick={() =>
                                    openAction({
                                      title: `Change status: ${organization.name}`,
                                      fields: [
                                        {
                                          key: 'status',
                                          label: 'Status',
                                          options: ['ACTIVE', 'DRAFT', 'SUSPENDED', 'ARCHIVED'],
                                          value: organization.status,
                                        },
                                        { key: 'reason', label: 'Reason' },
                                      ],
                                      submit: (values) =>
                                        backend(
                                          `/admin/organizations/${organization.id}/status`,
                                          'PATCH',
                                          values,
                                        ),
                                    })
                                  }
                                >
                                  Change status
                                </button>
                              )}
                              {(isGlobal ||
                                (organization.id === tenant &&
                                  localRoles.includes('MUNICIPALITY_ADMIN'))) && (
                                <button
                                  className="btn btn-secondary"
                                  disabled={pending}
                                  onClick={() =>
                                    openAction({
                                      title: `Edit branding: ${organization.name}`,
                                      fields: [
                                        {
                                          key: 'appDisplayName',
                                          label: 'App display name',
                                          value:
                                            organization.branding?.appDisplayName ??
                                            organization.name,
                                        },
                                        {
                                          key: 'primaryColor',
                                          label: 'Primary color',
                                          type: 'color',
                                          value: organization.branding?.primaryColor ?? '#0D5C75',
                                        },
                                        {
                                          key: 'secondaryColor',
                                          label: 'Secondary color',
                                          type: 'color',
                                          value: organization.branding?.secondaryColor ?? '#F59E0B',
                                        },
                                      ],
                                      submit: (values) =>
                                        backend(
                                          `/v1/organizations/${organization.id}/branding`,
                                          'PUT',
                                          values,
                                        ),
                                    })
                                  }
                                >
                                  Edit branding
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === 'memberships' && (
            <>
              {tenant === 'GLOBAL' ? (
                <p className="empty-state">Select an organization to review its memberships.</p>
              ) : (
                <>
                  <div className="section-heading">
                    <p>Memberships in {selectedOrg?.name ?? 'the selected organization'}.</p>
                    <label>
                      Membership status
                      <select
                        className="form-input"
                        disabled={pending}
                        value={status}
                        onChange={(event) => {
                          setStatus(event.target.value);
                          setOffset(0);
                        }}
                      >
                        <option value="">All statuses</option>
                        {['APPLIED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'].map(
                          (value) => (
                            <option key={value} value={value}>
                              {label(value)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                  <div className="table-container glass-panel">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th>Status</th>
                          <th>Membership number</th>
                          <th>Active roles</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.memberships.map((member) => (
                          <tr key={member.id}>
                            <td>
                              {member.user?.phoneE164 ?? member.userId}
                              <div className="help-text">{member.userId}</div>
                            </td>
                            <td>
                              <Badge value={member.status} />
                            </td>
                            <td>{member.membershipNumber ?? 'Awaiting approval'}</td>
                            <td>
                              {member.roleGrants
                                .filter((grant) => grant.status === 'ACTIVE')
                                .map((grant) => label(grant.role))
                                .join(', ') || 'None'}
                            </td>
                            <td>
                              <button
                                className="btn btn-secondary"
                                disabled={pending}
                                onClick={() => review(member)}
                              >
                                Review membership
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!loading && !error && view.total === 0 && (
                    <p className="empty-state">No memberships match this scope.</p>
                  )}
                </>
              )}
              {detail && (
                <section className="glass-panel detail-panel">
                  <div className="section-heading">
                    <h2>Membership review</h2>
                    <button
                      className="btn btn-secondary"
                      disabled={pending}
                      onClick={() => setDetail(null)}
                    >
                      Close review
                    </button>
                  </div>
                  <p>{detail.membership.user?.phoneE164 ?? detail.membership.userId}</p>
                  <p>
                    User ID: <code>{detail.membership.userId}</code>
                  </p>
                  <p>
                    <Badge value={detail.membership.status} /> {detail.membership.membershipNumber}
                  </p>
                  {detail.membership.rejectionReason && (
                    <p>Rejection reason: {detail.membership.rejectionReason}</p>
                  )}
                  {['APPLIED', 'PENDING_REVIEW'].includes(detail.membership.status) && (
                    <div className="action-row">
                      <button
                        className="btn btn-success"
                        onClick={() =>
                          openAction({
                            title: 'Approve membership',
                            description:
                              'Choose the initial role after reviewing the application and supporting documents.',
                            fields: [
                              { key: 'initialRole', label: 'Initial role', options: initialRoles },
                              { key: 'notes', label: 'Approval notes', optional: true },
                            ],
                            submit: (values) =>
                              backend(`${membershipBase}/approve`, 'POST', values),
                          })
                        }
                      >
                        Approve membership
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() =>
                          openAction({
                            title: 'Reject membership',
                            fields: [{ key: 'reason', label: 'Rejection reason' }],
                            submit: (values) => backend(`${membershipBase}/reject`, 'POST', values),
                          })
                        }
                      >
                        Reject membership
                      </button>
                    </div>
                  )}
                  <h3>Supporting documents</h3>
                  {detail.documents.length === 0 && <p>No supporting documents submitted.</p>}
                  {detail.documents.map((document) => (
                    <div className="document-row" key={document.id}>
                      <div>
                        {label(document.documentType)} <Badge value={document.reviewStatus} />
                        <div className="help-text">Storage reference: {document.storageKey}</div>
                      </div>
                      <button
                        className="btn btn-secondary"
                        onClick={() =>
                          openAction({
                            title: 'Review document',
                            fields: [
                              {
                                key: 'status',
                                label: 'Review decision',
                                options: ['APPROVED', 'REJECTED'],
                              },
                              { key: 'notes', label: 'Review notes', optional: true },
                            ],
                            submit: (values) =>
                              backend(
                                `/organizations/${detail.membership.organizationId}/memberships/documents/${document.id}/review`,
                                'PATCH',
                                values,
                              ),
                          })
                        }
                      >
                        Review document
                      </button>
                    </div>
                  ))}
                  <h3>Active roles</h3>
                  {detail.membership.roleGrants
                    .filter((grant) => grant.status === 'ACTIVE')
                    .map((grant) => (
                      <div className="document-row" key={grant.id}>
                        {label(grant.role)}
                        {canManageRoles &&
                          grant.role !== 'SUPER_ADMIN' &&
                          (isGlobal || grant.role !== 'MUNICIPALITY_ADMIN') && (
                            <button
                              className="btn btn-danger"
                              onClick={() =>
                                openAction({
                                  title: `Revoke ${label(grant.role)} role`,
                                  fields: [{ key: 'reason', label: 'Revocation reason' }],
                                  submit: (values) =>
                                    backend(
                                      `${membershipBase}/roles/${grant.id}`,
                                      'DELETE',
                                      values,
                                    ),
                                })
                              }
                            >
                              Revoke {label(grant.role)}
                            </button>
                          )}
                      </div>
                    ))}
                  {canManageRoles && detail.membership.status === 'APPROVED' && (
                    <button
                      className="btn btn-secondary"
                      onClick={() =>
                        openAction({
                          title: 'Grant organization role',
                          fields: [{ key: 'role', label: 'Role', options: initialRoles }],
                          submit: (values) => backend(`${membershipBase}/roles`, 'POST', values),
                        })
                      }
                    >
                      Grant role
                    </button>
                  )}
                </section>
              )}
            </>
          )}
          {tab === 'restrictions' && (
            <>
              <div className="section-heading">
                <p>Restrictions apply across the entire platform.</p>
                <button
                  className="btn btn-primary"
                  disabled={pending}
                  onClick={() =>
                    openAction({
                      title: 'Impose account restriction',
                      fields: [
                        { key: 'userId', label: 'Target user ID', pattern: '[0-9a-fA-F-]{36}' },
                        {
                          key: 'restrictionType',
                          label: 'Restriction type',
                          options: [
                            'TEMPORARY_SUSPENSION',
                            'PERMANENT_BAN',
                            'DUPLICATE_FREEZE',
                            'FRAUD_INVESTIGATION_HOLD',
                          ],
                        },
                        { key: 'reasonCode', label: 'Reason code' },
                      ],
                      submit: (values) => backend('/admin/restrictions', 'POST', values),
                    })
                  }
                >
                  Impose restriction
                </button>
              </div>
              <label>
                Restriction status
                <select
                  className="form-input compact-filter"
                  value={status}
                  disabled={pending}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
              </label>
              <div className="table-container glass-panel">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Target account</th>
                      <th>Restriction</th>
                      <th>Reason</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.restrictions.map((restriction) => (
                      <tr key={restriction.id}>
                        <td>
                          {restriction.user?.phoneE164 ?? restriction.userId}
                          <div className="help-text">{restriction.userId}</div>
                        </td>
                        <td>{label(restriction.restrictionType)}</td>
                        <td>{restriction.reasonCode}</td>
                        <td>
                          <Badge value={restriction.status} />
                        </td>
                        <td>
                          {restriction.status === 'ACTIVE' && (
                            <button
                              className="btn btn-secondary"
                              disabled={pending}
                              onClick={() =>
                                openAction({
                                  title: 'Resolve account restriction',
                                  fields: [{ key: 'resolutionNotes', label: 'Resolution notes' }],
                                  submit: (values) =>
                                    backend(
                                      `/admin/restrictions/${restriction.id}/resolve`,
                                      'POST',
                                      values,
                                    ),
                                })
                              }
                            >
                              Resolve restriction
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!loading && !error && view.restrictions.length === 0 && (
                <p className="empty-state">No restrictions match this filter.</p>
              )}
            </>
          )}
          {tab === 'audit' && (
            <>
              <p className="section-description">
                Server-recorded events{' '}
                {tenant === 'GLOBAL'
                  ? 'across all organizations'
                  : `for ${selectedOrg?.name ?? 'the selected organization'}`}
                .
              </p>
              <label>
                Event type
                <input
                  className="form-input compact-filter"
                  value={eventType}
                  placeholder="e.g. MEMBERSHIP_APPROVED"
                  disabled={pending}
                  onChange={(event) => {
                    setEventType(event.target.value.trim().toUpperCase());
                    setOffset(0);
                  }}
                />
              </label>
              <div className="table-container glass-panel">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Actor</th>
                      <th>Organization</th>
                      <th>Time</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.events.map((event) => (
                      <tr key={event.id}>
                        <td>{event.eventType}</td>
                        <td>
                          <code>{event.actorId ?? 'System'}</code>
                        </td>
                        <td>
                          {organizations.find(
                            (organization) => organization.id === event.organizationId,
                          )?.name ??
                            event.organizationId ??
                            'Platform-wide'}
                        </td>
                        <td>{new Date(event.createdAt).toLocaleString()}</td>
                        <td>
                          <details>
                            <summary>View details</summary>
                            <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!loading && !error && view.total === 0 && (
                <p className="empty-state">No events match this scope and filter.</p>
              )}
            </>
          )}
          {(tab === 'audit' || (tab === 'memberships' && tenant !== 'GLOBAL')) && (
            <div className="pagination">
              <span>
                {view.total} records · Page {Math.floor(offset / 20) + 1}
              </span>
              <button
                className="btn btn-secondary"
                disabled={loading || pending || offset === 0}
                onClick={() => setOffset((value) => Math.max(0, value - 20))}
              >
                Previous
              </button>
              <button
                className="btn btn-secondary"
                disabled={loading || pending || offset + 20 >= view.total}
                onClick={() => setOffset((value) => value + 20)}
              >
                Next
              </button>
            </div>
          )}
        </main>
      </div>
      {action && (
        <ActionDialog
          action={action}
          onClose={() => setAction(null)}
          onExpired={expired}
          setPending={setPending}
          onSaved={(result) => {
            setAction(null);
            setDetail(null);
            setNotice(action.successMessage?.(result) ?? 'Saved on the server.');
            setRevision((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
