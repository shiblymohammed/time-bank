'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';

import { ServiceOperations } from '../components/service-operations';
import { ApiManagement } from '../components/api-management';
import { api, ApiError, allMemberships, setApiSession, type Session } from '../lib/api';

interface MetricOverview {
  totalUsers: number;
  totalOrganizations: number;
  activeOrganizations: number;
  totalUniversalWallets: number;
  totalBalanceCredits: number;
  pendingMemberships: number;
}

interface OrganizationItem {
  id: string;
  code: string;
  name: string;
  district: string;
  type: string;
  status: 'ACTIVE' | 'DRAFT' | 'SUSPENDED' | 'ARCHIVED';
  branding?: {
    appDisplayName: string;
    primaryColor: string;
    secondaryColor: string;
  };
}

interface RestrictionItem {
  id: string;
  userId: string;
  userPhone?: string;
  user?: { phoneE164: string };
  restrictionType: string;
  reasonCode: string;
  status: 'ACTIVE' | 'RESOLVED';
  authorizedBy: string;
  createdAt: string;
}

interface AuditItem {
  id: string;
  eventType: string;
  actorId?: string;
  organizationId?: string;
  ipAddress?: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

interface MembershipItem {
  id: string;
  organizationId: string;
  userId: string;
  userPhone?: string;
  user?: { phoneE164: string };
  status: 'APPLIED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  membershipNumber?: string;
  appliedAt: string;
  roleGrants?: { role: string; status: string }[];
}

export default function AdminDashboard(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'organizations' | 'restrictions' | 'audit' | 'memberships' | 'services'
  >('overview');
  const [management, setManagement] = useState<{
    kind: 'organization' | 'membership';
    organizationId: string;
    id: string;
  } | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<string>('GLOBAL');

  const [metrics, setMetrics] = useState<MetricOverview | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [restrictions, setRestrictions] = useState<RestrictionItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditItem[]>([]);
  const [memberships, setMemberships] = useState<MembershipItem[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const mutationLock = useRef(false);
  const [revision, setRevision] = useState(0);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditTotal, setAuditTotal] = useState(0);
  const [eventType, setEventType] = useState('');

  // Modal states
  const [showNewOrgModal, setShowNewOrgModal] = useState(false);
  const [newOrgForm, setNewOrgForm] = useState({
    code: '',
    name: '',
    district: 'Malappuram',
    type: 'MUNICIPALITY',
    primaryColor: '#0D5C75',
    secondaryColor: '#F59E0B',
  });

  const [showImposeModal, setShowImposeModal] = useState(false);
  const [imposeForm, setImposeForm] = useState({
    userId: '',
    restrictionType: 'TEMPORARY_SUSPENSION',
    reasonCode: 'FRAUD_SUSPICION',
    notes: '',
  });

  const reportError = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : 'Unable to reach the API');
    if (cause instanceof ApiError && cause.status === 401) {
      setApiSession(null);
      setSession(null);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const signal = controller.signal;
    setLoading(true);
    setError('');
    setMetrics(null);
    setMemberships([]);
    setAuditLogs([]);
    setRestrictions([]);
    const load = async () => {
      const orgs = await api<{ data: OrganizationItem[] }>('/api/v1/organizations', { signal });
      const scoped =
        selectedTenant === 'GLOBAL' ? orgs.data : orgs.data.filter((o) => o.id === selectedTenant);
      const query = new URLSearchParams({ limit: '50', offset: String(auditOffset) });
      if (selectedTenant !== 'GLOBAL') query.set('organizationId', selectedTenant);
      if (eventType) query.set('eventType', eventType);
      const [overview, restrictionsData, audit, memberPages] = await Promise.all([
        api<MetricOverview>('/api/admin/overview', { signal }),
        api<RestrictionItem[]>('/api/admin/restrictions', { signal }),
        api<{ events: AuditItem[]; total: number }>(`/api/admin/audit-logs?${query}`, { signal }),
        Promise.all(
          scoped
            .filter((o) => o.status === 'ACTIVE')
            .map((o) => allMemberships<MembershipItem>(o.id, signal)),
        ),
      ]);
      if (signal.aborted) return;
      setOrganizations(orgs.data);
      setMetrics(overview);
      setRestrictions(restrictionsData);
      setAuditLogs(audit.events);
      setAuditTotal(audit.total);
      setMemberships(memberPages.flat());
    };
    load()
      .catch((cause) => {
        if (!signal.aborted) reportError(cause);
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [session, selectedTenant, revision, auditOffset, eventType, reportError]);

  const run = async (action: () => Promise<void>) => {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      reportError(cause);
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  };
  const mutate = (path: string, method: string, body: unknown, done?: () => void) =>
    run(async () => {
      await api(path, { method, body: JSON.stringify(body) });
      done?.();
      setRevision((value) => value + 1);
    });
  const handleCreateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    const { primaryColor, secondaryColor, ...organization } = newOrgForm;
    void mutate(
      '/api/v1/organizations',
      'POST',
      {
        ...organization,
        code: organization.code.trim().toUpperCase(),
        branding: { appDisplayName: organization.name, primaryColor, secondaryColor },
      },
      () => setShowNewOrgModal(false),
    );
  };
  const handleToggleOrgStatus = (id: string) => {
    const organization = organizations.find((o) => o.id === id);
    void mutate(`/api/admin/organizations/${id}/status`, 'PATCH', {
      status: organization?.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
    });
  };
  const handleApproveMembership = (id: string) => {
    const membership = memberships.find((m) => m.id === id);
    if (membership)
      void mutate(
        `/api/organizations/${membership.organizationId}/memberships/${id}/approve`,
        'POST',
        { initialRole: 'VOLUNTEER' },
      );
  };
  const handleRejectMembership = (id: string) => {
    const membership = memberships.find((m) => m.id === id);
    const reason = window.prompt('Reason for rejecting this membership:');
    if (membership && reason?.trim())
      void mutate(
        `/api/organizations/${membership.organizationId}/memberships/${id}/reject`,
        'POST',
        { reason: reason.trim() },
      );
  };
  const handleResolveRestriction = (id: string) => {
    const resolutionNotes = window.prompt('Reason for resolving this restriction:');
    if (resolutionNotes?.trim())
      void mutate(`/api/admin/restrictions/${id}/resolve`, 'POST', {
        resolutionNotes: resolutionNotes.trim(),
      });
  };
  const handleImposeRestriction = (e: React.FormEvent) => {
    e.preventDefault();
    void mutate('/api/admin/restrictions', 'POST', imposeForm, () => setShowImposeModal(false));
  };
  const handleEditBranding = (org: OrganizationItem) => {
    void run(async () => {
      const result = await api<{ data: { appDisplayName: string; primaryColor: string } }>(
        `/api/v1/organizations/${org.id}/branding`,
      );
      const appDisplayName = window.prompt(
        'App display name:',
        result.data.appDisplayName ?? org.name,
      );
      if (!appDisplayName?.trim()) return;
      const primaryColor = window.prompt(
        'Primary color (hex):',
        result.data.primaryColor ?? '#0D5C75',
      );
      if (!primaryColor) return;
      await api(`/api/v1/organizations/${org.id}/branding`, {
        method: 'PUT',
        body: JSON.stringify({ appDisplayName: appDisplayName.trim(), primaryColor }),
      });
      setRevision((value) => value + 1);
    });
  };

  if (!session)
    return (
      <main className="content-body" style={{ maxWidth: 480, margin: '10vh auto' }}>
        <h1>Super Admin sign in</h1>
        <p>Use the mobile number assigned to your Super Admin account.</p>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              if (!otpSent) {
                const result = await api<{ devOtp?: string; message: string }>(
                  '/api/auth/otp/request',
                  { method: 'POST', body: JSON.stringify({ phone }) },
                );
                setCode(result.devOtp ?? '');
                setOtpSent(true);
                setNotice(
                  result.devOtp
                    ? 'Development verification code filled automatically. Click Verify and sign in.'
                    : result.message,
                );
              } else {
                const result = await api<Session>('/api/auth/otp/verify', {
                  method: 'POST',
                  body: JSON.stringify({ phone, code }),
                });
                if (!result.isSuperAdmin) {
                  await api('/api/auth/logout', {
                    method: 'POST',
                    body: JSON.stringify({ refreshToken: result.refreshToken }),
                  });
                  throw new Error('This account does not have Super Admin access.');
                }
                setApiSession(result);
                setSession(result);
                setNotice('');
              }
            });
          }}
        >
          <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
            <label htmlFor="login-phone">Mobile number</label>
            <input
              id="login-phone"
              className="form-input"
              type="tel"
              autoComplete="tel"
              required
              value={phone}
              disabled={otpSent}
              onChange={(e) => setPhone(e.target.value)}
            />
            {otpSent && (
              <>
                <label htmlFor="login-code">Verification code</label>
                <input
                  id="login-code"
                  className="form-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </>
            )}
            <button className="btn btn-primary" type="submit">
              {busy ? 'Please wait…' : otpSent ? 'Verify and sign in' : 'Send code'}
            </button>
            {otpSent && (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setCode('');
                  setNotice('');
                }}
              >
                Change number / resend
              </button>
            )}
          </fieldset>
        </form>
      </main>
    );

  return (
    <div className="app-container">
      {/* ─── SIDEBAR NAVIGATION ─── */}
      <aside className="sidebar">
        <div className="brand-badge">
          <div className="brand-icon">ITB</div>
          <div>
            <div className="brand-title">Indian Time Bank</div>
            <div className="brand-subtitle">Super Admin Portal</div>
          </div>
        </div>

        <nav className="nav-group">
          <button
            id="nav-services"
            className={`nav-item ${activeTab === 'services' ? 'active' : ''}`}
            onClick={() => setActiveTab('services')}
          >
            <span>🤝</span> Service Operations
          </button>
          <button
            id="nav-overview"
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <span>📊</span> Overview Metrics
          </button>
          <button
            id="nav-orgs"
            className={`nav-item ${activeTab === 'organizations' ? 'active' : ''}`}
            onClick={() => setActiveTab('organizations')}
          >
            <span>🏛️</span> Organizations & Branding
          </button>
          <button
            id="nav-memberships"
            className={`nav-item ${activeTab === 'memberships' ? 'active' : ''}`}
            onClick={() => setActiveTab('memberships')}
          >
            <span>👥</span> Multi-Tenant Memberships
          </button>
          <button
            id="nav-restrictions"
            className={`nav-item ${activeTab === 'restrictions' ? 'active' : ''}`}
            onClick={() => setActiveTab('restrictions')}
          >
            <span>🛡️</span> Global Restrictions
          </button>
          <button
            id="nav-audit"
            className={`nav-item ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            <span>📜</span> Audit Explorer
          </button>
        </nav>

        <div style={{ padding: '16px 8px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Architecture v2.0</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '2px' }}>
            {loading ? '● Loading live data' : error ? '● API error' : '● Signed in'}
          </div>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <div className="main-wrapper">
        {/* Top Header */}
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Tenant Scope:</span>
            <div className="tenant-selector" id="tenant-dropdown">
              <span className="tenant-dot" />
              <select
                id="tenant-select"
                value={selectedTenant}
                onChange={(e) => {
                  setSelectedTenant(e.target.value);
                  setAuditOffset(0);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="GLOBAL" style={{ background: '#0E1626' }}>
                  🌐 Central Super Admin (Global Scope)
                </option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id} style={{ background: '#0E1626' }}>
                    🏛️ {org.name} ({org.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '6px 12px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-full)',
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                SA
              </div>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>Super Admin</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  {session.user.phoneE164}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Viewport Content */}
        <main className="content-body" aria-busy={loading || busy}>
          {error && <p role="alert">{error}</p>}
          {loading && <p role="status">Loading live data…</p>}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button
              className="btn"
              disabled={busy || loading}
              onClick={() => setRevision((v) => v + 1)}
            >
              Refresh
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api('/api/auth/logout', {
                    method: 'POST',
                    body: JSON.stringify({ refreshToken: session.refreshToken }),
                  });
                  setApiSession(null);
                  setSession(null);
                  setManagement(null);
                  setCode('');
                  setOtpSent(false);
                  setOrganizations([]);
                  setSelectedTenant('GLOBAL');
                })
              }
            >
              Sign out
            </button>
          </div>
          {selectedTenant !== 'GLOBAL' && (
            <p>
              Memberships, organizations and audit events are filtered by tenant. Overview and
              restrictions remain platform-wide.
            </p>
          )}
          {management && (
            <ApiManagement
              key={`${management.kind}-${management.id}`}
              target={management}
              onClose={() => setManagement(null)}
              onChanged={() => setRevision((value) => value + 1)}
              onError={reportError}
            />
          )}
          {activeTab === 'services' && (
            <ServiceOperations
              key={selectedTenant}
              organizationId={
                selectedTenant !== 'GLOBAL' &&
                organizations.some((org) => org.id === selectedTenant && org.status === 'ACTIVE')
                  ? selectedTenant
                  : null
              }
              onError={reportError}
            />
          )}
          <fieldset disabled={busy || loading} style={{ border: 0, padding: 0, minWidth: 0 }}>
            {/* ────────────────── OVERVIEW TAB ────────────────── */}
            {activeTab === 'overview' && (
              <div>
                <div style={{ marginBottom: '28px' }}>
                  <h1 style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                    Central Platform Overview
                  </h1>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '4px' }}>
                    Indian Time Bank network health, universal wallet ledger supply, and
                    cross-municipality memberships.
                  </p>
                </div>

                {/* Metrics Grid */}
                <div className="metric-grid">
                  <div className="glass-panel metric-card" id="card-metric-users">
                    <div className="metric-label">Registered Global Users</div>
                    <div className="metric-value">{metrics?.totalUsers ?? '—'}</div>
                    <div className="metric-sub">Single lifetime verified identities (D#39)</div>
                  </div>

                  <div className="glass-panel metric-card" id="card-metric-orgs">
                    <div className="metric-label">Civic Organizations</div>
                    <div className="metric-value">
                      {metrics?.activeOrganizations ?? '—'}{' '}
                      <span style={{ fontSize: '1rem', color: 'var(--text-dim)' }}>
                        / {metrics?.totalOrganizations ?? '—'}
                      </span>
                    </div>
                    <div className="metric-sub">Active municipal / corporation tenants</div>
                  </div>

                  <div className="glass-panel metric-card" id="card-metric-supply">
                    <div className="metric-label">Universal Credit Supply</div>
                    <div className="metric-value">
                      {metrics?.totalBalanceCredits.toFixed(1) ?? '—'}{' '}
                      <span style={{ fontSize: '1rem', color: 'var(--accent)' }}>hrs</span>
                    </div>
                    <div className="metric-sub">
                      Across {metrics?.totalUniversalWallets ?? '—'} non-org wallets (D#17)
                    </div>
                  </div>

                  <div className="glass-panel metric-card" id="card-metric-pending">
                    <div className="metric-label">Pending Memberships</div>
                    <div className="metric-value" style={{ color: 'var(--accent)' }}>
                      {metrics?.pendingMemberships ?? '—'}
                    </div>
                    <div className="metric-sub">Applications awaiting coordinator review</div>
                  </div>
                </div>

                {/* Network Highlights */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
                  <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>
                      Active White-Label Tenants
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {organizations
                        .filter((org) => selectedTenant === 'GLOBAL' || org.id === selectedTenant)
                        .map((org) => (
                          <div
                            key={org.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '14px 18px',
                              background: 'rgba(255, 255, 255, 0.02)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-md)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                              <div
                                style={{
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '4px',
                                  backgroundColor: org.branding?.primaryColor ?? '#0D5C75',
                                  border: '1px solid rgba(255, 255, 255, 0.3)',
                                }}
                              />
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                                  {org.name}
                                </div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                                  Code:{' '}
                                  <strong style={{ color: 'var(--text-main)' }}>{org.code}</strong>{' '}
                                  • {org.district}
                                </div>
                              </div>
                            </div>
                            <span className={`badge badge-${org.status.toLowerCase()}`}>
                              {org.status}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '24px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>
                      Multi-Organization Architecture (D#39 & ITB-004)
                    </h3>
                    <div
                      style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.6' }}
                    >
                      <p style={{ marginBottom: '12px' }}>
                        ✓ <strong>One Universal Wallet:</strong> Each citizen holds exactly one
                        lifetime time-credit balance that follows them across all municipal borders.
                      </p>
                      <p style={{ marginBottom: '12px' }}>
                        ✓ <strong>Independent Tenant Approval:</strong> Applying to Kottakkal
                        requires local coordinator approval and yields a branded municipal
                        membership, without affecting existing Kozhikode access.
                      </p>
                      <p>
                        ✓ <strong>Strict Auditability:</strong> Every role grant, restriction, and
                        status transition is recorded in an immutable append-only ledger.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ────────────────── ORGANIZATIONS TAB ────────────────── */}
            {activeTab === 'organizations' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '28px',
                  }}
                >
                  <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                      Civic Organizations & White-Label Theming
                    </h1>
                    <p
                      style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '4px' }}
                    >
                      Provision municipalities, update branding, and manage organization status.
                    </p>
                  </div>
                  <button
                    id="btn-new-org"
                    className="btn btn-primary"
                    onClick={() => setShowNewOrgModal(true)}
                  >
                    <span>+</span> Onboard New Municipality
                  </button>
                </div>

                <div className="glass-panel table-container">
                  <table className="custom-table" id="table-organizations">
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th>Slug Code</th>
                        <th>District & Type</th>
                        <th>Brand Palette</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {organizations
                        .filter((org) => selectedTenant === 'GLOBAL' || org.id === selectedTenant)
                        .map((org) => (
                          <tr key={org.id} id={`row-org-${org.code.toLowerCase()}`}>
                            <td>
                              <div style={{ fontWeight: 700 }}>{org.name}</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                                {org.branding?.appDisplayName}
                              </div>
                            </td>
                            <td>
                              <code
                                style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}
                              >
                                {org.code}
                              </code>
                            </td>
                            <td>
                              <div>{org.district}</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                                {org.type}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div
                                  style={{
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '4px',
                                    backgroundColor: org.branding?.primaryColor,
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                  }}
                                  title={`Primary: ${org.branding?.primaryColor}`}
                                />
                                <div
                                  style={{
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '4px',
                                    backgroundColor: org.branding?.secondaryColor,
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                  }}
                                  title={`Secondary: ${org.branding?.secondaryColor}`}
                                />
                              </div>
                            </td>
                            <td>
                              <span className={`badge badge-${org.status.toLowerCase()}`}>
                                {org.status}
                              </span>
                            </td>
                            <td>
                              <button
                                className="btn"
                                onClick={() =>
                                  setManagement({
                                    kind: 'organization',
                                    organizationId: org.id,
                                    id: org.id,
                                  })
                                }
                              >
                                Manage organization
                              </button>
                              <button
                                className="btn"
                                disabled={org.status !== 'ACTIVE'}
                                title="Branding updates require an active organization"
                                onClick={() => handleEditBranding(org)}
                              >
                                Edit branding
                              </button>
                              <button
                                id={`btn-toggle-${org.code.toLowerCase()}`}
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                                onClick={() => handleToggleOrgStatus(org.id)}
                              >
                                {org.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ────────────────── MEMBERSHIPS TAB ────────────────── */}
            {activeTab === 'memberships' && (
              <div>
                <div style={{ marginBottom: '28px' }}>
                  <h1 style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                    Multi-Tenant Memberships & Role Grants
                  </h1>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '4px' }}>
                    Review applications for active organizations and approve or reject membership
                    requests.
                  </p>
                </div>

                <div className="glass-panel table-container">
                  <table className="custom-table" id="table-memberships">
                    <thead>
                      <tr>
                        <th>Citizen Contact</th>
                        <th>Target Organization</th>
                        <th>Status</th>
                        <th>Membership Number</th>
                        <th>Assigned Roles</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!loading && !error && memberships.length === 0 && (
                        <tr>
                          <td colSpan={6}>No records found.</td>
                        </tr>
                      )}
                      {memberships.map((m) => {
                        const org = organizations.find((o) => o.id === m.organizationId);
                        return (
                          <tr key={m.id} id={`row-membership-${m.id}`}>
                            <td>
                              <div style={{ fontWeight: 700 }}>{m.user?.phoneE164 ?? m.userId}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                UID: {m.userId}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{org?.name ?? m.organizationId}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                Code: {org?.code}
                              </div>
                            </td>
                            <td>
                              <span className={`badge badge-${m.status.toLowerCase()}`}>
                                {m.status}
                              </span>
                            </td>
                            <td>
                              {m.membershipNumber ? (
                                <code
                                  style={{
                                    fontFamily: 'var(--font-mono)',
                                    color: 'var(--success)',
                                  }}
                                >
                                  {m.membershipNumber}
                                </code>
                              ) : (
                                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                                  Pending Approval
                                </span>
                              )}
                            </td>
                            <td>
                              {m.roleGrants && m.roleGrants.length > 0 ? (
                                m.roleGrants
                                  .filter((g) => g.status === 'ACTIVE')
                                  .map((g, idx) => (
                                    <span
                                      key={idx}
                                      style={{
                                        display: 'inline-block',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        background: 'rgba(13, 92, 117, 0.4)',
                                        color: '#E0F2FE',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        marginRight: '4px',
                                      }}
                                    >
                                      {g.role}
                                    </span>
                                  ))
                              ) : (
                                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                                  None
                                </span>
                              )}
                            </td>
                            <td>
                              <button
                                className="btn"
                                onClick={() =>
                                  setManagement({
                                    kind: 'membership',
                                    organizationId: m.organizationId,
                                    id: m.id,
                                  })
                                }
                              >
                                Details & roles
                              </button>
                              {(m.status === 'APPLIED' || m.status === 'PENDING_REVIEW') && (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button
                                    id={`btn-approve-${m.id}`}
                                    className="btn btn-success"
                                    style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                                    onClick={() => handleApproveMembership(m.id)}
                                  >
                                    ✓ Approve
                                  </button>
                                  <button
                                    id={`btn-reject-${m.id}`}
                                    className="btn btn-danger"
                                    style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                                    onClick={() => handleRejectMembership(m.id)}
                                  >
                                    ✕ Reject
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ────────────────── RESTRICTIONS TAB ────────────────── */}
            {activeTab === 'restrictions' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '28px',
                  }}
                >
                  <div>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                      Global Account Restrictions & Fraud Holds
                    </h1>
                    <p
                      style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '4px' }}
                    >
                      Platform-wide suspensions and permanent bans authorized by Central Super Admin
                      (D#82, D#83).
                    </p>
                  </div>
                  <button
                    id="btn-impose-restriction"
                    className="btn btn-danger"
                    onClick={() => setShowImposeModal(true)}
                  >
                    <span>⚠️</span> Impose Account Restriction
                  </button>
                </div>

                <div className="glass-panel table-container">
                  <table className="custom-table" id="table-restrictions">
                    <thead>
                      <tr>
                        <th>Target Citizen</th>
                        <th>Restriction Type</th>
                        <th>Reason Code</th>
                        <th>Authorized By</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!loading && !error && restrictions.length === 0 && (
                        <tr>
                          <td colSpan={6}>No records found.</td>
                        </tr>
                      )}
                      {restrictions.map((r) => (
                        <tr key={r.id} id={`row-res-${r.id}`}>
                          <td>
                            <div style={{ fontWeight: 700 }}>{r.user?.phoneE164 ?? r.userId}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                              ID: {r.id}
                            </div>
                          </td>
                          <td>
                            <span style={{ color: '#F87171', fontWeight: 600 }}>
                              {r.restrictionType}
                            </span>
                          </td>
                          <td>
                            <code style={{ fontFamily: 'var(--font-mono)' }}>{r.reasonCode}</code>
                          </td>
                          <td>{r.authorizedBy}</td>
                          <td>
                            <span className={`badge badge-${r.status.toLowerCase()}`}>
                              {r.status}
                            </span>
                          </td>
                          <td>
                            {r.status === 'ACTIVE' && (
                              <button
                                id={`btn-resolve-${r.id}`}
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                                onClick={() => handleResolveRestriction(r.id)}
                              >
                                Resolve Hold
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ────────────────── AUDIT EXPLORER TAB ────────────────── */}
            {activeTab === 'audit' && (
              <div>
                <div style={{ marginBottom: '28px' }}>
                  <h1 style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                    Global Audit Trail Explorer
                  </h1>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: '4px' }}>
                    Immutable, append-only record of administrative, authentication, and civic
                    operations.
                  </p>
                </div>

                <div className="glass-panel table-container">
                  <label htmlFor="audit-event">Event type filter</label>
                  <input
                    id="audit-event"
                    className="form-input"
                    value={eventType}
                    onChange={(e) => {
                      setEventType(e.target.value);
                      setAuditOffset(0);
                    }}
                    placeholder="All events"
                  />
                  <p>{auditTotal} matching events</p>
                  <button
                    className="btn"
                    disabled={busy || loading || auditOffset === 0}
                    onClick={() => setAuditOffset((v) => Math.max(0, v - 50))}
                  >
                    Previous
                  </button>
                  <button
                    className="btn"
                    disabled={busy || loading || auditOffset + 50 >= auditTotal}
                    onClick={() => setAuditOffset((v) => v + 50)}
                  >
                    Next
                  </button>
                  <table className="custom-table" id="table-audit-logs">
                    <thead>
                      <tr>
                        <th>Event Type</th>
                        <th>Actor ID</th>
                        <th>Organization</th>
                        <th>IP Address</th>
                        <th>Timestamp</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!loading && !error && auditLogs.length === 0 && (
                        <tr>
                          <td colSpan={6}>No records found.</td>
                        </tr>
                      )}
                      {auditLogs.map((log) => (
                        <tr key={log.id} id={`row-audit-${log.id}`}>
                          <td>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.8rem',
                                color: 'var(--accent)',
                                fontWeight: 700,
                              }}
                            >
                              {log.eventType}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
                              {log.actorId ?? 'SYSTEM'}
                            </div>
                          </td>
                          <td>{log.organizationId ?? 'CENTRAL'}</td>
                          <td>
                            <code style={{ fontSize: '0.78rem' }}>{log.ipAddress ?? '—'}</code>
                          </td>
                          <td style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                            {new Date(log.createdAt).toLocaleString()}
                          </td>
                          <td>
                            <pre
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.75rem',
                                background: 'rgba(0, 0, 0, 0.3)',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                color: '#93C5FD',
                              }}
                            >
                              {JSON.stringify(log.payload)}
                            </pre>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </fieldset>
        </main>
      </div>

      {/* ─── NEW ORGANIZATION MODAL ─── */}
      {showNewOrgModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '6px' }}>
              Onboard Civic Organization
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Create an administrative tenant with custom white-label colors and mobile branding.
            </p>

            {error && <p role="alert">{error}</p>}
            <form onSubmit={handleCreateOrg}>
              <fieldset disabled={busy || loading} style={{ border: 0, padding: 0 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '14px',
                    marginBottom: '14px',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginBottom: '6px',
                      }}
                    >
                      Slug Code (Uppercase)
                    </label>
                    <input
                      id="input-org-code"
                      type="text"
                      required
                      placeholder="e.g. THRISSUR"
                      className="form-input"
                      value={newOrgForm.code}
                      onChange={(e) =>
                        setNewOrgForm({ ...newOrgForm, code: e.target.value.toUpperCase() })
                      }
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginBottom: '6px',
                      }}
                    >
                      Administrative Type
                    </label>
                    <select
                      id="select-org-type"
                      className="form-input"
                      value={newOrgForm.type}
                      onChange={(e) => setNewOrgForm({ ...newOrgForm, type: e.target.value })}
                    >
                      <option value="MUNICIPALITY">Municipality</option>
                      <option value="MUNICIPAL_CORPORATION">Municipal Corporation</option>
                      <option value="GRAMA_PANCHAYAT">Grama Panchayat</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '14px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      marginBottom: '6px',
                    }}
                  >
                    Full Organization Display Name
                  </label>
                  <input
                    id="input-org-name"
                    type="text"
                    required
                    placeholder="e.g. Thrissur Municipal Corporation Time Bank"
                    className="form-input"
                    value={newOrgForm.name}
                    onChange={(e) => setNewOrgForm({ ...newOrgForm, name: e.target.value })}
                  />
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '14px',
                    marginBottom: '22px',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginBottom: '6px',
                      }}
                    >
                      Primary Brand Color
                    </label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        id="input-org-primary"
                        type="color"
                        value={newOrgForm.primaryColor}
                        onChange={(e) =>
                          setNewOrgForm({ ...newOrgForm, primaryColor: e.target.value })
                        }
                        style={{
                          width: '40px',
                          height: '40px',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                        }}
                      />
                      <input
                        type="text"
                        className="form-input"
                        value={newOrgForm.primaryColor}
                        onChange={(e) =>
                          setNewOrgForm({ ...newOrgForm, primaryColor: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginBottom: '6px',
                      }}
                    >
                      Secondary Accent Color
                    </label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        id="input-org-secondary"
                        type="color"
                        value={newOrgForm.secondaryColor}
                        onChange={(e) =>
                          setNewOrgForm({ ...newOrgForm, secondaryColor: e.target.value })
                        }
                        style={{
                          width: '40px',
                          height: '40px',
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                        }}
                      />
                      <input
                        type="text"
                        className="form-input"
                        value={newOrgForm.secondaryColor}
                        onChange={(e) =>
                          setNewOrgForm({ ...newOrgForm, secondaryColor: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowNewOrgModal(false)}
                  >
                    Cancel
                  </button>
                  <button id="btn-submit-org" type="submit" className="btn btn-primary">
                    Provision Organization
                  </button>
                </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}

      {/* ─── IMPOSE RESTRICTION MODAL ─── */}
      {showImposeModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '6px' }}>
              Impose Platform Restriction
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Enforce a platform-wide suspension or permanent ban across all organization apps.
            </p>

            {error && <p role="alert">{error}</p>}
            <form onSubmit={handleImposeRestriction}>
              <fieldset disabled={busy || loading} style={{ border: 0, padding: 0 }}>
                <div style={{ marginBottom: '14px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      marginBottom: '6px',
                    }}
                  >
                    Target Citizen User ID
                  </label>
                  <input
                    id="input-res-userid"
                    type="text"
                    required
                    placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                    className="form-input"
                    value={imposeForm.userId}
                    onChange={(e) => setImposeForm({ ...imposeForm, userId: e.target.value })}
                  />
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '14px',
                    marginBottom: '14px',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginBottom: '6px',
                      }}
                    >
                      Restriction Type
                    </label>
                    <select
                      id="select-res-type"
                      className="form-input"
                      value={imposeForm.restrictionType}
                      onChange={(e) =>
                        setImposeForm({ ...imposeForm, restrictionType: e.target.value })
                      }
                    >
                      <option value="TEMPORARY_SUSPENSION">Temporary Suspension</option>
                      <option value="PERMANENT_BAN">Permanent Ban</option>
                      <option value="FRAUD_INVESTIGATION_HOLD">Fraud Hold</option>
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginBottom: '6px',
                      }}
                    >
                      Reason Code
                    </label>
                    <input
                      id="input-res-code"
                      type="text"
                      required
                      placeholder="e.g. FRAUD_SUSPICION"
                      className="form-input"
                      value={imposeForm.reasonCode}
                      onChange={(e) => setImposeForm({ ...imposeForm, reasonCode: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '22px' }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      marginBottom: '6px',
                    }}
                  >
                    Administrative Justification Notes
                  </label>
                  <textarea
                    id="input-res-notes"
                    rows={3}
                    className="form-input"
                    placeholder="Detailed findings and evidence reference..."
                    value={imposeForm.notes}
                    onChange={(e) => setImposeForm({ ...imposeForm, notes: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowImposeModal(false)}
                  >
                    Cancel
                  </button>
                  <button id="btn-submit-restriction" type="submit" className="btn btn-danger">
                    Authorize Restriction
                  </button>
                </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
