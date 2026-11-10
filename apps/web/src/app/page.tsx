'use client';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Action } from '@/lib/admin-types';
import { CoordinatorRequests } from '@/components/coordinator-requests';
import { ServiceCatalogue } from '@/components/service-catalogue';
import { SafetyAlerts, useOpenSafetyAlerts } from '@/components/safety-alerts';
import { Complaints, useOpenComplaints } from '@/components/complaints';
import { RestrictionCases, useWaitingRestrictions } from '@/components/restriction-cases';
import { Closures, useWaitingClosures } from '@/components/closures';
import { Reports } from '@/components/reports';
import { Loyalty } from '@/components/loyalty';
import { PhoneRecoveries, useWaitingRecoveries } from '@/components/phone-recoveries';
import { ServiceOperations } from '@/components/service-operations';
import { TimeCredits } from '@/components/time-credits';
import { ApiManagement } from '@/components/api-management';
import {
  NOC_STATUS,
  WardNocSection,
  WardsPanel,
  wardLabel,
  type Noc,
  type Ward,
} from '@/components/wards';
import { BrandMark, Icon, type IconName } from '@/components/icons';
import { api, ApiError, backend } from '@/lib/api';
import { firebaseMessage, sendPhoneCode, type FirebaseWebConfig } from '@/lib/firebase-phone';

type Tab =
  | 'overview'
  | 'organizations'
  | 'memberships'
  | 'requests'
  | 'safety'
  | 'complaints'
  | 'catalogue'
  | 'operations'
  | 'credits'
  | 'restrictions'
  | 'closures'
  | 'reports'
  | 'loyalty'
  | 'phone-recoveries'
  | 'audit';
type Grant = { id: string; role: string; status: string };
type Membership = {
  id: string;
  userId: string;
  organizationId: string;
  status: string;
  membershipNumber?: string | null;
  user?: {
    phoneE164: string;
    fullName?: string | null;
    verifiedIdentity?: {
      verificationStatus: string;
      verifiedAt?: string | null;
      rejectionReason?: string | null;
      documentType?: string | null;
      documentLast4?: string | null;
      verificationNotes?: string | null;
    } | null;
  };
  roleGrants: Grant[];
  rejectionReason?: string | null;
  requestedRole?: string | null;
  /** The member's ward and current ward NOC (detail), or the NOC's status (list). */
  ward?: Ward | null;
  noc?: Noc | null;
  nocStatus?: Noc['status'] | null;
  applicationNotes?: string | null;
  applicationDetails?: {
    volunteer?: {
      maxTravelRadiusKm: number;
      availableAtShortNotice: boolean;
      usualDays: string[];
      usualTimes: string[];
      skillCodes: string[];
    };
  };
};
/** "+919876543210" reads as "+91 98765 43210"; other numbers are left as stored. */
const phone = (value?: string) =>
  value && /^\+91\d{10}$/.test(value) ? `+91 ${value.slice(3, 8)} ${value.slice(8)}` : value;
const IDENTITY_DOCUMENTS = [
  'AADHAAR_CARD',
  'VOTER_ID',
  'PASSPORT',
  'DRIVING_LICENSE',
  'PAN_CARD',
  'RATION_CARD',
  'OTHER',
];
const listed = (values: string[] = []) =>
  values.length ? values.map((value) => label(value)).join(', ') : 'Not given';
type Profile = {
  id: string;
  phoneE164: string;
  status: string;
  memberships: { organizationId: string; status: string; roles: string[] }[];
  /** Whether this sign-in still needs the emailed staff code. */
  staffCheck?: {
    required: boolean;
    verified: boolean;
    hasEmail: boolean;
    maskedEmail: string | null;
  };
};
const needsStaffCode = (profile: Profile) =>
  Boolean(profile.staffCheck?.required && !profile.staffCheck.verified);
type Organization = {
  id: string;
  code: string;
  name: string;
  district: string;
  type: string;
  status: string;
  branding?: { appDisplayName: string; primaryColor: string; secondaryColor: string };
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
  pendingSuperAdminCount: number;
  pendingSuperAdmins: {
    membershipId: string;
    organizationId: string;
    organizationName: string | null;
    fullName: string | null;
    phoneE164: string | null;
  }[];
};
type View = {
  memberships: Membership[];
  events: Audit[];
  metrics: Metrics | null;
  total: number;
};
const empty = (): View => ({
  memberships: [],
  events: [],
  metrics: null,
  total: 0,
});
const PAGES: {
  id: Tab;
  text: string;
  icon: IconName;
  group: string;
  description: string;
  centralOnly?: boolean;
  /** Municipality Admins and Super Admins. */
  managersOnly?: boolean;
}[] = [
  {
    id: 'overview',
    text: 'Overview',
    icon: 'overview',
    group: 'General',
    description: 'Platform-wide totals across all organizations',
    centralOnly: true,
  },
  {
    id: 'organizations',
    text: 'Organizations',
    icon: 'organizations',
    group: 'General',
    description: 'Organizations, their status and branding',
  },
  {
    id: 'memberships',
    text: 'Memberships',
    icon: 'memberships',
    group: 'Community',
    description: 'Review applications and manage member roles',
  },
  {
    id: 'requests',
    text: 'Requests & matching',
    icon: 'requests',
    group: 'Community',
    description: 'Help requests and volunteer matching',
  },
  {
    id: 'safety',
    text: 'Safety alerts',
    icon: 'safety',
    group: 'Community',
    description: 'Visits paused or ended by a safety alert',
  },
  {
    id: 'complaints',
    text: 'Complaints',
    icon: 'complaints',
    group: 'Community',
    description: 'Confidential complaints from members',
  },
  {
    id: 'catalogue',
    text: 'Service catalogue',
    icon: 'catalogue',
    group: 'Services',
    description: 'Services members can offer and request',
  },
  {
    id: 'operations',
    text: 'Service operations',
    icon: 'operations',
    group: 'Services',
    description: 'Bookings, completions and time credits',
  },
  {
    id: 'credits',
    text: 'Time credits',
    icon: 'wallet',
    group: 'Governance',
    description: 'Community pools, member wallets and independent credit reviews',
  },

  {
    id: 'loyalty',
    text: 'Loyalty and merchants',
    icon: 'wallet',
    group: 'Governance',
    description: 'Local coins, merchant-funded offers and recognition',
  },
  {
    id: 'restrictions',
    text: 'Restrictions',
    icon: 'restrictions',
    group: 'Governance',
    description: 'Suspensions, bans, reinstatement and appeals',
  },
  {
    id: 'closures',
    text: 'Account closures',
    icon: 'closures',
    group: 'Governance',
    description: 'Deaths, duplicate accounts and passing on credits',
  },
  {
    id: 'reports',
    text: 'Reports',
    icon: 'reports',
    group: 'Governance',
    description: 'Figures and downloads for staff, and saved reports for sponsors',
    managersOnly: true,
  },
  {
    id: 'phone-recoveries',
    text: 'Phone number changes',
    icon: 'phoneRecovery',
    group: 'Governance',
    description: 'Moving an account to a new number after a lost phone or SIM',
  },
  {
    id: 'audit',
    text: 'Audit trail',
    icon: 'audit',
    group: 'Governance',
    description: 'Server-recorded events',
    centralOnly: true,
  },
];
const OPERATIONS = ['VOLUNTEER', 'BENEFICIARY', 'CAREGIVER', 'MERCHANT'];
const STAFF = ['COORDINATOR', 'MUNICIPALITY_ADMIN', 'SUPER_ADMIN'];
const approved = (profile: Profile) =>
  profile.memberships.filter((member) => member.status === 'APPROVED');
const globalAdmin = (profile: Profile) =>
  approved(profile).some((member) => member.roles.includes('SUPER_ADMIN'));
const staffMemberships = (profile: Profile) =>
  approved(profile).filter((member) =>
    member.roles.some((role) => STAFF.includes(role) || role === 'MERCHANT'),
  );
/** Words whose capitals a plain "Sentence case" would lose. */
const LABELS: Record<string, string> = {
  ID_VERIFIED: 'ID verified',
  VOTER_ID: 'Voter ID',
  PAN_CARD: 'PAN card',
  DRIVING_LICENSE: 'Driving licence',
};
const label = (value: string) =>
  LABELS[value] ??
  value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^./, (char) => char.toUpperCase());
function Badge({ value }: { value: string }) {
  const tone = ['ACTIVE', 'APPROVED', 'RESOLVED', 'VERIFIED', 'ID_VERIFIED'].includes(value)
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
  // undefined while loading; null means this deployment uses the private QA code instead.
  const [firebase, setFirebase] = useState<FirebaseWebConfig | null>();
  const confirmCode = useRef<((code: string) => Promise<string>) | null>(null);
  const recaptcha = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api<Partial<FirebaseWebConfig>>('/api/firebase-config')
      .then((config) => setFirebase(config.apiKey ? (config as FirebaseWebConfig) : null))
      .catch(() => {
        setFirebase(null);
        setError('Sign-in is unavailable. Reload the page to try again.');
      });
  }, []);
  return (
    <main className="login-shell">
      <section className="glass-panel login-panel">
        <div className="brand-icon">
          <BrandMark />
        </div>
        <h1>Sign in to Indian Time Bank</h1>
        <p>For coordinators, administrators and local merchants.</p>
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError('');
            const normalized = phone.startsWith('+') ? phone : `+91${phone}`;
            try {
              if (!sent && firebase) {
                confirmCode.current = await sendPhoneCode(firebase, normalized, recaptcha.current!);
                setSent(true);
              } else if (!sent) {
                const result = await api<{ devOtp?: string }>('/api/session', 'POST', {
                  action: 'request-code',
                  phone: normalized,
                });
                setCode(result.devOtp ?? '');
                setDevelopment(Boolean(result.devOtp));
                setSent(true);
              } else if (firebase) {
                const idToken = await confirmCode.current!(code);
                onSignedIn(
                  await api<Profile>('/api/session', 'POST', { action: 'firebase', idToken }),
                );
              } else
                onSignedIn(
                  await api<Profile>('/api/session', 'POST', {
                    action: 'verify',
                    phone: normalized,
                    code,
                  }),
                );
            } catch (cause) {
              setError(
                firebaseMessage(cause) ??
                  (cause instanceof Error ? cause.message : 'Unable to sign in'),
              );
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
              placeholder="10-digit mobile number"
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
          <div ref={recaptcha} />
          <button className="btn btn-primary" disabled={busy || firebase === undefined}>
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
                confirmCode.current = null;
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
function StaffCodeStep({
  profile,
  onVerified,
  onSignOut,
}: {
  profile: Profile;
  onVerified: (profile: Profile) => void;
  onSignOut: () => void;
}) {
  const check = profile.staffCheck!;
  const [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ sent: boolean; verified?: boolean; maskedEmail?: string }>(
        '/api/session',
        'POST',
        { action: 'staff-code-request' },
      );
      if (result.verified) onVerified(await api<Profile>('/api/session'));
      else {
        setSent(true);
        setNotice(`We sent a 6-digit code to ${result.maskedEmail ?? check.maskedEmail}.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send the code');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-shell">
      <section className="glass-panel login-panel">
        <div className="brand-icon">
          <BrandMark />
        </div>
        <h1>Check your email</h1>
        {check.hasEmail ? (
          <p>
            Staff sign-in needs a second step. We email a code to {check.maskedEmail} each time you
            sign in to this panel.
          </p>
        ) : (
          <p>
            Staff sign-in needs a code sent to your email, and no email address is on file for your
            account. Ask a Super Admin to add one, then sign in again.
          </p>
        )}
        <form
          className="stack"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!sent) return send();
            setBusy(true);
            setError('');
            try {
              onVerified(
                await api<Profile>('/api/session', 'POST', { action: 'staff-code-verify', code }),
              );
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Unable to check the code');
            } finally {
              setBusy(false);
            }
          }}
        >
          {sent && (
            <label>
              Email code
              <input
                className="form-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                pattern="[0-9]{6}"
                value={code}
                disabled={busy}
                onChange={(event) => setCode(event.target.value.trim())}
              />
            </label>
          )}
          {notice && <p className="help-text">{notice}</p>}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {check.hasEmail && (
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Please wait…' : sent ? 'Verify and continue' : 'Email me a code'}
            </button>
          )}
          {sent && (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={send}>
              Send another code
            </button>
          )}
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onSignOut}>
            Sign out
          </button>
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
  const inFlight = useRef(false);
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
            if (inFlight.current) return;
            inFlight.current = true;
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
              inFlight.current = false;
              setBusy(false);
              setPending(false);
            }
          }}
        >
          <fieldset disabled={busy} className="stack">
            {action.fields.map((field) => (
              <label key={field.key}>
                {field.label}
                {field.optional && field.type !== 'checkbox' && (
                  <span className="optional"> · Optional</span>
                )}
                {field.type === 'checkbox' ? (
                  <input
                    type="checkbox"
                    name={field.key}
                    required={!field.optional}
                    defaultChecked={field.value === 'true'}
                  />
                ) : field.type === 'textarea' ? (
                  <textarea
                    name={field.key}
                    className="form-input"
                    rows={4}
                    required={!field.optional}
                    defaultValue={field.value ?? ''}
                    minLength={field.minLength}
                    maxLength={field.maxLength}
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
              {busy ? 'Saving…' : (action.submitLabel ?? 'Save')}
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
    [search, setSearch] = useState(''),
    [searchText, setSearchText] = useState(''),
    [eventType, setEventType] = useState(''),
    [revision, setRevision] = useState(0),
    [managed, setManaged] = useState<string | null>(null),
    [wardsFor, setWardsFor] = useState<{ id: string; name: string } | null>(null);
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
  const isStaffScope = isGlobal || localRoles.some((role) => STAFF.includes(role));
  const isMerchantScope = localRoles.includes('MERCHANT');
  const openSafetyAlerts = useOpenSafetyAlerts(
    profile && isStaffScope && tenant !== 'GLOBAL' ? tenant : null,
    revision,
  );
  const openComplaints = useOpenComplaints(
    Boolean(profile) && isStaffScope,
    tenant === 'GLOBAL' ? null : tenant,
    revision,
  );
  const waitingRestrictions = useWaitingRestrictions(
    Boolean(profile) && canManageRoles,
    tenant === 'GLOBAL' ? null : tenant,
    revision,
  );
  const waitingClosures = useWaitingClosures(
    Boolean(profile) && canManageRoles,
    tenant === 'GLOBAL' ? null : tenant,
    revision,
  );
  const waitingRecoveries = useWaitingRecoveries(
    Boolean(profile) && canManageRoles,
    isGlobal,
    tenant === 'GLOBAL' ? null : tenant,
    revision,
  );
  const initialRoles = [
    ...OPERATIONS,
    ...(canManageRoles ? ['COORDINATOR'] : []),
    ...(isGlobal ? ['MUNICIPALITY_ADMIN'] : []),
  ];
  const tabs = PAGES.filter(
    (page) =>
      (isStaffScope || page.id === 'loyalty') &&
      (isGlobal || !page.centralOnly) &&
      (canManageRoles || !page.managersOnly),
  );
  const selectedOrg = organizations.find((organization) => organization.id === tenant);
  const page = tabs.find((item) => item.id === tab);
  const shownOrgs = organizations.filter(
    (organization) => tenant === 'GLOBAL' || organization.id === tenant,
  );
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
    if (
      !central &&
      !approved(next).some((member) => member.roles.some((role) => STAFF.includes(role)))
    )
      setTab('loyalty');
    else if (!central)
      setTab((current) =>
        [
          'organizations',
          'memberships',
          'requests',
          'safety',
          'complaints',
          'catalogue',
          'operations',
          'credits',
          'loyalty',
        ].includes(current)
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
    if (!profile || needsStaffCode(profile)) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setView(empty());
    setDetail(null);
    async function load() {
      const result = await backend<{ data: Organization[] }>(
        isGlobal ? '/v1/organizations/manage' : '/v1/organizations',
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
        if (search) query.set('search', search);
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
  }, [profile, tab, tenant, offset, status, search, eventType, revision, isGlobal]);
  // Search once typing pauses, not on every letter.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchText.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);
  function changeScope(value: string) {
    setTenant(value);
    if (
      !isGlobal &&
      !approved(profile!)
        .find((member) => member.organizationId === value)
        ?.roles.some((role) => STAFF.includes(role))
    )
      setTab('loyalty');
    setSearch('');
    setSearchText('');
    setOffset(0);
    setDetail(null);
    setView(empty());
    setNotice('');
  }
  function changeTab(value: Tab) {
    setTab(value);
    setStatus('');
    setSearch('');
    setSearchText('');
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
  if (needsStaffCode(profile))
    return (
      <StaffCodeStep
        profile={profile}
        onVerified={signedIn}
        onSignOut={() => {
          api('/api/session', 'DELETE').catch(() => undefined);
          expired();
        }}
      />
    );
  return (
    <div className="app-container">
      <aside className="sidebar" inert={action !== null || detail !== null}>
        <div className="brand-badge">
          <div className="brand-icon">
            <BrandMark />
          </div>
          <div>
            <div className="brand-title">Indian Time Bank</div>
            <div className="brand-subtitle">Administration</div>
          </div>
        </div>
        <nav className="nav-group" aria-label="Dashboard">
          {tabs.map((item, index) => (
            <React.Fragment key={item.id}>
              {tabs[index - 1]?.group !== item.group && (
                <div className="nav-section">{item.group}</div>
              )}
              <button
                id={`nav-${item.id}`}
                className={`nav-item ${tab === item.id ? 'active' : ''}`}
                aria-current={tab === item.id ? 'page' : undefined}
                disabled={pending}
                onClick={() => changeTab(item.id)}
              >
                <Icon name={item.icon} />
                {item.text}
                {item.id === 'safety' && openSafetyAlerts > 0 && (
                  <span className="nav-alert-count" role="status">
                    {openSafetyAlerts}
                    <span className="sr-only"> open</span>
                  </span>
                )}
                {item.id === 'complaints' && openComplaints > 0 && (
                  <span className="nav-alert-count" role="status">
                    {openComplaints}
                    <span className="sr-only"> open</span>
                  </span>
                )}
                {item.id === 'restrictions' && waitingRestrictions > 0 && (
                  <span className="nav-alert-count" role="status">
                    {waitingRestrictions}
                    <span className="sr-only"> waiting</span>
                  </span>
                )}
                {item.id === 'closures' && waitingClosures > 0 && (
                  <span className="nav-alert-count" role="status">
                    {waitingClosures}
                    <span className="sr-only"> waiting</span>
                  </span>
                )}
                {item.id === 'phone-recoveries' && waitingRecoveries > 0 && (
                  <span className="nav-alert-count" role="status">
                    {waitingRecoveries}
                    <span className="sr-only"> waiting</span>
                  </span>
                )}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar" aria-hidden="true">
            {profile.phoneE164.slice(-2)}
          </div>
          <div className="user-meta">
            <p>{phone(profile.phoneE164)}</p>
            <p>
              {isGlobal
                ? 'Central administrator'
                : isStaffScope
                  ? 'Organization staff'
                  : 'Merchant'}
            </p>
          </div>
          <button
            className="icon-button"
            title="Sign out"
            aria-label="Sign out"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await api('/api/session', 'DELETE');
                expired();
              } catch (cause) {
                expired();
                setError(
                  'Signed out of this page. The server could not confirm session revocation. ' +
                    (cause instanceof Error ? cause.message : 'Please try again when connected.'),
                );
              } finally {
                setPending(false);
              }
            }}
          >
            <Icon name="logout" />
          </button>
        </div>
      </aside>
      <div className="main-wrapper" inert={action !== null || detail !== null}>
        <header className="top-bar">
          <div className="page-title">
            <h1>{page?.text}</h1>
            <p>{page?.description}</p>
          </div>
          <div className="top-actions">
            {/* The overview always covers every organization. */}
            {tab !== 'overview' && (
              <label className="scope-label">
                Organization
                <select
                  id="tenant-select"
                  className="form-input"
                  value={tenant}
                  disabled={pending}
                  onChange={(event) => changeScope(event.target.value)}
                >
                  {isGlobal && <option value="GLOBAL">All organizations</option>}
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="btn btn-secondary"
              title="Reload from the server"
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
              <Icon name="refresh" />
              Refresh
            </button>
          </div>
        </header>
        <main className="content-body" aria-busy={loading || pending}>
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
          {loading && (
            <p className="loading-line" role="status">
              Loading…
            </p>
          )}
          {tab === 'overview' && view.metrics && (
            <div className="metric-grid">
              {(
                [
                  ['Registered users', view.metrics.totalUsers, 'users'],
                  ['Organizations', view.metrics.totalOrganizations, 'organizations'],
                  ['Active organizations', view.metrics.activeOrganizations, 'check'],
                  ['Time wallets', view.metrics.totalUniversalWallets, 'wallet'],
                  ['Time credits', view.metrics.totalBalanceCredits, 'clock'],
                ] as const
              ).map(([name, value, icon]) => (
                <section className="glass-panel metric-card" key={name}>
                  <div>
                    <div className="metric-label">{name}</div>
                    <div className="metric-value">{value}</div>
                  </div>
                  <div className="metric-icon">
                    <Icon name={icon} />
                  </div>
                </section>
              ))}
              <section
                className={`glass-panel metric-card ${view.metrics.pendingMemberships ? 'attention' : ''}`}
              >
                <div>
                  <div className="metric-label">Pending memberships</div>
                  <div className="metric-value">{view.metrics.pendingMemberships}</div>
                  {view.metrics.pendingMemberships > 0 && (
                    <button
                      className="metric-link"
                      onClick={() => {
                        changeTab('memberships');
                        setStatus('APPLIED');
                      }}
                    >
                      Review applications →
                    </button>
                  )}
                </div>
                <div className="metric-icon">
                  <Icon name="inbox" />
                </div>
              </section>
              <section
                className={`glass-panel metric-card ${view.metrics.pendingSuperAdminCount ? 'attention' : ''}`}
              >
                <div>
                  <div className="metric-label">Super Admins awaiting approval</div>
                  <div className="metric-value">{view.metrics.pendingSuperAdminCount}</div>
                  {view.metrics.pendingSuperAdmins.map((person) => (
                    <button
                      className="metric-link"
                      key={person.membershipId}
                      disabled={pending}
                      onClick={() => {
                        setTenant(person.organizationId);
                        changeTab('memberships');
                        void review({
                          id: person.membershipId,
                          organizationId: person.organizationId,
                        } as Membership);
                      }}
                    >
                      {person.fullName ?? phone(person.phoneE164 ?? undefined) ?? 'Unnamed'}
                      {person.organizationName && `, ${person.organizationName}`} →
                    </button>
                  ))}
                </div>
                <div className="metric-icon">
                  <Icon name="inbox" />
                </div>
              </section>
            </div>
          )}
          {tab === 'requests' &&
            (tenant === 'GLOBAL' ? (
              <p className="glass-panel empty-state">
                Choose an organization above to see its requests and matching.
              </p>
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
          {tab === 'loyalty' && (
            <Loyalty
              key={tenant}
              organizationId={tenant === 'GLOBAL' ? null : tenant}
              isGlobal={isGlobal}
              canManage={canManageRoles}
              canProposeAwards={isStaffScope}
              isMerchant={isMerchantScope}
              onExpired={expired}
            />
          )}
          {tab === 'safety' &&
            (tenant === 'GLOBAL' ? (
              <p className="glass-panel empty-state">
                Choose an organization above to see its safety alerts.
              </p>
            ) : (
              <SafetyAlerts
                key={tenant}
                organizationId={tenant}
                revision={revision}
                pending={pending}
                openAction={openAction}
                onExpired={expired}
              />
            ))}
          {tab === 'complaints' && (
            <Complaints
              key={tenant}
              organizationId={tenant === 'GLOBAL' ? null : tenant}
              isGlobal={isGlobal}
              revision={revision}
              pending={pending}
              openAction={openAction}
              onExpired={expired}
            />
          )}
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
          {tab === 'credits' &&
            (tenant === 'GLOBAL' ? (
              <p className="glass-panel empty-state">
                Choose an organization above to manage its time credits.
              </p>
            ) : (
              <TimeCredits
                key={tenant}
                organizationId={tenant}
                userId={profile.id}
                roles={localRoles}
                isGlobal={isGlobal}
                revision={revision}
                pending={pending}
                openAction={openAction}
                onExpired={expired}
              />
            ))}
          {tab === 'operations' && (
            <ServiceOperations
              key={tenant}
              organizationId={tenant === 'GLOBAL' ? null : tenant}
              isGlobal={isGlobal}
              onError={(cause) => {
                if (cause instanceof ApiError && cause.status === 401) expired();
              }}
            />
          )}
          {tab === 'organizations' && managed && (
            <ApiManagement
              key={managed}
              target={{ kind: 'organization', organizationId: managed, id: managed }}
              onClose={() => setManaged(null)}
              onChanged={() => setRevision((value) => value + 1)}
              onError={(cause) => {
                if (cause instanceof ApiError && cause.status === 401) expired();
              }}
            />
          )}
          {tab === 'organizations' && wardsFor && (
            <WardsPanel
              key={wardsFor.id}
              organizationId={wardsFor.id}
              organizationName={wardsFor.name}
              canEdit={
                isGlobal || (wardsFor.id === tenant && localRoles.includes('MUNICIPALITY_ADMIN'))
              }
              revision={revision}
              pending={pending}
              openAction={openAction}
              onClose={() => setWardsFor(null)}
              onExpired={expired}
            />
          )}
          {tab === 'organizations' && (
            <>
              <div className="section-heading">
                <p>
                  {shownOrgs.length} organization{shownOrgs.length === 1 ? '' : 's'}
                </p>
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
                    <Icon name="plus" />
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
                      <th>App branding</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownOrgs.map((organization) => (
                      <tr key={organization.id}>
                        <td className="primary-cell">
                          {organization.name}
                          <div className="mono">{organization.code}</div>
                        </td>
                        <td>
                          {organization.district}
                          <div className="help-text">{label(organization.type)}</div>
                        </td>
                        <td>
                          <Badge value={organization.status} />
                        </td>
                        <td>
                          {organization.branding ? (
                            <div className="branding-cell">
                              <span
                                className="swatch"
                                style={{ background: organization.branding.primaryColor }}
                                title={organization.branding.primaryColor}
                              />
                              <span
                                className="swatch"
                                style={{ background: organization.branding.secondaryColor }}
                                title={organization.branding.secondaryColor}
                              />
                              {organization.branding.appDisplayName}
                            </div>
                          ) : (
                            <span className="help-text">Not configured</span>
                          )}
                        </td>
                        <td>
                          <div className="action-row">
                            {isGlobal && (
                              <button
                                className="btn btn-secondary"
                                disabled={pending}
                                onClick={() => setManaged(organization.id)}
                              >
                                Settings & app builds
                              </button>
                            )}
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
                                (localRoles.includes('MUNICIPALITY_ADMIN') ||
                                  localRoles.includes('COORDINATOR')))) && (
                              <button
                                className="btn btn-secondary"
                                disabled={pending}
                                onClick={() =>
                                  setWardsFor({ id: organization.id, name: organization.name })
                                }
                              >
                                Wards
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
                <p className="glass-panel empty-state">
                  Choose an organization above to review its memberships.
                </p>
              ) : (
                <>
                  <div className="toolbar">
                    <label>
                      Status
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
                    <label>
                      Search
                      <input
                        className="form-input"
                        type="search"
                        placeholder="Name, membership number or phone"
                        value={searchText}
                        onChange={(event) => setSearchText(event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="table-container glass-panel">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th>Status</th>
                          <th>Membership no.</th>
                          <th>Ward and NOC</th>
                          <th>Roles</th>
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.memberships.map((member) => (
                          <tr key={member.id}>
                            <td>
                              {member.user?.fullName ?? (
                                <span className="help-text">No name yet</span>
                              )}
                              {member.user?.verifiedIdentity?.verificationStatus === 'VERIFIED' && (
                                <>
                                  {' '}
                                  <Badge value="ID_VERIFIED" />
                                </>
                              )}
                              <div className="mono">
                                {phone(member.user?.phoneE164) ?? 'Unknown number'}
                              </div>
                            </td>
                            <td>
                              <Badge value={member.status} />
                            </td>
                            <td>
                              {member.membershipNumber ?? (
                                <span className="help-text">Not assigned</span>
                              )}
                            </td>
                            <td>
                              {member.ward ? (
                                `Ward ${member.ward.wardNumber}`
                              ) : (
                                <span className="help-text">No ward</span>
                              )}
                              <div
                                className={member.nocStatus === 'APPROVED' ? 'help-text' : 'mono'}
                              >
                                {member.nocStatus
                                  ? `NOC ${NOC_STATUS[member.nocStatus].toLowerCase()}`
                                  : 'No NOC yet'}
                              </div>
                            </td>
                            <td>
                              {member.roleGrants
                                .filter((grant) => grant.status === 'ACTIVE')
                                .map((grant) => label(grant.role))
                                .join(', ') || <span className="help-text">None</span>}
                            </td>
                            <td>
                              <button
                                className={`btn btn-sm ${['APPLIED', 'PENDING_REVIEW'].includes(member.status) ? 'btn-primary' : 'btn-secondary'}`}
                                disabled={pending}
                                onClick={() => review(member)}
                              >
                                {['APPLIED', 'PENDING_REVIEW'].includes(member.status)
                                  ? 'Review'
                                  : 'View'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!loading && !error && view.total === 0 && (
                      <p className="empty-state">No memberships match this filter.</p>
                    )}
                  </div>
                </>
              )}
              {detail &&
                // Rendered on <body> so it stays usable while the page behind is inert.
                createPortal(
                  <>
                    <div className="drawer-backdrop" onClick={() => !pending && setDetail(null)} />
                    <aside
                      className="drawer"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="membership-title"
                      inert={action !== null}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape' && !pending) setDetail(null);
                      }}
                    >
                      <div className="drawer-header">
                        <div>
                          <h2 id="membership-title">
                            {detail.membership.user?.fullName ??
                              phone(detail.membership.user?.phoneE164) ??
                              'Membership'}
                          </h2>
                          <p>
                            <Badge value={detail.membership.status} />{' '}
                            {detail.membership.membershipNumber}
                            {detail.membership.user?.fullName &&
                              ` · ${phone(detail.membership.user.phoneE164)}`}
                          </p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="Close review"
                          title="Close"
                          disabled={pending}
                          autoFocus
                          onClick={() => setDetail(null)}
                        >
                          <Icon name="close" />
                        </button>
                      </div>
                      <div className="drawer-body">
                        <section className="drawer-section">
                          <h3>Application</h3>
                          <dl className="facts">
                            <dt>Asked to join as</dt>
                            <dd>
                              {detail.membership.requestedRole
                                ? label(detail.membership.requestedRole)
                                : 'Not stated'}
                            </dd>
                            {detail.membership.applicationNotes && (
                              <>
                                <dt>Applicant note</dt>
                                <dd>{detail.membership.applicationNotes}</dd>
                              </>
                            )}
                            {detail.membership.applicationDetails?.volunteer && (
                              <>
                                <dt>Travel</dt>
                                <dd>
                                  Up to{' '}
                                  {detail.membership.applicationDetails.volunteer.maxTravelRadiusKm}{' '}
                                  km
                                  {detail.membership.applicationDetails.volunteer
                                    .availableAtShortNotice
                                    ? ', available at short notice'
                                    : ''}
                                </dd>
                                <dt>Usual days</dt>
                                <dd>
                                  {listed(detail.membership.applicationDetails.volunteer.usualDays)}
                                </dd>
                                <dt>Usual times</dt>
                                <dd>
                                  {listed(
                                    detail.membership.applicationDetails.volunteer.usualTimes,
                                  )}
                                </dd>
                                <dt>Claimed skills</dt>
                                <dd>
                                  {listed(
                                    detail.membership.applicationDetails.volunteer.skillCodes,
                                  )}
                                  <div className="help-text">Verify each skill after approval.</div>
                                </dd>
                              </>
                            )}
                            {detail.membership.rejectionReason && (
                              <>
                                <dt>Rejection reason</dt>
                                <dd>{detail.membership.rejectionReason}</dd>
                              </>
                            )}
                            <dt>User ID</dt>
                            <dd className="mono">{detail.membership.userId}</dd>
                          </dl>
                        </section>
                        {isGlobal && (
                          <section className="drawer-section">
                            <div className="section-heading">
                              <h3>Staff sign-in email</h3>
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() =>
                                  openAction({
                                    title: 'Set staff sign-in email',
                                    fields: [
                                      {
                                        key: 'email',
                                        label: 'Email (leave empty to remove)',
                                        type: 'email',
                                        optional: true,
                                        maxLength: 254,
                                      },
                                    ],
                                    submit: (values) =>
                                      backend(
                                        `/admin/users/${detail.membership.userId}/email`,
                                        'PUT',
                                        { email: values['email'] || null },
                                      ),
                                  })
                                }
                              >
                                Set email
                              </button>
                            </div>
                            <p className="help-text">
                              Coordinators and admins get a code at this address each time they sign
                              in to this panel. Changing it signs their panel sessions out of staff
                              powers until they enter a new code.
                            </p>
                          </section>
                        )}
                        <section className="drawer-section">
                          <div className="section-heading">
                            <h3>Name and identity</h3>
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() =>
                                openAction({
                                  title: 'Edit name',
                                  description: 'Their full name as it appears on their ID.',
                                  fields: [
                                    {
                                      key: 'fullName',
                                      label: 'Full name',
                                      value: detail.membership.user?.fullName ?? '',
                                      minLength: 2,
                                      maxLength: 100,
                                    },
                                  ],
                                  submit: (values) =>
                                    backend(`${membershipBase}/name`, 'PATCH', values),
                                  successMessage: () => 'Name saved.',
                                })
                              }
                            >
                              Edit name
                            </button>
                          </div>
                          {(() => {
                            const identity = detail.membership.user?.verifiedIdentity;
                            const status = identity?.verificationStatus ?? 'UNVERIFIED';
                            return (
                              <>
                                <dl className="facts">
                                  <dt>Identity</dt>
                                  <dd>
                                    <Badge value={status} />
                                  </dd>
                                  {status === 'VERIFIED' && identity?.documentType && (
                                    <>
                                      <dt>Checked</dt>
                                      <dd>
                                        {label(identity.documentType)} ending{' '}
                                        {identity.documentLast4}
                                        {identity.verifiedAt &&
                                          `, ${new Date(identity.verifiedAt).toLocaleDateString('en-IN')}`}
                                      </dd>
                                    </>
                                  )}
                                  {identity?.verificationNotes && (
                                    <>
                                      <dt>Notes</dt>
                                      <dd>{identity.verificationNotes}</dd>
                                    </>
                                  )}
                                  {status === 'REJECTED' && identity?.rejectionReason && (
                                    <>
                                      <dt>Not verified because</dt>
                                      <dd>{identity.rejectionReason}</dd>
                                    </>
                                  )}
                                </dl>
                                <p className="help-text">
                                  Verify only after seeing the original document with the person.
                                  Only the last 4 digits are kept. Verified members can receive
                                  gifted credits.
                                </p>
                                <div className="section-heading">
                                  <button
                                    className="btn btn-sm btn-primary"
                                    onClick={() =>
                                      openAction({
                                        title:
                                          status === 'VERIFIED'
                                            ? 'Verify identity again'
                                            : 'Verify identity',
                                        description:
                                          'Check the original document with the person present. The full number is used only to catch one document on two accounts and is not stored.',
                                        fields: [
                                          {
                                            key: 'documentType',
                                            label: 'Document checked',
                                            options: IDENTITY_DOCUMENTS,
                                          },
                                          {
                                            key: 'documentNumber',
                                            label: 'Document number',
                                            minLength: 4,
                                            maxLength: 40,
                                          },
                                          {
                                            key: 'notes',
                                            label: 'Notes',
                                            type: 'textarea',
                                            optional: true,
                                            maxLength: 500,
                                          },
                                        ],
                                        submit: (values) =>
                                          backend(`${membershipBase}/identity`, 'POST', {
                                            decision: 'VERIFY',
                                            documentType: values['documentType'],
                                            documentNumber: values['documentNumber'],
                                            ...(values['notes'] ? { notes: values['notes'] } : {}),
                                          }),
                                        successMessage: (result) =>
                                          `Identity verified (document ending ${(result as { documentLast4?: string } | undefined)?.documentLast4 ?? ''}).`,
                                      })
                                    }
                                  >
                                    {status === 'VERIFIED' ? 'Verify again' : 'Verify identity'}
                                  </button>
                                  <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() =>
                                      openAction({
                                        title: 'Not verified',
                                        fields: [
                                          {
                                            key: 'reason',
                                            label: 'Reason',
                                            type: 'textarea',
                                            maxLength: 500,
                                          },
                                        ],
                                        submit: (values) =>
                                          backend(`${membershipBase}/identity`, 'POST', {
                                            decision: 'REJECT',
                                            reason: values['reason'],
                                          }),
                                        successMessage: () => 'Marked as not verified.',
                                      })
                                    }
                                  >
                                    Not verified
                                  </button>
                                </div>
                              </>
                            );
                          })()}
                        </section>
                        <WardNocSection
                          organizationId={detail.membership.organizationId}
                          ward={detail.membership.ward}
                          noc={detail.membership.noc}
                          canReview={
                            detail.membership.userId !== profile?.id &&
                            ['APPLIED', 'PENDING_REVIEW', 'REJECTED', 'APPROVED'].includes(
                              detail.membership.status,
                            )
                          }
                          openAction={openAction}
                          onExpired={expired}
                        />
                        <section className="drawer-section">
                          <h3>Supporting documents</h3>
                          {detail.documents.filter((d) => d.documentType !== 'WARD_NOC').length ===
                            0 && <p className="help-text">No supporting documents submitted.</p>}
                          {detail.documents
                            .filter((d) => d.documentType !== 'WARD_NOC')
                            .map((document) => (
                              <div className="document-row" key={document.id}>
                                <div>
                                  {label(document.documentType)}{' '}
                                  <Badge value={document.reviewStatus} />
                                  <div className="mono">{document.storageKey}</div>
                                </div>
                                <button
                                  className="btn btn-sm btn-secondary"
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
                                  Review
                                </button>
                              </div>
                            ))}
                        </section>
                        <section className="drawer-section">
                          <div className="section-heading">
                            <h3>Active roles</h3>
                            {canManageRoles && detail.membership.status === 'APPROVED' && (
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() =>
                                  openAction({
                                    title: 'Grant organization role',
                                    fields: [{ key: 'role', label: 'Role', options: initialRoles }],
                                    submit: (values) =>
                                      backend(`${membershipBase}/roles`, 'POST', values),
                                  })
                                }
                              >
                                <Icon name="plus" />
                                Grant role
                              </button>
                            )}
                          </div>
                          {detail.membership.roleGrants.filter((grant) => grant.status === 'ACTIVE')
                            .length === 0 && <p className="help-text">No active roles.</p>}
                          {detail.membership.roleGrants
                            .filter((grant) => grant.status === 'ACTIVE')
                            .map((grant) => (
                              <div className="document-row" key={grant.id}>
                                {label(grant.role)}
                                {canManageRoles &&
                                  grant.role !== 'SUPER_ADMIN' &&
                                  (isGlobal || grant.role !== 'MUNICIPALITY_ADMIN') && (
                                    <button
                                      className="btn btn-sm btn-danger"
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
                                      Revoke
                                    </button>
                                  )}
                              </div>
                            ))}
                          {detail.membership.roleGrants
                            .filter((grant) => grant.status === 'PENDING_APPROVAL')
                            .map((grant) => (
                              <div className="document-row" key={grant.id}>
                                <span>
                                  {label(grant.role)}{' '}
                                  <span className="help-text">
                                    · waiting for a second Super Admin
                                  </span>
                                </span>
                                {isGlobal && (
                                  <span>
                                    <button
                                      className="btn btn-sm btn-success"
                                      onClick={() =>
                                        openAction({
                                          title: 'Approve Super Admin',
                                          submitLabel: 'Approve',
                                          description:
                                            'This person gets full platform access. Only a Super Admin other than the one who asked can approve.',
                                          fields: [],
                                          submit: () =>
                                            backend(
                                              `/admin/organizations/${detail.membership.organizationId}/roles/${grant.id}/approve`,
                                              'POST',
                                              {},
                                            ),
                                        })
                                      }
                                    >
                                      Approve
                                    </button>{' '}
                                    <button
                                      className="btn btn-sm btn-danger"
                                      onClick={() =>
                                        openAction({
                                          title: 'Cancel Super Admin request',
                                          submitLabel: 'Cancel request',
                                          fields: [{ key: 'reason', label: 'Reason' }],
                                          submit: (values) =>
                                            backend(
                                              `/admin/organizations/${detail.membership.organizationId}/roles/${grant.id}`,
                                              'DELETE',
                                              values,
                                            ),
                                        })
                                      }
                                    >
                                      Cancel
                                    </button>
                                  </span>
                                )}
                              </div>
                            ))}
                        </section>
                      </div>
                      {['APPLIED', 'PENDING_REVIEW'].includes(detail.membership.status) && (
                        <div className="drawer-footer">
                          <button
                            className="btn btn-danger"
                            onClick={() =>
                              openAction({
                                title: 'Reject membership',
                                submitLabel: 'Reject',
                                fields: [{ key: 'reason', label: 'Rejection reason' }],
                                submit: (values) =>
                                  backend(`${membershipBase}/reject`, 'POST', values),
                              })
                            }
                          >
                            Reject
                          </button>
                          {detail.membership.noc?.status !== 'APPROVED' && (
                            <p className="help-text">
                              Accept the member’s ward NOC before approving.
                            </p>
                          )}
                          <button
                            className="btn btn-success"
                            disabled={detail.membership.noc?.status !== 'APPROVED'}
                            onClick={() =>
                              openAction({
                                title: 'Approve membership',
                                submitLabel: 'Approve',
                                description: detail.membership.ward
                                  ? `${wardLabel(detail.membership.ward)}. Its NOC has been accepted. Choose the initial role.`
                                  : 'The ward NOC has been accepted. Choose the initial role.',
                                fields: [
                                  {
                                    key: 'initialRole',
                                    label: 'Initial role',
                                    options: initialRoles,
                                    ...(detail.membership.requestedRole &&
                                    initialRoles.includes(detail.membership.requestedRole)
                                      ? { value: detail.membership.requestedRole }
                                      : {}),
                                  },
                                  { key: 'notes', label: 'Approval notes', optional: true },
                                ],
                                submit: (values) =>
                                  backend(`${membershipBase}/approve`, 'POST', values),
                              })
                            }
                          >
                            <Icon name="check" />
                            Approve membership
                          </button>
                        </div>
                      )}
                    </aside>
                  </>,
                  document.body,
                )}
            </>
          )}
          {tab === 'restrictions' && (
            <RestrictionCases
              key={tenant}
              organizationId={tenant === 'GLOBAL' ? null : tenant}
              isGlobal={isGlobal}
              canDecide={canManageRoles}
              revision={revision}
              pending={pending}
              openAction={openAction}
              onExpired={expired}
            />
          )}
          {tab === 'closures' && (
            <Closures
              key={tenant}
              organizationId={tenant === 'GLOBAL' ? null : tenant}
              isGlobal={isGlobal}
              canDecide={canManageRoles}
              revision={revision}
              pending={pending}
              openAction={openAction}
              onExpired={expired}
            />
          )}
          {tab === 'phone-recoveries' && (
            <PhoneRecoveries
              key={tenant}
              organizationId={tenant === 'GLOBAL' ? null : tenant}
              isGlobal={isGlobal}
              canDecide={canManageRoles}
              revision={revision}
              pending={pending}
              openAction={openAction}
              onExpired={expired}
            />
          )}
          {tab === 'reports' && canManageRoles && (
            <Reports
              key={tenant}
              organizationId={tenant === 'GLOBAL' ? null : tenant}
              revision={revision}
              pending={pending}
              openAction={openAction}
              onExpired={expired}
            />
          )}
          {tab === 'audit' && (
            <>
              <div className="toolbar">
                <label>
                  Event type
                  <input
                    className="form-input"
                    value={eventType}
                    placeholder="e.g. MEMBERSHIP_APPROVED"
                    disabled={pending}
                    onChange={(event) => {
                      setEventType(event.target.value.trim().toUpperCase());
                      setOffset(0);
                    }}
                  />
                </label>
                <p className="help-text">
                  {tenant === 'GLOBAL'
                    ? 'Showing events across all organizations.'
                    : `Showing events for ${selectedOrg?.name ?? 'the selected organization'}.`}
                </p>
              </div>
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
                        <td>{label(event.eventType)}</td>
                        <td className="mono">{event.actorId?.slice(0, 8) ?? 'System'}</td>
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
                            <summary>Details</summary>
                            <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!loading && !error && view.total === 0 && (
                  <p className="empty-state">No events match this scope and filter.</p>
                )}
              </div>
            </>
          )}
          {(tab === 'audit' || (tab === 'memberships' && tenant !== 'GLOBAL')) &&
            view.total > 0 && (
              <div className="pagination">
                <span>
                  Showing {offset + 1}–{Math.min(offset + 20, view.total)} of {view.total}
                </span>
                <div className="action-row">
                  <button
                    className="btn btn-sm btn-secondary"
                    disabled={loading || pending || offset === 0}
                    onClick={() => setOffset((value) => Math.max(0, value - 20))}
                  >
                    <Icon name="chevronLeft" />
                    Previous
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    disabled={loading || pending || offset + 20 >= view.total}
                    onClick={() => setOffset((value) => value + 20)}
                  >
                    Next
                    <Icon name="chevronRight" />
                  </button>
                </div>
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
