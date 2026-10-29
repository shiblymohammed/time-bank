'use client';

import { useEffect, useRef, useState } from 'react';
import { UserRole } from '@ktb/shared-types';
import { api } from '../lib/api';

interface Organization {
  id: string;
  name: string;
  district: string;
  status: string;
}
interface AppBuild {
  id: string;
  platform: string;
  applicationId: string;
  buildVersion: string;
  minSupportedVersion: string;
  releaseStatus: string;
}
interface Membership {
  userId: string;
  id: string;
  organizationId: string;
  status: string;
  roleGrants: { id: string; role: string; status: string }[];
  documents: { id: string; documentType: string; storageKey: string; reviewStatus: string }[];
  approvals: { id: string; action: string; createdAt: string }[];
}
interface Props {
  target: { kind: 'organization' | 'membership'; organizationId: string; id: string };
  onClose: () => void;
  onChanged: () => void;
  onError: (cause: unknown) => void;
}

export function ApiManagement({ target, onClose, onChanged, onError }: Props) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [builds, setBuilds] = useState<AppBuild[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const orgPath = `/api/v1/organizations/${target.organizationId}`;
  const memberPath = `/api/organizations/${target.organizationId}/memberships/${target.id}`;

  useEffect(() => {
    panel.current?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    setLoading(true);
    setError('');
    const load = async () => {
      if (target.kind === 'organization') {
        const [org, releases] = await Promise.all([
          api<{ data: Organization }>(orgPath, options),
          api<{ data: AppBuild[] }>(`${orgPath}/app-builds`, options),
        ]);
        if (controller.signal.aborted) return;
        setOrganization(org.data);
        setBuilds(releases.data);
      } else {
        const record = await api<Membership>(memberPath, options);
        if (!controller.signal.aborted) setMembership(record);
      }
    };
    void load()
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Unable to load details');
        onError(cause);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [target.kind, orgPath, memberPath, revision, onError]);

  const save = async (path: string, method: string, body: unknown) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(path, { method, body: JSON.stringify(body) });
      setNotice('Saved successfully.');
      setRevision((value) => value + 1);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save changes');
      onError(cause);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const values = (form: HTMLFormElement) => Object.fromEntries(new FormData(form).entries());
  const revoke = (id: string, role: string) => {
    const reason = window.prompt('Reason for revoking this role:');
    if (reason?.trim())
      void save(
        ['SUPER_ADMIN', 'MUNICIPALITY_ADMIN', 'COORDINATOR'].includes(role)
          ? `/api/admin/organizations/${target.organizationId}/roles/${id}`
          : `${memberPath}/roles/${id}`,
        'DELETE',
        {
          reason: reason.trim(),
        },
      );
  };

  return (
    <section
      ref={panel}
      tabIndex={-1}
      className="glass-panel"
      aria-label="Management details"
      aria-busy={loading || busy}
      style={{ padding: 24, marginBottom: 24 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <h2>
          {target.kind === 'organization'
            ? 'Organization settings & app builds'
            : 'Membership details & documents'}
        </h2>
        <button className="btn" disabled={busy} onClick={onClose}>
          Close details
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">Loading details…</p>}
      {!loading && error && (
        <button className="btn" onClick={() => setRevision((v) => v + 1)}>
          Retry details
        </button>
      )}
      <fieldset disabled={busy || loading} style={{ border: 0, padding: 0 }}>
        {organization && (
          <>
            <form
              key={`${organization.id}-${organization.name}-${organization.district}-${organization.status}`}
              onSubmit={(event) => {
                event.preventDefault();
                void save(orgPath, 'PATCH', values(event.currentTarget));
              }}
            >
              <h3>Edit organization</h3>
              <label>
                Name{' '}
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={200}
                  defaultValue={organization.name}
                />
              </label>{' '}
              <label>
                District <input name="district" required defaultValue={organization.district} />
              </label>{' '}
              <label>
                Status{' '}
                <select name="status" defaultValue={organization.status}>
                  {['DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>{' '}
              <button className="btn btn-primary" disabled={organization.status !== 'ACTIVE'}>
                Save organization
              </button>
              {organization.status !== 'ACTIVE' && (
                <p>
                  Activate the organization from the table to edit its settings or register builds.
                </p>
              )}
            </form>
            <h3>Registered app builds</h3>
            {builds.length === 0 && <p>No builds registered.</p>}
            <ul>
              {builds.map((build) => (
                <li key={build.id}>
                  {build.platform} · {build.applicationId} · {build.buildVersion} · Minimum{' '}
                  {build.minSupportedVersion} · {build.releaseStatus}
                </li>
              ))}
            </ul>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save(`${orgPath}/app-builds`, 'POST', values(event.currentTarget));
              }}
            >
              <h3>Register or update app build</h3>
              <p>Use an existing platform and application ID to update its release.</p>
              <label>
                Platform <input name="platform" required defaultValue="ANDROID" />
              </label>{' '}
              <label>
                Application ID <input name="applicationId" required />
              </label>{' '}
              <label>
                Build version <input name="buildVersion" required defaultValue="1.0.0" />
              </label>{' '}
              <label>
                Minimum supported version{' '}
                <input name="minSupportedVersion" required defaultValue="1.0.0" />
              </label>{' '}
              <label>
                Release status <input name="releaseStatus" required defaultValue="DRAFT" />
              </label>{' '}
              <button className="btn btn-primary" disabled={organization.status !== 'ACTIVE'}>
                Save app build
              </button>
            </form>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save(
                  `/api/admin/organizations/${target.organizationId}/roles`,
                  'POST',
                  values(event.currentTarget),
                );
              }}
            >
              <h3>Appoint organization role</h3>
              <label>
                User ID <input name="userId" required />
              </label>{' '}
              <label>
                Role{' '}
                <select name="role" defaultValue={UserRole.MUNICIPALITY_ADMIN}>
                  {Object.values(UserRole).map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>{' '}
              <button className="btn btn-primary">Appoint role</button>
            </form>
          </>
        )}
        {membership && (
          <>
            <p>
              Membership {membership.id} · {membership.status}
            </p>
            <h3>Assigned roles</h3>
            <ul>
              {membership.roleGrants
                .filter((grant) => grant.status === 'ACTIVE')
                .map((grant) => (
                  <li key={grant.id}>
                    {grant.role}{' '}
                    <button className="btn btn-danger" onClick={() => revoke(grant.id, grant.role)}>
                      Revoke {grant.role}
                    </button>
                  </li>
                ))}
            </ul>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = values(event.currentTarget);
                void save(
                  ['SUPER_ADMIN', 'MUNICIPALITY_ADMIN', 'COORDINATOR'].includes(String(data.role))
                    ? `/api/admin/organizations/${target.organizationId}/roles`
                    : `${memberPath}/roles`,
                  'POST',
                  ['SUPER_ADMIN', 'MUNICIPALITY_ADMIN', 'COORDINATOR'].includes(String(data.role))
                    ? { ...data, userId: membership.userId }
                    : data,
                );
              }}
            >
              <label>
                Role{' '}
                <select name="role" defaultValue={UserRole.COORDINATOR}>
                  {Object.values(UserRole).map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </label>{' '}
              <button className="btn btn-primary" disabled={membership.status !== 'APPROVED'}>
                Grant role
              </button>
            </form>
            <h3>Supporting documents</h3>
            {membership.documents.length === 0 && <p>No supporting documents submitted.</p>}
            {membership.documents.map((document) => (
              <div key={document.id} style={{ marginBlock: 16 }}>
                <p>
                  {document.documentType} · {document.reviewStatus}
                </p>
                <p>
                  Storage reference: <code>{document.storageKey}</code>
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save(
                      `/api/organizations/${target.organizationId}/memberships/documents/${document.id}/review`,
                      'PATCH',
                      values(event.currentTarget),
                    );
                  }}
                >
                  <label>
                    Review decision{' '}
                    <select name="status" defaultValue="APPROVED">
                      <option>APPROVED</option>
                      <option>REJECTED</option>
                    </select>
                  </label>{' '}
                  <label>
                    Review notes <input name="notes" />
                  </label>{' '}
                  <button className="btn btn-primary">Save document review</button>
                </form>
              </div>
            ))}
            <h3>Application history</h3>
            {membership.approvals.length === 0 && <p>No history recorded.</p>}
            <ul>
              {membership.approvals.map((approval) => (
                <li key={approval.id}>
                  {approval.action} · {new Date(approval.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </>
        )}
      </fieldset>
    </section>
  );
}
