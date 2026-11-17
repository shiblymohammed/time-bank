'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Action } from '@/lib/admin-types';
import { CoordinatorRequests } from '@/components/coordinator-requests';
import { CommunityAnnouncements } from '@/components/community-announcements';
import { ServiceCatalogue } from '@/components/service-catalogue';
import { SafetyAlerts, useOpenSafetyAlerts } from '@/components/safety-alerts';
import { Complaints, useOpenComplaints } from '@/components/complaints';
import { RestrictionCases, useWaitingRestrictions } from '@/components/restriction-cases';
import { Closures, useWaitingClosures } from '@/components/closures';
import { Reports } from '@/components/reports';
import { ActivityTrend, OrganizationReadiness } from '@/components/dashboard-charts';
import type { ActivityPoint } from '@/components/dashboard-charts';
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
import { AshokaChakra, BrandMark, Icon, type IconName } from '@/components/icons';
import { api, ApiError, backend } from '@/lib/api';
import { firebaseMessage, sendPhoneCode, type FirebaseWebConfig } from '@/lib/firebase-phone';

type Tab =
  | 'overview'
  | 'organizations'
  | 'memberships'
  | 'requests'
  | 'community'
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
    participationIntent?: 'VOLUNTEER' | 'HELP' | 'BOTH';
    helpFor?: 'BENEFICIARY' | 'CAREGIVER';
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
type AdminNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  createdAt: string;
  sentAt: string | null;
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
  activityTrend?: ActivityPoint[];
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
  /** Coordinator-facing wording where the task is narrower than administration. */
  coordinatorText?: string;
  coordinatorDescription?: string;
  centralOnly?: boolean;
  /** Municipality Admins and Super Admins. */
  managersOnly?: boolean;
}[] = [
  {
    id: 'overview',
    text: 'Overview',
    icon: 'overview',
    group: '',
    description:
      'Monitor participation, organization readiness and review activity across the time bank.',
    centralOnly: true,
  },
  {
    id: 'organizations',
    text: 'Organizations',
    icon: 'organizations',
    group: 'Staff Console',
    description: 'Organizations, their status and branding',
    coordinatorText: 'My Municipality',
    coordinatorDescription: 'View your municipality and its wards',
  },
  {
    id: 'memberships',
    text: 'Memberships',
    icon: 'memberships',
    group: 'Staff Console',
    description: 'Review membership applications and manage member access',
    coordinatorDescription: 'Review applications and member eligibility for your municipality',
  },
  {
    id: 'requests',
    text: 'Requests & Matching',
    icon: 'requests',
    group: 'Staff Console',
    description: 'Review help requests and match members with volunteers',
  },
  {
    id: 'community',
    text: 'Community Updates',
    icon: 'organizations',
    group: 'Staff Console',
    description: 'Publish local announcements and moderate community posts',
  },
  {
    id: 'safety',
    text: 'Safety Alerts',
    icon: 'safety',
    group: 'Staff Console',
    description: 'Respond to safety alerts and visits paused or ended for safety',
  },
  {
    id: 'complaints',
    text: 'Complaints',
    icon: 'complaints',
    group: 'Staff Console',
    description: 'Handle confidential complaints assigned to your municipality',
  },
  {
    id: 'catalogue',
    text: 'Service Catalogue',
    icon: 'catalogue',
    group: 'Services',
    description: 'Manage services members can offer and request locally',
  },
  {
    id: 'operations',
    text: 'Service Operations',
    icon: 'operations',
    group: 'Services',
    description: 'Track service bookings, completions and the resulting time credits',
  },
  {
    id: 'credits',
    text: 'Time Credits',
    icon: 'wallet',
    group: 'Governance',
    description: 'Review member wallets, local credit activity and community pools',
  },

  {
    id: 'loyalty',
    text: 'Loyalty & Merchants',
    icon: 'wallet',
    group: 'Governance',
    description: 'Manage local merchants, offers and community recognition',
  },
  {
    id: 'restrictions',
    text: 'Restrictions',
    icon: 'restrictions',
    group: 'Governance',
    description: 'Review restriction cases, reinstatement requests and appeals',
    coordinatorText: 'Restriction Recommendations',
    coordinatorDescription: 'Recommend a restriction for Municipality Admin review; recommendations do not take effect until approved',
  },
  {
    id: 'closures',
    text: 'Account Closures',
    icon: 'closures',
    group: 'Governance',
    description: 'Report deaths or duplicate accounts and recommend what happens to remaining credits',
    coordinatorText: 'Closure Reports',
    coordinatorDescription: 'Report a death or duplicate account and recommend a credit transfer for admin review',
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
    text: 'Phone Number Changes',
    icon: 'phoneRecovery',
    group: 'Governance',
    description: 'Help members recover an account after losing a phone or SIM',
    coordinatorText: 'Phone Recovery',
    coordinatorDescription: 'Review lost-phone or SIM recovery cases; higher-risk changes need Super Admin approval',
  },
  {
    id: 'audit',
    text: 'Audit Trail',
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
const coordinatorMembership = (profile: Profile) =>
  approved(profile).find((member) => member.roles.includes('COORDINATOR'));
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
function OrganizationScopeSelect({
  organizations,
  value,
  includeGlobal,
  disabled,
  onChange,
}: {
  organizations: Organization[];
  value: string;
  includeGlobal: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = [
    ...(includeGlobal
      ? [{ id: 'GLOBAL', name: 'All organizations', district: 'Platform-wide scope', type: '' }]
      : []),
    ...organizations,
  ];
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.id === value),
  );
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selected = items[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    return () => document.removeEventListener('mousedown', closeOutside);
  }, [open]);

  function choose(index: number) {
    const item = items[index];
    if (!item) return;
    onChange(item.id);
    setActiveIndex(index);
    setOpen(false);
    trigger.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setActiveIndex(selectedIndex);
        setOpen(true);
      } else {
        setActiveIndex(
          (index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length,
        );
      }
    } else if (event.key === 'Home' && open) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End' && open) {
      event.preventDefault();
      setActiveIndex(items.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        setActiveIndex(selectedIndex);
        setOpen(true);
      } else choose(activeIndex);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className={`scope-select ${open ? 'is-open' : ''}`} ref={root}>
      <button
        id="tenant-select"
        ref={trigger}
        type="button"
        role="combobox"
        className="scope-select-trigger"
        aria-labelledby="organization-scope-label"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="tenant-options"
        aria-activedescendant={open ? `tenant-option-${activeIndex}` : undefined}
        disabled={disabled || items.length === 0}
        onClick={() => {
          setActiveIndex(selectedIndex);
          setOpen((current) => !current);
        }}
        onKeyDown={handleKeyDown}
      >
        <span className="scope-current-icon">
          <Icon name="organizations" />
        </span>
        <span className="scope-current-text">
          <strong>{selected?.name ?? 'Choose an organization'}</strong>
          <small>
            {selected?.id === 'GLOBAL'
              ? 'Platform-wide scope'
              : selected
                ? `${selected.district} · ${label(selected.type)}`
                : 'No organizations available'}
          </small>
        </span>
        <span className="scope-chevron">
          <Icon name="chevronRight" />
        </span>
      </button>
      {open && (
        <div
          className="scope-options"
          id="tenant-options"
          role="listbox"
          aria-label="Choose organization"
        >
          <div className="scope-options-label">Available organizations</div>
          {items.map((item, index) => (
            <button
              key={item.id}
              id={`tenant-option-${index}`}
              type="button"
              role="option"
              aria-selected={item.id === value}
              className={`scope-option ${item.id === value ? 'selected' : ''} ${index === activeIndex ? 'active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              <span className="scope-option-mark">
                <Icon name="organizations" />
              </span>
              <span className="scope-option-text">
                <strong>{item.name}</strong>
                <small>
                  {item.id === 'GLOBAL'
                    ? 'View platform-wide records'
                    : `${item.district} · ${label(item.type)}`}
                </small>
              </span>
              {item.id === value && (
                <span className="scope-option-check">
                  <Icon name="check" />
                </span>
              )}
            </button>
          ))}
          {items.length === 0 && <p className="scope-options-empty">No organizations available.</p>}
        </div>
      )}
    </div>
  );
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [notificationsRevision, setNotificationsRevision] = useState(0);
  const mobileMenu = useRef<HTMLButtonElement>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]),
    [wardCounts, setWardCounts] = useState<Record<string, number | null>>({}),
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
  const isCoordinatorOnly = Boolean(
    profile &&
      !isGlobal &&
      coordinatorMembership(profile) &&
      !approved(profile).some((member) => member.roles.includes('MUNICIPALITY_ADMIN')),
  );
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
  ).map((page) =>
    isCoordinatorOnly
      ? {
          ...page,
          text: page.coordinatorText ?? page.text,
          description: page.coordinatorDescription ?? page.description,
        }
      : page,
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
    setTenant((previous) => {
      if (central) return previous;
      const coordinatorOrg = coordinatorMembership(next)?.organizationId;
      if (
        coordinatorOrg &&
        !approved(next).some((member) => member.roles.includes('MUNICIPALITY_ADMIN'))
      )
        return coordinatorOrg;
      return staffMemberships(next).some((member) => member.organizationId === previous)
        ? previous
        : (staffMemberships(next)[0]?.organizationId ?? 'GLOBAL');
    });
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
          'community',
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
  const expired = useCallback(() => {
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
    setNotificationsOpen(false);
    setNotifications([]);
  }, []);
  useEffect(() => {
    if (!notificationsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [notificationsOpen]);
  useEffect(() => {
    if (!notificationsOpen || !profile) return;
    const controller = new AbortController();
    setNotificationsLoading(true);
    setNotificationsError('');
    void backend<{ items: AdminNotification[] }>(
      '/notifications/inbox',
      'GET',
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setNotifications(result.items);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 401) {
          expired();
          return;
        }
        setNotificationsError(
          cause instanceof Error ? cause.message : 'Could not load notifications.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setNotificationsLoading(false);
      });
    return () => controller.abort();
  }, [notificationsOpen, notificationsRevision, profile, expired]);
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
      const coordinatorOrg = isCoordinatorOnly ? coordinatorMembership(profile!)?.organizationId : null;
      setOrganizations(
        isGlobal
          ? result.data
          : result.data.filter(
              (organization) =>
                allowed.has(organization.id) &&
                (!coordinatorOrg || organization.id === coordinatorOrg),
            ),
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
      if (tab === 'overview' && isGlobal)
        next.events = (
          await backend<{ events: Audit[]; total: number }>(
            '/admin/audit-logs?limit=4&offset=0',
            'GET',
            undefined,
            controller.signal,
          )
        ).events;
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
  useEffect(() => {
    if (tab !== 'organizations' || !profile || organizations.length === 0) return;
    let active = true;
    Promise.all(
      organizations.map(async (organization) => {
        try {
          const wards = await backend<Ward[]>(`/organizations/${organization.id}/wards/manage`);
          return [organization.id, wards.length] as const;
        } catch {
          return [organization.id, null] as const;
        }
      }),
    ).then((results) => {
      if (active) setWardCounts((current) => ({ ...current, ...Object.fromEntries(results) }));
    });
    return () => {
      active = false;
    };
  }, [tab, profile, organizations, revision]);
  // Search once typing pauses, not on every letter.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchText.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);
  function changeScope(value: string) {
    if (isCoordinatorOnly && value !== coordinatorMembership(profile!)?.organizationId) return;
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
    if (menuOpen) mobileMenu.current?.focus();
    setMenuOpen(false);
    setTab(value);
    setStatus('');
    setSearch('');
    setSearchText('');
    setOffset(0);
    setDetail(null);
    setView(empty());
    setNotice('');
  }
  async function refreshDashboard() {
    setPending(true);
    setNotice('');
    try {
      signedIn(await api<Profile>('/api/session'));
      setRevision((value) => value + 1);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) expired();
      else setError(cause instanceof Error ? cause.message : 'Unable to refresh');
    } finally {
      setPending(false);
    }
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
      <aside
        className="sidebar"
        data-menu-open={menuOpen}
        inert={action !== null || detail !== null}
      >
        <div className="brand-badge modern-brand-badge">
          <div className="brand-icon">
            <BrandMark size={36} />
          </div>
          <div className="brand-info">
            <div className="brand-title">Indian Time Bank</div>
            <div className="brand-subtitle">Administration Workspace</div>
          </div>
        </div>
        <button
          className="sidebar-menu-toggle"
          type="button"
          ref={mobileMenu}
          aria-expanded={menuOpen}
          aria-controls="dashboard-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span>
            Menu <small>{page?.text}</small>
          </span>
          <Icon name="chevronRight" />
        </button>
        <nav className="nav-group" id="dashboard-navigation" aria-label="Dashboard">
          {tabs.map((item, index) => (
            <React.Fragment key={item.id}>
              {item.group && tabs[index - 1]?.group !== item.group && (
                <div className="nav-section">{item.group}</div>
              )}
              <button
                id={`nav-${item.id}`}
                className={`nav-item ${tab === item.id ? 'active' : ''}`}
                aria-current={tab === item.id ? 'page' : undefined}
                title={`${item.text}: ${item.description}`}
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
        <div className="sidebar-footer modern-sidebar-footer">
          <div className="footer-account-icon" aria-hidden="true">
            <Icon name="users" size={17} />
          </div>
          <div className="user-meta footer-meta-info">
            <p className="footer-phone-number">{phone(profile.phoneE164)}</p>
            <p className="footer-role-label">
              {isGlobal
                ? 'Central administrator'
                : isStaffScope
                  ? 'Organization staff'
                  : 'Merchant'}
            </p>
          </div>
          <button
            type="button"
            className="footer-logout-button"
            title={pending ? 'Signing out' : 'Sign out'}
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
            <Icon name="logout" size={15} />
            <span className="sr-only">{pending ? 'Signing out' : 'Sign out'}</span>
          </button>
        </div>

        {/* Soft Blended Indian Flag Light-Fade Gradient at Sidebar Bottom */}
        <div className="sidebar-bottom-tiranga" aria-hidden="true">
          <div className="tiranga-light-blend" />
          <div className="bottom-ashoka-chakra">
            <AshokaChakra size={44} color="rgba(255, 255, 255, 0.18)" />
          </div>
        </div>
      </aside>
      <div className="main-wrapper" inert={action !== null || detail !== null || notificationsOpen}>
        {tab !== 'overview' && (
          <header
            className={`top-bar ${['restrictions', 'closures', 'phone-recoveries'].includes(tab) ? 'governance-topbar' : ''}`}
          >
            <div className="top-bar-inner">
              <div className="page-title">
                <span className="page-kicker">
                  {page?.group && (
                    <>
                      {page.group} <span aria-hidden="true">/</span>{' '}
                    </>
                  )}
                  {page?.text}
                </span>
                <h1>{page?.text}</h1>
                <p>{page?.description}</p>
              </div>
              <div className="top-actions">
                <div className="scope-label">
                  <span id="organization-scope-label" className="scope-label-heading">
                    <Icon name="organizations" /> Organization scope
                  </span>
                  {isCoordinatorOnly ? (
                    <div className="scope-select-trigger" aria-label="Assigned organization">
                      <span className="scope-current-icon"><Icon name="organizations" /></span>
                      <span className="scope-current-text">
                        <strong>{selectedOrg?.name ?? 'Assigned organization'}</strong>
                        <small>Coordinator access · organization locked</small>
                      </span>
                    </div>
                  ) : (
                    <OrganizationScopeSelect
                      organizations={organizations}
                      value={tenant}
                      includeGlobal={isGlobal}
                      disabled={pending}
                      onChange={changeScope}
                    />
                  )}
                </div>
                <button
                  className="btn btn-secondary"
                  title="Reload from the server"
                  disabled={pending || loading}
                  onClick={() => void refreshDashboard()}
                >
                  <Icon name="refresh" />
                  Refresh data
                </button>
                {/* Date Pill */}
                <div className="modern-date-pill">
                  <Icon name="calendar" />
                  <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <Icon name="chevronRight" />
                </div>
                {/* Notification Bell */}
                <button
                  className="modern-bell-btn"
                  type="button"
                  title="Notifications"
                  aria-label="Notifications"
                  aria-expanded={notificationsOpen}
                  onClick={() => setNotificationsOpen(true)}
                >
                  <Icon name="bell" />
                  {notifications.length > 0 && <span className="bell-red-badge" />}
                </button>
                {/* Profile Pill */}
                <div className="modern-profile-pill" title="Super Admin Account">
                  <span className="profile-pill-avatar">S</span>
                  <span className="profile-pill-name">Super Admin</span>
                  <Icon name="chevronRight" />
                </div>
              </div>
            </div>
          </header>
        )}
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
            <div className="overview-dashboard modern-overview-dashboard">
              <div className="overview-intro modern-overview-header">
                <div className="modern-header-left">
                  <h1 className="modern-dashboard-title">Dashboard</h1>
                  <p className="modern-dashboard-sub">Welcome back! Here&apos;s what&apos;s happening with Indian Time Bank.</p>
                </div>
                <div className="overview-tools modern-header-tools">
                  {/* Organization switch dropdown for Super Admin */}
                  {isGlobal && (
                    <div className="overview-scope-wrapper">
                      <OrganizationScopeSelect
                        organizations={organizations}
                        value={tenant}
                        includeGlobal={isGlobal}
                        disabled={pending}
                        onChange={changeScope}
                      />
                    </div>
                  )}
                  {/* Date Pill */}
                  <div className="modern-date-pill">
                    <Icon name="calendar" />
                    <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <Icon name="chevronRight" />
                  </div>
                  {/* Notification Bell */}
                  <button
                    className="modern-bell-btn"
                    type="button"
                    title="Notifications"
                    aria-label="Notifications"
                    aria-expanded={notificationsOpen}
                    onClick={() => setNotificationsOpen(true)}
                  >
                    <Icon name="bell" />
                    {notifications.length > 0 && <span className="bell-red-badge" />}
                  </button>
                  {/* Profile Pill */}
                  <div className="modern-profile-pill" title="Super Admin Account">
                    <span className="profile-pill-avatar">S</span>
                    <span className="profile-pill-name">Super Admin</span>
                    <Icon name="chevronRight" />
                  </div>
                </div>
              </div>

              {/* Row 1: 5 KPI Metric Cards */}
              <div className="metric-grid modern-kpi-row">
                {[
                  {
                    name: 'Registered Users',
                    val: view.metrics.totalUsers,
                    icon: 'users',
                    color: '#2563EB',
                    glow: 'rgba(37, 99, 235, 0.08)',
                    tone: 'blue',
                    pill: 'Verified members',
                    tab: 'memberships',
                  },
                  {
                    name: 'Organizations',
                    val: view.metrics.totalOrganizations,
                    icon: 'organizations',
                    color: '#059669',
                    glow: 'rgba(5, 150, 105, 0.08)',
                    tone: 'emerald',
                    pill: 'Registered chapters',
                    tab: 'organizations',
                  },
                  {
                    name: 'Active Organizations',
                    val: view.metrics.activeOrganizations,
                    icon: 'check',
                    color: '#7C3AED',
                    glow: 'rgba(124, 58, 237, 0.08)',
                    tone: 'purple',
                    pill: '100% operational',
                    tab: 'organizations',
                  },
                  {
                    name: 'Time Wallets',
                    val: view.metrics.totalUniversalWallets,
                    icon: 'wallet',
                    color: '#D97706',
                    glow: 'rgba(217, 119, 6, 0.08)',
                    tone: 'amber',
                    pill: 'Universal ledger',
                    tab: 'credits',
                  },
                  {
                    name: 'Time Credits',
                    val: view.metrics.totalBalanceCredits,
                    icon: 'clock',
                    color: '#0284C7',
                    glow: 'rgba(2, 132, 199, 0.08)',
                    tone: 'cyan',
                    pill: 'Hours in circulation',
                    tab: 'credits',
                  },
                ].map((kpi) => (
                  <button
                    type="button"
                    className={`modern-kpi-card kpi-tone-${kpi.tone}`}
                    key={kpi.name}
                    onClick={() => changeTab(kpi.tab as any)}
                    title={`View ${kpi.name}`}
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
                  </button>
                ))}
              </div>

              {/* Row 2: Action Attention Cards */}
              <section className="overview-actions modern-actions-row" aria-label="Items awaiting attention">
                <button
                  type="button"
                  className="modern-action-card card-pending"
                  onClick={() => {
                    changeTab('memberships');
                    setStatus('APPLIED');
                  }}
                >
                  <span className="action-circle-badge icon-crown">
                    <Icon name="crown" />
                  </span>
                  <span className="action-label-and-count">
                    <span className="action-card-label">Pending Memberships</span>
                    <strong className="action-card-count">{view.metrics.pendingMemberships}</strong>
                  </span>
                  <span className="action-circle-arrow" aria-hidden="true">
                    <Icon name="arrowRight" />
                  </span>
                </button>
                <button
                  type="button"
                  className="modern-action-card card-approvals"
                  onClick={() => {
                    const person = view.metrics?.pendingSuperAdmins[0];
                    if (!person) {
                      changeTab('memberships');
                      return;
                    }
                    setTenant(person.organizationId);
                    changeTab('memberships');
                    void review({
                      id: person.membershipId,
                      organizationId: person.organizationId,
                    } as Membership);
                  }}
                >
                  <span className="action-circle-badge icon-shield">
                    <Icon name="safety" />
                  </span>
                  <span className="action-label-and-count">
                    <span className="action-card-label">Super Admins Awaiting Approval</span>
                    <strong className="action-card-count">{view.metrics.pendingSuperAdminCount}</strong>
                  </span>
                  <span className="action-circle-arrow" aria-hidden="true">
                    <Icon name="arrowRight" />
                  </span>
                </button>
              </section>

              {/* Row 3: Analytics / Charts */}
              <div className="overview-insights modern-charts-row">
                <ActivityTrend points={view.metrics.activityTrend} />
                <OrganizationReadiness
                  active={view.metrics.activeOrganizations}
                  total={view.metrics.totalOrganizations}
                />
              </div>

              {/* Row 4: Recent Activity */}
              <section className="glass-panel modern-activity-panel">
                <div className="activity-panel-header">
                  <div className="heading-with-icon">
                    <span className="panel-heading-icon lightning-icon">
                      <Icon name="lightning" />
                    </span>
                    <div>
                      <h3>Recent Activity</h3>
                      <p>Latest updates from your platform</p>
                    </div>
                  </div>
                  <button type="button" className="modern-view-audit-btn" onClick={() => changeTab('audit')}>
                    View All Activity <span aria-hidden="true">→</span>
                  </button>
                </div>
                <div className="modern-activity-triplet">
                  <div className="activity-item-card">
                    <div className="activity-circle-badge badge-blue">
                      <Icon name="users" />
                    </div>
                    <div className="activity-item-details">
                      <strong>New organization registered</strong>
                      <span>2 hours ago</span>
                    </div>
                  </div>
                  <div className="activity-item-card">
                    <div className="activity-circle-badge badge-green">
                      <Icon name="check" />
                    </div>
                    <div className="activity-item-details">
                      <strong>Membership request approved</strong>
                      <span>4 hours ago</span>
                    </div>
                  </div>
                  <div className="activity-item-card">
                    <div className="activity-circle-badge badge-purple">
                      <Icon name="bell" />
                    </div>
                    <div className="activity-item-details">
                      <strong>New user joined</strong>
                      <span>1 day ago</span>
                    </div>
                  </div>
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
          {tab === 'community' &&
            (tenant === 'GLOBAL' ? (
              <p className="glass-panel empty-state">
                Choose an organization to manage its announcements and reports.
              </p>
            ) : (
              <CommunityAnnouncements key={tenant} organizationId={tenant} revision={revision} />
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
              canPropose={isStaffScope && tenant !== 'GLOBAL'}
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
              {/* Organizations Top KPI Cards */}
              <div className="coordinator-kpi-row" style={{ marginTop: '16px' }}>
                {[
                  {
                    name: 'Total Chapters',
                    val: shownOrgs.length,
                    icon: 'organizations',
                    color: '#2563EB',
                    glow: 'rgba(37, 99, 235, 0.08)',
                    tone: 'blue',
                    pill: 'Local administrative units',
                  },
                  {
                    name: 'Active Organizations',
                    val: shownOrgs.filter((o) => o.status === 'ACTIVE').length,
                    icon: 'check',
                    color: '#059669',
                    glow: 'rgba(5, 150, 105, 0.08)',
                    tone: 'emerald',
                    pill: 'Fully operational',
                  },
                  {
                    name: 'Pending / Inactive',
                    val: shownOrgs.filter((o) => o.status !== 'ACTIVE').length,
                    icon: 'clock',
                    color: '#D97706',
                    glow: 'rgba(217, 119, 6, 0.08)',
                    tone: 'amber',
                    pill: 'Draft or suspended',
                  },
                  {
                    name: 'Total Wards',
                    val:
                      shownOrgs.length > 0 &&
                      shownOrgs.every((organization) => wardCounts[organization.id] !== undefined && wardCounts[organization.id] !== null)
                        ? shownOrgs.reduce((total, organization) => total + (wardCounts[organization.id] ?? 0), 0)
                        : '—',
                    icon: 'organizations',
                    color: '#7C3AED',
                    glow: 'rgba(124, 58, 237, 0.08)',
                    tone: 'purple',
                    pill: tenant === 'GLOBAL' ? 'Across listed organizations' : 'In this organization',
                  },
                ].map((kpi) => (
                  <div
                    className={`modern-kpi-card kpi-tone-${kpi.tone}`}
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

              <div className="section-heading" style={{ marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                    Network Chapters & Communities
                  </h3>
                  <span className="record-count" style={{ fontSize: '0.80rem', color: '#64748b' }}>
                    {shownOrgs.length} organization{shownOrgs.length === 1 ? '' : 's'} registered
                  </span>
                </div>
                {isGlobal && (
                  <button
                    className="btn btn-primary btn-create"
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
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Icon name="plus" size={16} />
                    Create organization
                  </button>
                )}
              </div>
              <div className="table-container glass-panel modern-table-container">
                <table className="custom-table organization-table">
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
                          <div className="organization-identity">
                            <span className="organization-mark" aria-hidden="true">
                              <Icon name="organizations" />
                            </span>
                            <span>
                              <strong>{organization.name}</strong>
                              <span className="organization-code">{organization.code}</span>
                            </span>
                          </div>
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
                            <span className="branding-empty">
                              <i />
                              Not configured
                            </span>
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
                                className="btn btn-warning"
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
                                className="btn btn-branding"
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
                  {/* Memberships Top Summary Cards */}
                  <div className="coordinator-kpi-row" style={{ marginTop: '16px' }}>
                    {[
                      {
                        name: 'Total Members',
                        val: view.total,
                        icon: 'users',
                        color: '#2563EB',
                        glow: 'rgba(37, 99, 235, 0.08)',
                        tone: 'blue',
                        pill: 'Registered in chapter',
                      },
                      {
                        name: 'Awaiting Review',
                        val: view.memberships.filter((m) => ['APPLIED', 'PENDING_REVIEW'].includes(m.status)).length,
                        icon: 'clock',
                        color: '#D97706',
                        glow: 'rgba(217, 119, 6, 0.08)',
                        tone: 'amber',
                        pill: 'Applications pending',
                      },
                      {
                        name: 'Active Members',
                        val: view.memberships.filter((m) => m.status === 'APPROVED').length,
                        icon: 'check',
                        color: '#059669',
                        glow: 'rgba(5, 150, 105, 0.08)',
                        tone: 'emerald',
                        pill: 'In good standing',
                      },
                      {
                        name: 'ID Verified',
                        val: view.memberships.filter((m) => m.user?.verifiedIdentity?.verificationStatus === 'VERIFIED').length,
                        icon: 'crown',
                        color: '#7C3AED',
                        glow: 'rgba(124, 58, 237, 0.08)',
                        tone: 'purple',
                        pill: 'Government ID verified',
                      },
                    ].map((kpi) => (
                      <div
                        className={`modern-kpi-card kpi-tone-${kpi.tone}`}
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

                  {/* Filter Toolbar */}
                  <div className="coordinator-filter-toolbar">
                    <div className="filter-left">
                      <div className="filter-group">
                        <span className="filter-label">Status</span>
                        <select
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
                      </div>
                      <div className="filter-group">
                        <span className="filter-label">Search</span>
                        <input
                          type="search"
                          placeholder="Name, membership number or phone"
                          value={searchText}
                          onChange={(event) => setSearchText(event.target.value)}
                          style={{ minWidth: '260px' }}
                        />
                      </div>
                    </div>
                    <div className="filter-right">
                      <span className="record-count" style={{ fontSize: '0.80rem', fontWeight: 650, color: '#64748b' }}>
                        {view.total.toLocaleString()} member{view.total === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <div className="table-container glass-panel modern-table-container">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th style={{ width: '28%' }}>Member</th>
                          <th style={{ width: '15%' }}>Status</th>
                          <th style={{ width: '15%' }}>Membership No.</th>
                          <th style={{ width: '18%' }}>Ward & NOC</th>
                          <th style={{ width: '14%' }}>Roles</th>
                          <th style={{ width: '10%', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.memberships.map((member) => (
                          <tr key={member.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div className="volunteer-avatar-badge" style={{ flexShrink: 0 }}>
                                  {(member.user?.fullName || member.membershipNumber || 'M')[0]?.toUpperCase()}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <strong style={{ fontSize: '0.88rem', color: '#0f172a' }}>
                                      {member.user?.fullName ?? (
                                        <span className="help-text">No name yet</span>
                                      )}
                                    </strong>
                                    {member.user?.verifiedIdentity?.verificationStatus === 'VERIFIED' && (
                                      <Badge value="ID_VERIFIED" />
                                    )}
                                  </div>
                                  <span className="mono" style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                    {phone(member.user?.phoneE164) ?? 'Unknown number'}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <Badge value={member.status} />
                            </td>
                            <td>
                              {member.membershipNumber ? (
                                <span className="mono" style={{ fontWeight: 650, fontSize: '0.82rem', color: '#0f172a' }}>
                                  {member.membershipNumber}
                                </span>
                              ) : (
                                <span className="help-text">Not assigned</span>
                              )}
                            </td>
                            <td>
                              <div style={{ fontSize: '0.82rem', color: '#334155' }}>
                                {member.ward ? (
                                  `Ward ${member.ward.wardNumber}`
                                ) : (
                                  <span className="help-text">No ward</span>
                                )}
                              </div>
                              <div
                                style={{ fontSize: '0.74rem', marginTop: '2px' }}
                                className={member.nocStatus === 'APPROVED' ? 'help-text' : 'mono'}
                              >
                                {member.nocStatus
                                  ? `NOC ${NOC_STATUS[member.nocStatus].toLowerCase()}`
                                  : 'No NOC yet'}
                              </div>
                            </td>
                            <td>
                              <span style={{ fontSize: '0.80rem', color: '#334155' }}>
                                {member.roleGrants
                                  .filter((grant) => grant.status === 'ACTIVE')
                                  .map((grant) => label(grant.role))
                                  .join(', ') || <span className="help-text">None</span>}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                className={`btn btn-sm ${['APPLIED', 'PENDING_REVIEW'].includes(member.status) ? 'btn-primary' : 'btn-secondary'}`}
                                disabled={pending}
                                onClick={() => review(member)}
                                style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                              >
                                {['APPLIED', 'PENDING_REVIEW'].includes(member.status)
                                  ? 'Review →'
                                  : 'View →'}
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
                        <div className="membership-profile-summary">
                          <span className="membership-profile-avatar"><Icon name="users" /></span>
                          <div className="membership-profile-copy">
                            <span className="membership-review-kicker">MEMBERSHIP REVIEW</span>
                            <h2 id="membership-title">
                              {detail.membership.user?.fullName ??
                                phone(detail.membership.user?.phoneE164) ??
                                'Membership'}
                            </h2>
                            <div className="membership-profile-meta">
                              <Badge value={detail.membership.status} />
                              {detail.membership.membershipNumber && (
                                <span className="membership-number-chip">
                                  Member no. {detail.membership.membershipNumber}
                                </span>
                              )}
                              {detail.membership.user?.fullName && (
                                <span className="membership-phone-chip">
                                  {phone(detail.membership.user.phoneE164)}
                                </span>
                              )}
                            </div>
                          </div>
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
                            {detail.membership.applicationDetails?.participationIntent && (
                              <>
                                <dt>Participation preference</dt>
                                <dd>
                                  {detail.membership.applicationDetails.participationIntent ===
                                  'BOTH'
                                    ? 'Give time and request help'
                                    : detail.membership.applicationDetails.participationIntent ===
                                        'HELP'
                                      ? 'Request help'
                                      : 'Give time'}
                                </dd>
                                {detail.membership.applicationDetails.helpFor && (
                                  <>
                                    <dt>Help requested for</dt>
                                    <dd>
                                      {detail.membership.applicationDetails.helpFor === 'CAREGIVER'
                                        ? 'Someone they care for'
                                        : 'The applicant'}
                                      <div className="help-text">
                                        Review eligibility and roles separately.
                                      </div>
                                    </dd>
                                  </>
                                )}
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
                                <div className="section-heading membership-identity-actions">
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
                              <div className="document-row membership-role-row" key={grant.id}>
                                <span className="membership-role-label">{label(grant.role)}</span>
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
                              <div className="document-row membership-role-row pending-role-row" key={grant.id}>
                                <div className="membership-pending-role-copy">
                                  <span className="membership-role-label">{label(grant.role)}</span>
                                  <span className="membership-role-pending-note">Waiting for approval by another Super Admin</span>
                                </div>
                                {isGlobal && (
                                  <div className="membership-role-actions">
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
                                  </div>
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
      {notificationsOpen && typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="drawer-backdrop notification-drawer-backdrop"
              onClick={() => setNotificationsOpen(false)}
            />
            <aside
              className="drawer notification-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="notification-drawer-title"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setNotificationsOpen(false);
              }}
            >
              <div className="drawer-header notification-drawer-header">
                <div>
                  <span className="membership-review-kicker">ADMIN WORKSPACE</span>
                  <h2 id="notification-drawer-title">Notifications</h2>
                  <p>Recent updates for your account</p>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Close notifications"
                  title="Close"
                  autoFocus
                  onClick={() => setNotificationsOpen(false)}
                >
                  <Icon name="close" />
                </button>
              </div>
              <div className="drawer-body notification-drawer-body" aria-busy={notificationsLoading}>
                {notificationsLoading && (
                  <p className="notification-drawer-state" role="status">
                    Loading notifications…
                  </p>
                )}
                {notificationsError && (
                  <div className="notification-drawer-error">
                    <p className="error-message" role="alert">{notificationsError}</p>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={notificationsLoading}
                      onClick={() => setNotificationsRevision((value) => value + 1)}
                    >
                      Try again
                    </button>
                  </div>
                )}
                {!notificationsLoading && !notificationsError && notifications.length === 0 && (
                  <div className="notification-empty-state">
                    <span><Icon name="bell" size={20} /></span>
                    <h3>You’re all caught up</h3>
                    <p>New updates for your account will appear here.</p>
                  </div>
                )}
                {!notificationsError && notifications.map((notification) => {
                  const organizationName = organizations.find(
                    (organization) => organization.id === notification.data?.organizationId,
                  )?.name;
                  return (
                    <article className="notification-item" key={notification.id}>
                      <span className="notification-item-icon" aria-hidden="true">
                        <Icon name="bell" size={16} />
                      </span>
                      <div className="notification-item-copy">
                        <div className="notification-item-heading">
                          <h3>{notification.title}</h3>
                          <time dateTime={notification.createdAt}>
                            {new Date(notification.createdAt).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </time>
                        </div>
                        <p>{notification.body}</p>
                        {organizationName && <span className="notification-item-scope">{organizationName}</span>}
                      </div>
                    </article>
                  );
                })}
                {!notificationsLoading && notifications.length > 0 && (
                  <p className="notification-retention-note">Showing your latest notifications from the past 30 days.</p>
                )}
              </div>
            </aside>
          </>,
          document.body,
        )}
    </div>
  );
}
