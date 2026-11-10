'use client';
import React, { useEffect, useState } from 'react';
import { ApiError, backend } from '@/lib/api';
import type { Action, Field } from '@/lib/admin-types';
import { indiaTime } from '@/lib/request-utils';

export type Ward = {
  id: string;
  wardNumber: string;
  name: string;
  representativeTitle: 'COUNCILLOR' | 'WARD_MEMBER';
  representativeName: string;
  representativePhone?: string | null;
  officeAddress: string | null;
  status: 'ACTIVE' | 'INACTIVE';
};

export type Noc = {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
  notes: string | null;
  wardId: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedAt: string;
  reviewedAt: string | null;
};

export const TITLE: Record<Ward['representativeTitle'], string> = {
  COUNCILLOR: 'Councillor',
  WARD_MEMBER: 'Ward member',
};

export const NOC_STATUS: Record<Noc['status'], string> = {
  PENDING: 'Waiting for review',
  APPROVED: 'Accepted',
  REJECTED: 'Not accepted',
  SUPERSEDED: 'Replaced',
};

export const wardLabel = (ward: Pick<Ward, 'wardNumber' | 'name'>) =>
  `Ward ${ward.wardNumber}, ${ward.name}`;

function wardFields(ward?: Ward): Field[] {
  return [
    { key: 'wardNumber', label: 'Ward number', value: ward?.wardNumber ?? '', maxLength: 20 },
    { key: 'name', label: 'Ward name', value: ward?.name ?? '', minLength: 2, maxLength: 120 },
    {
      key: 'representativeTitle',
      label: 'Represented by',
      choices: [
        { value: 'COUNCILLOR', label: 'Councillor' },
        { value: 'WARD_MEMBER', label: 'Ward member' },
      ],
      value: ward?.representativeTitle ?? 'COUNCILLOR',
    },
    {
      key: 'representativeName',
      label: 'Their name',
      value: ward?.representativeName ?? '',
      minLength: 2,
      maxLength: 120,
    },
    {
      key: 'representativePhone',
      label: 'Their phone (staff only)',
      value: ward?.representativePhone ?? '',
      optional: true,
      maxLength: 20,
    },
    {
      key: 'officeAddress',
      label: 'Office address (members see this)',
      value: ward?.officeAddress ?? '',
      optional: true,
      maxLength: 300,
    },
  ];
}

/** The wards of one municipality and who signs each ward's NOC. */
export function WardsPanel({
  organizationId,
  organizationName,
  canEdit,
  revision,
  pending,
  openAction,
  onClose,
  onExpired,
}: {
  organizationId: string;
  organizationName: string;
  canEdit: boolean;
  revision: number;
  pending: boolean;
  openAction: (action: Action) => void;
  onClose: () => void;
  onExpired: () => void;
}) {
  const [wards, setWards] = useState<Ward[] | null>(null);
  const [error, setError] = useState('');
  const base = `/organizations/${organizationId}/wards`;

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    backend<Ward[]>(`${base}/manage`, 'GET', undefined, controller.signal)
      .then(setWards)
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 401) onExpired();
        else setError(cause instanceof Error ? cause.message : 'Could not load the wards');
      });
    return () => controller.abort();
  }, [base, revision, onExpired]);

  const add = () =>
    openAction({
      title: `Add a ward: ${organizationName}`,
      description:
        'Members choose their ward when they join and ask its councillor or ward member for a signed NOC.',
      submitLabel: 'Add ward',
      fields: wardFields(),
      submit: (values) => backend(base, 'POST', values),
      successMessage: () => 'Ward added.',
    });

  const edit = (ward: Ward) =>
    openAction({
      title: `Edit ${wardLabel(ward)}`,
      submitLabel: 'Save ward',
      fields: wardFields(ward),
      submit: (values) => backend(`${base}/${ward.id}`, 'PATCH', values),
      successMessage: () => 'Ward saved.',
    });

  const toggle = (ward: Ward) =>
    openAction({
      title:
        ward.status === 'ACTIVE' ? `Switch off ${wardLabel(ward)}` : `Switch on ${wardLabel(ward)}`,
      description:
        ward.status === 'ACTIVE'
          ? 'New members can no longer choose this ward. Members already in it keep it.'
          : 'New members can choose this ward again.',
      submitLabel: ward.status === 'ACTIVE' ? 'Switch off' : 'Switch on',
      fields: [],
      submit: () =>
        backend(`${base}/${ward.id}`, 'PATCH', {
          status: ward.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
        }),
      successMessage: () => 'Ward saved.',
    });

  return (
    <section className="glass-panel" aria-label={`Wards of ${organizationName}`}>
      <div className="section-heading">
        <div>
          <h3>Wards: {organizationName}</h3>
          <p className="help-text">
            Members see the ward, its councillor or ward member and the office address. The phone
            number is for staff only.
          </p>
        </div>
        <div className="action-row">
          {canEdit && (
            <button className="btn btn-primary" disabled={pending} onClick={add}>
              Add ward
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {error && <p className="error-message">{error}</p>}
      {wards && wards.length === 0 && (
        <p className="help-text">
          No wards yet. Until wards are added, members can join without choosing one.
        </p>
      )}
      {wards && wards.length > 0 && (
        <table className="custom-table">
          <thead>
            <tr>
              <th>Ward</th>
              <th>Represented by</th>
              <th>Office</th>
              <th>Status</th>
              {canEdit && (
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {wards.map((ward) => (
              <tr key={ward.id}>
                <td className="primary-cell">{wardLabel(ward)}</td>
                <td>
                  {ward.representativeName}
                  <div className="help-text">
                    {TITLE[ward.representativeTitle]}
                    {ward.representativePhone ? ` · ${ward.representativePhone}` : ''}
                  </div>
                </td>
                <td>{ward.officeAddress ?? <span className="help-text">Not given</span>}</td>
                <td>{ward.status === 'ACTIVE' ? 'In use' : 'Switched off'}</td>
                {canEdit && (
                  <td>
                    <div className="action-row">
                      <button
                        className="btn btn-sm btn-secondary"
                        disabled={pending}
                        onClick={() => edit(ward)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        disabled={pending}
                        onClick={() => toggle(ward)}
                      >
                        {ward.status === 'ACTIVE' ? 'Switch off' : 'Switch on'}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Opens an uploaded file in a new tab, through the panel's own gateway. */
async function openFile(path: string) {
  // Opened first, so the browser does not block it as a pop-up.
  const tab = window.open('', '_blank');
  const response = await fetch('/api/backend' + path, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) {
    tab?.close();
    const result = await response.json().catch(() => ({}));
    throw new ApiError(
      typeof result.message === 'string' ? result.message : 'Could not open the file',
      response.status,
    );
  }
  const url = URL.createObjectURL(await response.blob());
  if (tab) tab.location.href = url;
  else window.location.assign(url);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** The member's ward and ward NOC, in the membership drawer. */
export function WardNocSection({
  organizationId,
  ward,
  noc,
  canReview,
  openAction,
  onExpired,
}: {
  organizationId: string;
  ward: Ward | null | undefined;
  noc: Noc | null | undefined;
  canReview: boolean;
  openAction: (action: Action) => void;
  onExpired: () => void;
}) {
  const [error, setError] = useState('');
  const review = (status: 'APPROVED' | 'REJECTED') =>
    openAction({
      title: status === 'APPROVED' ? 'Accept this NOC' : 'Do not accept this NOC',
      description:
        status === 'APPROVED'
          ? `Accept only if it is signed by ${ward ? `${ward.representativeName}, ${TITLE[ward.representativeTitle].toLowerCase()} for ${wardLabel(ward)}` : 'the member’s ward councillor or ward member'}. You can then approve the membership.`
          : 'The member sees your reason in the app and can send a new NOC.',
      submitLabel: status === 'APPROVED' ? 'Accept NOC' : 'Do not accept',
      fields:
        status === 'APPROVED'
          ? [{ key: 'notes', label: 'Notes', optional: true, maxLength: 500 }]
          : [
              {
                key: 'notes',
                label: 'Reason the member will see',
                type: 'textarea',
                minLength: 3,
                maxLength: 500,
              },
            ],
      submit: (values) =>
        backend(
          `/organizations/${organizationId}/memberships/documents/${noc!.id}/review`,
          'PATCH',
          { status, ...(values['notes']?.trim() ? { notes: values['notes'].trim() } : {}) },
        ),
      successMessage: () => (status === 'APPROVED' ? 'NOC accepted.' : 'NOC not accepted.'),
    });

  return (
    <section className="drawer-section">
      <h3>Ward and NOC</h3>
      {ward ? (
        <p>
          {wardLabel(ward)}
          <span className="help-text">
            {' '}
            · {TITLE[ward.representativeTitle]} {ward.representativeName}
            {ward.representativePhone ? ` · ${ward.representativePhone}` : ''}
          </span>
        </p>
      ) : (
        <p className="help-text">No ward chosen yet.</p>
      )}
      {!noc ? (
        <p className="help-text">
          No NOC sent yet. The membership cannot be approved until a signed NOC is accepted.
        </p>
      ) : (
        <div className="document-row">
          <div>
            NOC: <strong>{NOC_STATUS[noc.status]}</strong>
            <div className="help-text">
              Sent {indiaTime(noc.uploadedAt)}
              {noc.sizeBytes ? ` · ${Math.max(1, Math.round(noc.sizeBytes / 1024))} KB` : ''}
              {noc.contentType === 'application/pdf' ? ' · PDF' : ' · photo'}
            </div>
            {noc.notes && <div className="help-text">Note: {noc.notes}</div>}
            {noc.wardId && ward && noc.wardId !== ward.id && (
              <div className="error-message">This NOC was sent for a different ward.</div>
            )}
          </div>
          <div className="action-row">
            <button
              className="btn btn-sm btn-secondary"
              onClick={() =>
                openFile(
                  `/organizations/${organizationId}/memberships/documents/${noc.id}/file`,
                ).catch((cause) => {
                  if (cause instanceof ApiError && cause.status === 401) onExpired();
                  else setError(cause instanceof Error ? cause.message : 'Could not open the file');
                })
              }
            >
              Open NOC
            </button>
            {canReview && noc.status === 'PENDING' && (
              <>
                <button className="btn btn-sm btn-success" onClick={() => review('APPROVED')}>
                  Accept
                </button>
                <button className="btn btn-sm btn-secondary" onClick={() => review('REJECTED')}>
                  Not accepted
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {error && <p className="error-message">{error}</p>}
    </section>
  );
}
