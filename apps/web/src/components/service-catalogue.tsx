'use client';
import React, { useEffect, useState } from 'react';
import { backend, ApiError } from '@/lib/api';
import type { Action } from '@/lib/admin-types';
import { staffing, skillCodes } from '@/lib/catalogue-utils';

type Service = {
  id: string;
  code: string;
  nameEn: string;
  nameMl: string;
  descriptionEn?: string;
  isActive: boolean;
  category?: { id: string; nameEn: string; isActive: boolean };
  defaultMinVolunteers: number;
  defaultPreferredVolunteers: number;
  requiresSkills: boolean;
  requiredSkillCodes: string[];
};
type Local = {
  id: string;
  globalServiceId: string;
  isEnabled: boolean;
  minVolunteers: number;
  preferredVolunteers: number;
  requiresCoordinatorDispatch: boolean;
  customLabelEn?: string | null;
  customLabelMl?: string | null;
  localInstructionsEn?: string | null;
  localInstructionsMl?: string | null;
};
type Data = { services: Service[]; local: Local[] };
const yesNo = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];
export function ServiceCatalogue({
  organizationId,
  isGlobal,
  revision,
  pending,
  openAction,
  onExpired,
}: {
  organizationId: string | null;
  isGlobal: boolean;
  revision: number;
  pending: boolean;
  openAction: (action: Action) => void;
  onExpired: () => void;
}) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState('');
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [status, setStatus] = useState('ALL'),
    [page, setPage] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    Promise.all([
      backend<Service[]>('/catalogue/global?activeOnly=false', 'GET', undefined, controller.signal),
      organizationId
        ? backend<Local[]>(
            `/organizations/${organizationId}/catalogue?all=true`,
            'GET',
            undefined,
            controller.signal,
          )
        : Promise.resolve([]),
    ])
      .then(([services, local]) => setData({ services, local }))
      .catch((e) => {
        if (controller.signal.aborted) return;
        setError(e.message);
        if (e instanceof ApiError && e.status === 401) onExpired();
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, revision]);
  const entries = new Map(data?.local.map((entry) => [entry.globalServiceId, entry]));
  const categories = [
    ...new Map(
      data?.services.filter((s) => s.category).map((s) => [s.category!.id, s.category!]),
    ).values(),
  ];
  const matches = (data?.services ?? []).filter((service) => {
    const local = entries.get(service.id);
    const text =
      `${service.code} ${service.nameEn} ${service.nameMl} ${local?.customLabelEn ?? ''} ${local?.customLabelMl ?? ''}`.toLowerCase();
    return (
      text.includes(search.trim().toLowerCase()) &&
      (!category || service.category?.id === category) &&
      (status === 'ALL' ||
        (status === 'ENABLED' && local?.isEnabled) ||
        (status === 'DISABLED' && local && !local.isEnabled) ||
        (status === 'NOT_CONFIGURED' && !local))
    );
  });
  function configure(service: Service, local?: Local) {
    const floor = service.defaultMinVolunteers;
    openAction({
      title: `Configure ${service.nameEn}`,
      description:
        'These settings apply to the selected organization. Disabling stops new requests and further matching or acceptance; already accepted commitments remain recorded. Changes to staffing apply to new requests.',
      fields: [
        {
          key: 'enabled',
          label: 'Enabled locally',
          value: String(local?.isEnabled ?? true),
          choices: yesNo,
        },
        {
          key: 'minimum',
          label: 'Minimum volunteers',
          type: 'number',
          value: String(Math.max(floor, local?.minVolunteers ?? floor)),
          min: String(floor),
          step: '1',
        },
        {
          key: 'preferred',
          label: 'Preferred volunteers',
          type: 'number',
          value: String(
            Math.max(floor, local?.preferredVolunteers ?? service.defaultPreferredVolunteers),
          ),
          min: String(floor),
          step: '1',
        },
        {
          key: 'dispatch',
          label: 'Coordinator dispatch only',
          value: String(local?.requiresCoordinatorDispatch ?? false),
          choices: yesNo,
        },
        {
          key: 'labelEn',
          label: 'Local name (English)',
          value: local?.customLabelEn ?? '',
          optional: true,
          maxLength: 150,
        },
        {
          key: 'labelMl',
          label: 'Local name (Malayalam)',
          value: local?.customLabelMl ?? '',
          optional: true,
          maxLength: 150,
        },
        {
          key: 'instructionsEn',
          label: 'Local instructions (English)',
          value: local?.localInstructionsEn ?? '',
          optional: true,
          maxLength: 5000,
        },
        {
          key: 'instructionsMl',
          label: 'Local instructions (Malayalam)',
          value: local?.localInstructionsMl ?? '',
          optional: true,
          maxLength: 5000,
        },
      ],
      submit: (v) =>
        backend(`/organizations/${organizationId}/catalogue/configure`, 'POST', {
          globalServiceId: service.id,
          isEnabled: v.enabled === 'true',
          ...staffing(v.minimum, v.preferred, floor),
          requiresCoordinatorDispatch: v.dispatch === 'true',
          customLabelEn: v.labelEn,
          customLabelMl: v.labelMl,
          localInstructionsEn: v.instructionsEn,
          localInstructionsMl: v.instructionsMl,
        }),
    });
  }
  function editSkills(service: Service) {
    openAction({
      title: `Skills for ${service.nameEn}`,
      description:
        'Central service rules apply across all organizations. New matching, dispatch and pending-offer acceptance use the current required skills. Existing accepted commitments remain recorded. Skill codes must match coordinator-verified credentials.',
      fields: [
        {
          key: 'required',
          label: 'Verified skills required',
          value: String(service.requiresSkills),
          choices: yesNo,
        },
        {
          key: 'codes',
          label: 'Required skill codes (comma separated)',
          value: (service.requiredSkillCodes ?? []).join(', '),
          optional: true,
          maxLength: 2548,
        },
      ],
      submit: (v) =>
        backend(`/catalogue/global/${service.id}`, 'PATCH', {
          requiresSkills: v.required === 'true',
          requiredSkillCodes: skillCodes(v.codes, v.required === 'true'),
        }),
    });
  }
  return (
    <div className="request-workspace">
      <div className="section-heading">
        <h2>{organizationId ? 'Local service settings' : 'Central service rules'}</h2>
      </div>
      <p className="section-description">
        {organizationId
          ? 'Choose from the central service catalogue and configure local names, instructions and staffing.'
          : 'Review shared services and maintain required skills. Select an organization above to configure its local services.'}
      </p>
      <div className="action-row">
        <label>
          Search services
          <input
            className="form-input"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Category
          <select
            className="form-input"
            aria-label="Category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameEn}
              </option>
            ))}
          </select>
        </label>
        {organizationId && (
          <label>
            Local status
            <select
              className="form-input"
              aria-label="Local status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All services</option>
              <option value="ENABLED">Enabled locally</option>
              <option value="DISABLED">Disabled locally</option>
              <option value="NOT_CONFIGURED">Not configured</option>
            </select>
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading service catalogue…</p>}
      {data && (
        <>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Staffing</th>
                  <th>Required skills</th>
                  <th>{organizationId ? 'Local status' : 'Central status'}</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {matches.slice((page - 1) * 10, page * 10).map((service) => {
                  const local = entries.get(service.id);
                  return (
                    <tr key={service.id}>
                      <td>
                        <strong>{local?.customLabelEn || service.nameEn}</strong>
                        <p>{local?.customLabelMl || service.nameMl}</p>
                        <p className="help-text">
                          {service.code} · {service.category?.nameEn ?? 'Uncategorized'}
                        </p>
                        {service.descriptionEn && (
                          <p className="help-text">{service.descriptionEn}</p>
                        )}
                        {local?.localInstructionsEn && (
                          <p>Instructions: {local.localInstructionsEn}</p>
                        )}
                        {local?.localInstructionsMl && <p>{local.localInstructionsMl}</p>}
                      </td>
                      <td>
                        <p>Central minimum: {service.defaultMinVolunteers}</p>
                        <p>
                          {local
                            ? `Local minimum ${local.minVolunteers} · Preferred ${local.preferredVolunteers}`
                            : `Default preferred: ${service.defaultPreferredVolunteers}`}
                        </p>
                        {local?.requiresCoordinatorDispatch && <p>Coordinator dispatch only</p>}
                      </td>
                      <td>
                        {service.requiresSkills
                          ? (service.requiredSkillCodes ?? []).join(', ') || 'Needs central review'
                          : 'No verified skills required'}
                      </td>
                      <td>
                        {!service.isActive
                          ? 'Inactive centrally'
                          : local
                            ? local.isEnabled
                              ? 'Enabled'
                              : 'Disabled'
                            : organizationId
                              ? 'Not configured'
                              : 'Active'}
                      </td>
                      <td>
                        <div className="action-row">
                          {organizationId && (
                            <button
                              className="btn btn-secondary"
                              disabled={pending || (!service.isActive && !local)}
                              onClick={() => configure(service, local)}
                            >
                              {local ? 'Configure' : 'Set up locally'}
                            </button>
                          )}
                          {isGlobal && (
                            <button
                              className="btn btn-secondary"
                              disabled={pending}
                              onClick={() => editSkills(service)}
                            >
                              Edit central skills
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!matches.length && <p className="empty-state">No services match these filters.</p>}
          <div className="pagination">
            <button disabled={pending || page === 1} onClick={() => setPage(page - 1)}>
              Previous services
            </button>
            <span>
              Page {page} · {matches.length} services
            </span>
            <button
              disabled={pending || page * 10 >= matches.length}
              onClick={() => setPage(page + 1)}
            >
              Next services
            </button>
          </div>
        </>
      )}
    </div>
  );
}
