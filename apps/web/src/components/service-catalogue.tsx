'use client';
import React, { useEffect, useState, useRef } from 'react';
import { backend, ApiError } from '@/lib/api';
import type { Action } from '@/lib/admin-types';
import { staffing, skillCodes } from '@/lib/catalogue-utils';
import { Icon } from './icons';

type Service = {
  id: string;
  code: string;
  nameEn: string;
  nameMl: string;
  descriptionEn?: string;
  descriptionMl?: string;
  isActive: boolean;
  category?: { id: string; nameEn: string; isActive: boolean };
  defaultMinVolunteers: number;
  defaultPreferredVolunteers: number;
  requiresSkills: boolean;
  requiredSkillCodes: string[];
  isHazardousPhysical?: boolean;
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

const CURATED_SERVICE_PHOTOS = [
  {
    name: 'Elder Care',
    url: 'https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?w=360&auto=format&fit=crop&q=80',
    tags: ['elder', 'senior', 'visit', 'companion', 'walk'],
  },
  {
    name: 'Tech & UPI',
    url: 'https://images.unsplash.com/photo-1556742049-0a67c5574f73?w=360&auto=format&fit=crop&q=80',
    tags: ['phone', 'upi', 'tech', 'digital', 'smartphone', 'app'],
  },
  {
    name: 'Medicine',
    url: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=360&auto=format&fit=crop&q=80',
    tags: ['medicine', 'pharmacy', 'health', 'hospital', 'pickup'],
  },
  {
    name: 'Transport',
    url: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=360&auto=format&fit=crop&q=80',
    tags: ['transport', 'ride', 'drive', 'auto', 'car'],
  },
  {
    name: 'Cleaning',
    url: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=360&auto=format&fit=crop&q=80',
    tags: ['clean', 'chore', 'laundry', 'wash', 'house'],
  },
  {
    name: 'Gardening',
    url: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=360&auto=format&fit=crop&q=80',
    tags: ['garden', 'tree', 'plant', 'yard', 'lawn'],
  },
  {
    name: 'Cooking',
    url: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=360&auto=format&fit=crop&q=80',
    tags: ['food', 'cook', 'meal', 'kitchen', 'baking'],
  },
  {
    name: 'Tutoring',
    url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=360&auto=format&fit=crop&q=80',
    tags: ['tutor', 'study', 'teach', 'book', 'lesson', 'school'],
  },
  {
    name: 'Pet Care',
    url: 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?w=360&auto=format&fit=crop&q=80',
    tags: ['pet', 'dog', 'cat', 'animal', 'walk'],
  },
  {
    name: 'Repairs',
    url: 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=360&auto=format&fit=crop&q=80',
    tags: ['repair', 'plumb', 'electric', 'fix', 'tool', 'handyman'],
  },
  {
    name: 'Community Care',
    url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=360&auto=format&fit=crop&q=80',
    tags: ['community', 'volunteer', 'social', 'help', 'friend'],
  },
  {
    name: 'Errands',
    url: 'https://images.unsplash.com/photo-1616401784845-180882ba9ba8?w=360&auto=format&fit=crop&q=80',
    tags: ['delivery', 'errand', 'grocery', 'shopping'],
  },
];

const POPULAR_SKILL_TAGS = [
  'FIRST_AID',
  'ELDER_CARE',
  'SMARTPHONE_UPI',
  'DRIVING',
  'COOKING',
  'NURSING',
  'CARPENTRY',
  'HEAVY_LIFTING',
  'TUTORING',
  'PET_CARE',
];

function getServiceVisual(service: Service) {
  const desc = service.descriptionEn || '';
  const imgMatch =
    desc.match(/!\[.*?\]\((https?:\/\/[^\s)]+|data:image\/[^\s)]+)\)/i) ||
    desc.match(/\[img:(https?:\/\/[^\]]+|data:image\/[^\]]+)\]/i);
  if (imgMatch) {
    return {
      url: imgMatch[1],
      cleanDesc: desc.replace(imgMatch[0], '').trim(),
    };
  }

  const text = `${service.code} ${service.nameEn} ${service.category?.nameEn || ''}`.toLowerCase();
  for (const preset of CURATED_SERVICE_PHOTOS) {
    if (preset.tags.some((tag) => text.includes(tag))) {
      return {
        url: preset.url,
        cleanDesc: desc,
      };
    }
  }

  return {
    url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=360&auto=format&fit=crop&q=80',
    cleanDesc: desc,
  };
}

function resizeImageToDataUri(file: File, maxDim = 400, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(event.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [localRevision, setLocalRevision] = useState(0);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [skillFilter, setSkillFilter] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);

  // Modals
  const [showAddService, setShowAddService] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

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
  }, [organizationId, revision, localRevision]);

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
    const matchesSearch = text.includes(search.trim().toLowerCase());
    const matchesCategory = !category || service.category?.id === category;
    const matchesSkill =
      skillFilter === 'ALL' ||
      (skillFilter === 'REQUIRED' && service.requiresSkills) ||
      (skillFilter === 'NONE' && !service.requiresSkills);
    const matchesStatus =
      status === 'ALL' ||
      (status === 'ACTIVE' && service.isActive) ||
      (status === 'INACTIVE' && !service.isActive) ||
      (status === 'ENABLED' && local?.isEnabled) ||
      (status === 'DISABLED' && local && !local.isEnabled) ||
      (status === 'NOT_CONFIGURED' && !local);

    return matchesSearch && matchesCategory && matchesSkill && matchesStatus;
  });

  async function toggleServiceActive(service: Service) {
    try {
      setError('');
      await backend(`/catalogue/global/${service.id}`, 'PATCH', {
        isActive: !service.isActive,
      });
      setNotice(
        `Service "${service.nameEn}" is now ${!service.isActive ? 'Active' : 'Inactive'}.`,
      );
      setLocalRevision((v) => v + 1);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired();
      else setError(e instanceof Error ? e.message : 'Failed to update service status');
    }
  }

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

  return (
    <div className="request-workspace catalogue-workspace">
      {/* Top Header Card */}
      <div className="section-heading catalogue-header">
        <div className="section-title-group">
          <div>
            <h2>{organizationId ? 'Local service settings' : 'Central service catalogue'}</h2>
            <p className="catalogue-subtitle">
              {organizationId
                ? 'Choose from the central service catalogue and configure local names, instructions and staffing.'
                : 'Review shared services, manage staffing requirements, and define verified skill credentials.'}
            </p>
          </div>
          <div className="catalogue-stats-pills">
            <span className="record-count">{matches.length} services</span>
            <span className="record-count">{categories.length} categories</span>
          </div>
        </div>
        <div className="catalogue-top-actions">
          {isGlobal && (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowAddCategory(true)}
              >
                <Icon name="plus" />
                Add Category
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowAddService(true)}
              >
                <Icon name="plus" />
                Add Service
              </button>
            </>
          )}
        </div>
      </div>

      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}

      {/* Filter & Search Toolbar */}
      <div className="toolbar catalogue-toolbar">
        <label className="toolbar-search-label">
          <span>Search services</span>
          <div className="search-input-wrapper">
            <Icon name="requests" />
            <input
              className="form-input"
              placeholder="Search by title, Malayalam, code, or keyword..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            {search && (
              <button
                type="button"
                className="clear-search-btn"
                title="Clear search"
                onClick={() => setSearch('')}
              >
                <Icon name="close" />
              </button>
            )}
          </div>
        </label>
        <label>
          <span>Category</span>
          <select
            className="form-input"
            aria-label="Category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All categories ({categories.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameEn}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Skill requirement</span>
          <select
            className="form-input"
            value={skillFilter}
            onChange={(e) => {
              setSkillFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All requirements</option>
            <option value="REQUIRED">Skills required</option>
            <option value="NONE">No skills required</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            className="form-input"
            aria-label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active centrally</option>
            <option value="INACTIVE">Inactive centrally</option>
            {organizationId && (
              <>
                <option value="ENABLED">Enabled locally</option>
                <option value="DISABLED">Disabled locally</option>
                <option value="NOT_CONFIGURED">Not configured</option>
              </>
            )}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}

      {!data && !error && <p role="status">Loading service catalogue…</p>}

      {data && (
        <>
          <div className="table-container glass-panel">
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '42%' }}>Service</th>
                  <th style={{ width: '18%' }}>Staffing</th>
                  <th style={{ width: '16%' }}>Required Skills</th>
                  <th style={{ width: '12%' }}>{organizationId ? 'Local Status' : 'Central Status'}</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {matches.slice((page - 1) * 10, page * 10).map((service) => {
                  const local = entries.get(service.id);
                  const visual = getServiceVisual(service);
                  const minVols = organizationId && local ? local.minVolunteers : service.defaultMinVolunteers;
                  const prefVols = organizationId && local ? local.preferredVolunteers : service.defaultPreferredVolunteers;

                  return (
                    <tr key={service.id}>
                      {/* SERVICE & IMAGE CELL */}
                      <td>
                        <div className="service-identity">
                          <div className="service-avatar">
                            <img
                              src={visual.url}
                              alt={service.nameEn}
                              className="service-img"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=360&auto=format&fit=crop&q=80';
                              }}
                            />
                          </div>
                          <div className="service-meta">
                            <div className="service-title-group">
                              <strong className="service-title">
                                {local?.customLabelEn || service.nameEn}
                              </strong>
                              <span className="service-sub-ml">
                                {local?.customLabelMl || service.nameMl}
                              </span>
                            </div>

                            <div className="service-chips">
                              <span className="code-chip">{service.code}</span>
                              {service.category && (
                                <span className="category-chip">{service.category.nameEn}</span>
                              )}
                            </div>

                            {visual.cleanDesc && (
                              <p className="service-desc">{visual.cleanDesc}</p>
                            )}

                            {local?.localInstructionsEn && (
                              <p className="service-local-note">
                                <Icon name="operations" />
                                <span>Local: {local.localInstructionsEn}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* STAFFING HEADCOUNT */}
                      <td>
                        <div className="staffing-chip-box">
                          <div className="staffing-chip">
                            <span className="staffing-icon-wrap">
                              <Icon name="memberships" />
                            </span>
                            <div className="staffing-details">
                              <span className="staffing-main">
                                {minVols === prefVols ? `${minVols} vol` : `${minVols}–${prefVols} vols`}
                              </span>
                              <span className="staffing-sub">
                                min {minVols} · pref {prefVols}
                              </span>
                            </div>
                          </div>

                          {service.isHazardousPhysical && (
                            <span className="hazard-chip" title="Heavy or risky physical work">
                              ⚠️ Hazardous
                            </span>
                          )}
                          {local?.requiresCoordinatorDispatch && (
                            <span className="dispatch-chip" title="Coordinator dispatch required">
                              🔒 Dispatch only
                            </span>
                          )}
                        </div>
                      </td>

                      {/* REQUIRED SKILLS */}
                      <td>
                        {service.requiresSkills ? (
                          (service.requiredSkillCodes ?? []).length > 0 ? (
                            <div className="skills-pill-group">
                              {service.requiredSkillCodes.map((code) => (
                                <span key={code} className="skill-chip">
                                  <Icon name="safety" />
                                  {code}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="badge badge-pending">Needs review</span>
                          )
                        ) : (
                          <span className="skill-open-pill">
                            <span className="skill-open-check">✓</span>
                            No skills required
                          </span>
                        )}
                      </td>

                      {/* STATUS BADGE */}
                      <td>
                        {!service.isActive ? (
                          <span className="status-badge status-inactive">
                            <span className="status-dot dot-inactive" />
                            Inactive
                          </span>
                        ) : organizationId ? (
                          local?.isEnabled ? (
                            <span className="status-badge status-active">
                              <span className="status-dot dot-active" />
                              Enabled
                            </span>
                          ) : local ? (
                            <span className="status-badge status-inactive">
                              <span className="status-dot dot-inactive" />
                              Disabled
                            </span>
                          ) : (
                            <span className="status-badge status-draft">
                              <span className="status-dot dot-draft" />
                              Not configured
                            </span>
                          )
                        ) : (
                          <span className="status-badge status-active">
                            <span className="status-dot dot-active" />
                            Active
                          </span>
                        )}
                      </td>

                      {/* ACTIONS */}
                      <td style={{ textAlign: 'right' }}>
                        <div className="service-actions-row">
                          {organizationId && (
                            <button
                              className="btn btn-secondary btn-sm"
                              disabled={pending || (!service.isActive && !local)}
                              onClick={() => configure(service, local)}
                            >
                              {local ? 'Configure' : 'Set up locally'}
                            </button>
                          )}
                          {isGlobal && (
                            <>
                              <button
                                className="btn-service-action btn-action-edit"
                                disabled={pending}
                                onClick={() => setEditingService(service)}
                                title="Edit service rules & details"
                              >
                                <Icon name="operations" />
                                Edit rules
                              </button>
                              <button
                                className={`btn-service-action ${
                                  service.isActive ? 'btn-action-deactivate' : 'btn-action-activate'
                                }`}
                                disabled={pending}
                                onClick={() => toggleServiceActive(service)}
                                title={
                                  service.isActive
                                    ? 'Deactivate this service'
                                    : 'Activate this service'
                                }
                              >
                                {service.isActive ? 'Deactivate' : 'Activate'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!matches.length && (
            <div className="glass-panel empty-state">
              <p>No services match these filters.</p>
              {isGlobal && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: 10 }}
                  onClick={() => setShowAddService(true)}
                >
                  <Icon name="plus" /> Add New Service
                </button>
              )}
            </div>
          )}

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

      {/* DEDICATED MODAL: ADD SERVICE (WITH FILE UPLOAD & PHOTO GALLERY) */}
      {showAddService && (
        <AddServiceModal
          categories={categories}
          onClose={() => setShowAddService(false)}
          onExpired={onExpired}
          onSuccess={(newService) => {
            setShowAddService(false);
            setNotice(`Service "${newService.nameEn}" successfully added to the catalogue!`);
            setLocalRevision((v) => v + 1);
          }}
          onOpenAddCategory={() => {
            setShowAddService(false);
            setShowAddCategory(true);
          }}
        />
      )}

      {/* DEDICATED MODAL: ADD CATEGORY */}
      {showAddCategory && (
        <AddCategoryModal
          onClose={() => setShowAddCategory(false)}
          onExpired={onExpired}
          onSuccess={(newCat) => {
            setShowAddCategory(false);
            setNotice(`Category "${newCat.nameEn}" created successfully!`);
            setLocalRevision((v) => v + 1);
          }}
        />
      )}

      {/* DEDICATED MODAL: EDIT SERVICE RULES */}
      {editingService && (
        <EditServiceModal
          service={editingService}
          onClose={() => setEditingService(null)}
          onExpired={onExpired}
          onSuccess={() => {
            setEditingService(null);
            setNotice(`Service rules for "${editingService.nameEn}" updated.`);
            setLocalRevision((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: ADD SERVICE MODAL (With File Upload & Curated Photo Library)
// ─────────────────────────────────────────────────────────────────────────────
function AddServiceModal({
  categories,
  onClose,
  onExpired,
  onSuccess,
  onOpenAddCategory,
}: {
  categories: { id: string; nameEn: string }[];
  onClose: () => void;
  onExpired: () => void;
  onSuccess: (service: Service) => void;
  onOpenAddCategory: () => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [code, setCode] = useState('');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [nameEn, setNameEn] = useState('');
  const [nameMl, setNameMl] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [descriptionMl, setDescriptionMl] = useState('');
  const [minVolunteers, setMinVolunteers] = useState(1);
  const [preferredVolunteers, setPreferredVolunteers] = useState(1);
  const [requiresSkills, setRequiresSkills] = useState(false);
  const [skillCodesInput, setSkillCodesInput] = useState('');
  const [isHazardous, setIsHazardous] = useState(false);
  const [isEmergencyProhibited, setIsEmergencyProhibited] = useState(true);
  const [baseRate, setBaseRate] = useState(1.0);

  // Visual Image Upload & Selection
  const [uploadMode, setUploadMode] = useState<'upload' | 'library' | 'url'>('upload');
  const [imageUrl, setImageUrl] = useState(CURATED_SERVICE_PHOTOS[0]?.url || '');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedCategoryName = categories.find((c) => c.id === categoryId)?.nameEn || 'General';

  function handleNameEnChange(val: string) {
    setNameEn(val);
    if (!codeManuallyEdited) {
      const generated = val
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .slice(0, 32);
      setCode(generated);
    }
  }

  function handleAutoGenerateCode() {
    const generated = nameEn
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .slice(0, 32);
    setCode(generated);
    setCodeManuallyEdited(false);
  }

  function toggleSkillTag(tag: string) {
    const currentTags = skillCodesInput
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (currentTags.includes(tag)) {
      setSkillCodesInput(currentTags.filter((t) => t !== tag).join(', '));
    } else {
      setSkillCodesInput([...currentTags, tag].join(', '));
    }
  }

  const activeSkillsList = skillCodesInput
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }

    try {
      setIsProcessingFile(true);
      setError('');
      const dataUri = await resizeImageToDataUri(file, 400, 0.75);
      setImageUrl(dataUri);
      setUploadedFileName(file.name);
    } catch {
      setError('Could not process this image file. Please try another.');
    } finally {
      setIsProcessingFile(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please drop a valid image file.');
      return;
    }

    setIsProcessingFile(true);
    resizeImageToDataUri(file, 400, 0.75)
      .then((dataUri) => {
        setImageUrl(dataUri);
        setUploadedFileName(file.name);
        setError('');
      })
      .catch(() => {
        setError('Failed to process dropped image.');
      })
      .finally(() => {
        setIsProcessingFile(false);
      });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) {
      setError('Please select or create a category first.');
      return;
    }
    if (!code.trim() || !nameEn.trim() || !nameMl.trim()) {
      setError('Service code, English name and Malayalam name are required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      let finalDescriptionEn = descriptionEn.trim();
      if (imageUrl.trim()) {
        finalDescriptionEn = `[img:${imageUrl.trim()}] ${finalDescriptionEn}`.trim();
      }

      const payload = {
        categoryId,
        code: code.trim().toUpperCase().replace(/\s+/g, '_'),
        nameEn: nameEn.trim(),
        nameMl: nameMl.trim(),
        descriptionEn: finalDescriptionEn || undefined,
        descriptionMl: descriptionMl.trim() || undefined,
        defaultMinVolunteers: Number(minVolunteers),
        defaultPreferredVolunteers: Math.max(Number(preferredVolunteers), Number(minVolunteers)),
        isHazardousPhysical: isHazardous,
        requiresSkills: requiresSkills,
        requiredSkillCodes: requiresSkills
          ? skillCodes(skillCodesInput, true)
          : [],
        isEmergencyProhibited: isEmergencyProhibited,
        baseCreditRateHourly: Number(baseRate) || 1.0,
      };

      const result = await backend<Service>('/catalogue/global', 'POST', payload);
      onSuccess(result);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onExpired();
      } else {
        setError(cause instanceof Error ? cause.message : 'Failed to create service');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modern-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modern-modal-card modal-service-optimized" role="dialog" aria-modal="true" aria-labelledby="add-service-title">
        <header className="modern-modal-header">
          <div className="modern-modal-title-group">
            <div className="modern-modal-badge">
              <Icon name="plus" />
            </div>
            <div>
              <h2 id="add-service-title">Add New Service</h2>
              <p>Configure service identity, visual photo, volunteer staffing, and platform rules</p>
            </div>
          </div>
          <button type="button" className="modern-modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="service-modal-form">
          <div className="service-modal-split">
            {/* LEFT COLUMN: FORM FIELDS */}
            <div className="service-modal-fields">
              {error && (
                <p role="alert" className="error-message">
                  {error}
                </p>
              )}

              {/* CARD 1: SERVICE IDENTITY */}
              <div className="modal-section-card">
                <div className="modal-section-card-title">
                  <div className="modal-section-title-left">
                    <span className="modal-section-badge">1</span>
                    <span className="modal-section-title-text">Service Identity</span>
                  </div>
                  <button
                    type="button"
                    className="quick-action-link"
                    onClick={onOpenAddCategory}
                  >
                    + New Category
                  </button>
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label className="form-field-label">Category</label>
                    <select
                      className="form-input"
                      required
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nameEn}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label className="form-field-label">
                      <span>Service Code</span>
                      <button
                        type="button"
                        className="quick-action-link"
                        onClick={handleAutoGenerateCode}
                        title="Auto-generate code from English name"
                      >
                        ⚡ Auto
                      </button>
                    </label>
                    <input
                      className="form-input font-mono"
                      required
                      placeholder="e.g. ELDER_CARE_DAILY"
                      value={code}
                      onChange={(e) => {
                        setCodeManuallyEdited(true);
                        setCode(e.target.value.toUpperCase().replace(/\s+/g, '_'));
                      }}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label className="form-field-label">Name (English)</label>
                    <input
                      className="form-input"
                      required
                      placeholder="e.g. Senior Friendly Visit"
                      value={nameEn}
                      onChange={(e) => handleNameEnChange(e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-field-label">Name (Malayalam)</label>
                    <input
                      className="form-input"
                      required
                      placeholder="e.g. മുതിർന്നവരെ സന്ദർശിക്കൽ"
                      value={nameMl}
                      onChange={(e) => setNameMl(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label className="form-field-label">
                      <span>Description (English)</span>
                      <span className="form-field-optional">Optional</span>
                    </label>
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="Brief summary of activities, expectations, and scope..."
                      value={descriptionEn}
                      onChange={(e) => setDescriptionEn(e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-field-label">
                      <span>Description (Malayalam)</span>
                      <span className="form-field-optional">Optional</span>
                    </label>
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="മലയാളത്തിലുള്ള വിശദീകരണം..."
                      value={descriptionMl}
                      onChange={(e) => setDescriptionMl(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* CARD 2: SERVICE PHOTO */}
              <div className="modal-section-card">
                <div className="modal-section-card-title">
                  <div className="modal-section-title-left">
                    <span className="modal-section-badge">2</span>
                    <span className="modal-section-title-text">Service Photo</span>
                  </div>
                  <div className="modal-upload-tabs" style={{ margin: 0 }}>
                    <button
                      type="button"
                      className={`modal-tab-btn ${uploadMode === 'upload' ? 'is-active' : ''}`}
                      onClick={() => setUploadMode('upload')}
                    >
                      Upload File
                    </button>
                    <button
                      type="button"
                      className={`modal-tab-btn ${uploadMode === 'library' ? 'is-active' : ''}`}
                      onClick={() => setUploadMode('library')}
                    >
                      Photo Library ({CURATED_SERVICE_PHOTOS.length})
                    </button>
                    <button
                      type="button"
                      className={`modal-tab-btn ${uploadMode === 'url' ? 'is-active' : ''}`}
                      onClick={() => setUploadMode('url')}
                    >
                      Image URL
                    </button>
                  </div>
                </div>

                {uploadMode === 'upload' && (
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleFileChange}
                    />
                    <div
                      className="file-upload-dropzone"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                    >
                      <Icon name="requests" />
                      <div>
                        <span className="dropzone-text">
                          {isProcessingFile
                            ? 'Optimizing and compressing image…'
                            : uploadedFileName
                              ? `Selected: ${uploadedFileName}`
                              : 'Click to browse or drop an image file here'}
                        </span>
                        <span className="dropzone-sub">
                          Supports JPG, PNG, WebP (auto-optimized and compressed for storage)
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {uploadMode === 'library' && (
                  <div className="photo-preset-grid-4">
                    {CURATED_SERVICE_PHOTOS.map((preset) => (
                      <button
                        type="button"
                        key={preset.name}
                        className={`photo-preset-card ${imageUrl === preset.url ? 'is-active' : ''}`}
                        onClick={() => setImageUrl(preset.url)}
                        title={preset.name}
                      >
                        <img src={preset.url} alt={preset.name} />
                        <span className="photo-preset-name">{preset.name}</span>
                        {imageUrl === preset.url && (
                          <span className="preset-check-badge">
                            <Icon name="check" />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {uploadMode === 'url' && (
                  <div className="form-field">
                    <input
                      type="url"
                      className="modal-img-url-input"
                      placeholder="Paste image link (https://...)"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                    />
                    <span className="form-field-optional" style={{ marginTop: 2 }}>
                      Direct public link from Unsplash, Pexels, or cloud storage
                    </span>
                  </div>
                )}
              </div>

              {/* CARD 3: STAFFING & CREDITS */}
              <div className="modal-section-card">
                <div className="modal-section-card-title">
                  <div className="modal-section-title-left">
                    <span className="modal-section-badge">3</span>
                    <span className="modal-section-title-text">Volunteers & Credit Rate</span>
                  </div>
                  <span className="modal-section-hint">Standard staffing headcount & rates</span>
                </div>

                <div className="form-grid-3">
                  <div className="form-field">
                    <label className="form-field-label">Min Volunteers</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      className="form-input"
                      value={minVolunteers}
                      onChange={(e) => setMinVolunteers(Number(e.target.value) || 1)}
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-field-label">Preferred Volunteers</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      className="form-input"
                      value={preferredVolunteers}
                      onChange={(e) => setPreferredVolunteers(Number(e.target.value) || 1)}
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-field-label">Rate (TC / hr)</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      max="10"
                      className="form-input"
                      value={baseRate}
                      onChange={(e) => setBaseRate(Number(e.target.value) || 1.0)}
                    />
                  </div>
                </div>
              </div>

              {/* CARD 4: SAFETY & REQUIREMENTS */}
              <div className="modal-section-card">
                <div className="modal-section-card-title">
                  <div className="modal-section-title-left">
                    <span className="modal-section-badge">4</span>
                    <span className="modal-section-title-text">Safety & Requirements</span>
                  </div>
                  <span className="modal-section-hint">Verification and risk policies</span>
                </div>

                <div className="stack" style={{ gap: 10 }}>
                  <label className="modern-toggle-box">
                    <div>
                      <strong>Verified Skills Required</strong>
                      <small>Only approved volunteers with matching verified skills can accept requests</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={requiresSkills}
                      onChange={(e) => setRequiresSkills(e.target.checked)}
                    />
                  </label>

                  {requiresSkills && (
                    <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div className="form-field">
                        <label className="form-field-label">
                          <span>Required Skill Codes</span>
                          <span className="form-field-optional">Click presets below or type codes</span>
                        </label>
                        <input
                          className="form-input font-mono"
                          placeholder="e.g. FIRST_AID, ELDER_CARE"
                          value={skillCodesInput}
                          onChange={(e) => setSkillCodesInput(e.target.value)}
                        />
                      </div>

                      <div className="skill-tag-picker">
                        {POPULAR_SKILL_TAGS.map((tag) => {
                          const isSelected = activeSkillsList.includes(tag);
                          return (
                            <button
                              type="button"
                              key={tag}
                              className={`skill-tag-chip ${isSelected ? 'is-selected' : ''}`}
                              onClick={() => toggleSkillTag(tag)}
                            >
                              {isSelected ? '✓ ' : '+ '}
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <label className="modern-toggle-box">
                    <div>
                      <strong>Heavy or Risky Physical Work</strong>
                      <small>If team falls below minimum safe headcount, automated dispatch halts</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={isHazardous}
                      onChange={(e) => setIsHazardous(e.target.checked)}
                    />
                  </label>

                  <label className="modern-toggle-box">
                    <div>
                      <strong>Emergency Prohibited</strong>
                      <small>Strict disclaimer against emergency use (112 / medical dispatch must be called)</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={isEmergencyProhibited}
                      onChange={(e) => setIsEmergencyProhibited(e.target.checked)}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: STICKY LIVE PREVIEW */}
            <div className="service-modal-preview-col">
              <div className="live-preview-box">
                <div className="live-preview-header">
                  <span>Live Member View</span>
                  <span className="live-preview-indicator">Interactive</span>
                </div>

                <div className="service-card-mockup">
                  <div className="mockup-img-wrap">
                    <img
                      src={imageUrl}
                      alt={nameEn || 'Service'}
                      className="mockup-img"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=360&auto=format&fit=crop&q=80';
                      }}
                    />
                    <div className="mockup-cat-badge">{selectedCategoryName}</div>
                    <div className="mockup-rate-badge">{baseRate.toFixed(2)} TC/hr</div>
                  </div>

                  <div className="mockup-body">
                    <span className="mockup-code">{code || 'SERVICE_CODE'}</span>
                    <h4 className="mockup-title">{nameEn || 'Service Title (English)'}</h4>
                    <p className="mockup-title-ml">{nameMl || 'സർവീസിന്റെ പേര് (മലയാളം)'}</p>
                    <p className="mockup-desc">
                      {descriptionEn ||
                        'Description of the volunteer activity, who it helps, and key instructions...'}
                    </p>

                    <div className="mockup-pills">
                      <span className="mockup-pill pill-blue">
                        <Icon name="memberships" />
                        {minVolunteers === preferredVolunteers
                          ? `${minVolunteers} vol${minVolunteers > 1 ? 's' : ''}`
                          : `${minVolunteers}–${Math.max(preferredVolunteers, minVolunteers)} vols`}
                      </span>

                      {requiresSkills && (
                        <span className="mockup-pill pill-amber" title={activeSkillsList.join(', ')}>
                          <Icon name="safety" />
                          {activeSkillsList.length > 0
                            ? `${activeSkillsList.length} skill${activeSkillsList.length > 1 ? 's' : ''} req.`
                            : 'Skills req.'}
                        </span>
                      )}

                      {isHazardous && (
                        <span className="mockup-pill pill-rose">
                          <Icon name="safety" /> Heavy / Risk
                        </span>
                      )}

                      {isEmergencyProhibited && (
                        <span className="mockup-pill pill-slate">Non-Emergency</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="preview-info-box">
                  <strong>Platform Tip:</strong> Canonical services are published across all platform organizations. Organizations can activate and adapt instructions locally.
                </div>
              </div>
            </div>
          </div>

          <footer className="modern-modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating Service…' : '+ Create Service'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: ADD CATEGORY MODAL
// ─────────────────────────────────────────────────────────────────────────────
function AddCategoryModal({
  onClose,
  onExpired,
  onSuccess,
}: {
  onClose: () => void;
  onExpired: () => void;
  onSuccess: (cat: { id: string; nameEn: string }) => void;
}) {
  const [code, setCode] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameMl, setNameMl] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !nameEn.trim() || !nameMl.trim()) {
      setError('Category code, English name and Malayalam name are required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const result = await backend<{ id: string; nameEn: string }>('/catalogue/categories', 'POST', {
        code: code.trim().toUpperCase().replace(/\s+/g, '_'),
        nameEn: nameEn.trim(),
        nameMl: nameMl.trim(),
        descriptionEn: descriptionEn.trim() || undefined,
      });
      onSuccess(result);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onExpired();
      } else {
        setError(cause instanceof Error ? cause.message : 'Failed to create category');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modern-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modern-modal-card" style={{ maxWidth: 540 }} role="dialog" aria-modal="true">
        <header className="modern-modal-header">
          <div className="modern-modal-title-group">
            <div className="modern-modal-badge">
              <Icon name="organizations" />
            </div>
            <div>
              <h2>Add Service Category</h2>
              <p>Group services into clean public catalogue categories</p>
            </div>
          </div>
          <button type="button" className="modern-modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="stack">
          <div className="modern-modal-body">
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}

            <div className="form-field">
              <label className="form-field-label">
                <span>Category Code</span>
                <span className="form-field-optional">SNAKE_CASE</span>
              </label>
              <input
                className="form-input"
                required
                placeholder="e.g. HEALTHCARE"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
              />
            </div>

            <div className="form-field">
              <label className="form-field-label">
                <span>Name (English)</span>
              </label>
              <input
                className="form-input"
                required
                placeholder="e.g. Healthcare & Medical Escort"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="form-field-label">
                <span>Name (Malayalam)</span>
              </label>
              <input
                className="form-input"
                required
                placeholder="e.g. ആരോഗ്യ പരിചരണം"
                value={nameMl}
                onChange={(e) => setNameMl(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="form-field-label">
                <span>Description</span>
                <span className="form-field-optional">Optional</span>
              </label>
              <textarea
                className="form-input"
                rows={2}
                placeholder="Brief summary of what this category covers..."
                value={descriptionEn}
                onChange={(e) => setDescriptionEn(e.target.value)}
              />
            </div>
          </div>

          <footer className="modern-modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating…' : '+ Create Category'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT: EDIT SERVICE RULES MODAL (With Image URL or Upload Update)
// ─────────────────────────────────────────────────────────────────────────────
function EditServiceModal({
  service,
  onClose,
  onExpired,
  onSuccess,
}: {
  service: Service;
  onClose: () => void;
  onExpired: () => void;
  onSuccess: () => void;
}) {
  const visual = getServiceVisual(service);
  const [nameEn, setNameEn] = useState(service.nameEn);
  const [nameMl, setNameMl] = useState(service.nameMl);
  const [descriptionEn, setDescriptionEn] = useState(visual.cleanDesc);
  const [imageUrl, setImageUrl] = useState(visual.url || '');
  const [minVolunteers, setMinVolunteers] = useState(service.defaultMinVolunteers);
  const [preferredVolunteers, setPreferredVolunteers] = useState(service.defaultPreferredVolunteers);
  const [requiresSkills, setRequiresSkills] = useState(service.requiresSkills);
  const [skillCodesInput, setSkillCodesInput] = useState(
    (service.requiredSkillCodes ?? []).join(', '),
  );
  const [isHazardous, setIsHazardous] = useState(Boolean(service.isHazardousPhysical));

  const [uploadMode, setUploadMode] = useState<'upload' | 'library' | 'url'>('upload');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggleSkillTag(tag: string) {
    const currentTags = skillCodesInput
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (currentTags.includes(tag)) {
      setSkillCodesInput(currentTags.filter((t) => t !== tag).join(', '));
    } else {
      setSkillCodesInput([...currentTags, tag].join(', '));
    }
  }

  const activeSkillsList = skillCodesInput
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }

    try {
      setIsProcessingFile(true);
      setError('');
      const dataUri = await resizeImageToDataUri(file, 400, 0.75);
      setImageUrl(dataUri);
      setUploadedFileName(file.name);
    } catch {
      setError('Could not process image file.');
    } finally {
      setIsProcessingFile(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please drop a valid image file.');
      return;
    }

    setIsProcessingFile(true);
    resizeImageToDataUri(file, 400, 0.75)
      .then((dataUri) => {
        setImageUrl(dataUri);
        setUploadedFileName(file.name);
        setError('');
      })
      .catch(() => {
        setError('Failed to process dropped image.');
      })
      .finally(() => {
        setIsProcessingFile(false);
      });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      let finalDescriptionEn = descriptionEn.trim();
      if (imageUrl.trim()) {
        finalDescriptionEn = `[img:${imageUrl.trim()}] ${finalDescriptionEn}`.trim();
      }

      const payload = {
        nameEn: nameEn.trim(),
        nameMl: nameMl.trim(),
        descriptionEn: finalDescriptionEn || undefined,
        defaultMinVolunteers: Number(minVolunteers),
        defaultPreferredVolunteers: Math.max(Number(preferredVolunteers), Number(minVolunteers)),
        isHazardousPhysical: isHazardous,
        requiresSkills: requiresSkills,
        requiredSkillCodes: requiresSkills
          ? skillCodes(skillCodesInput, true)
          : [],
      };

      await backend(`/catalogue/global/${service.id}`, 'PATCH', payload);
      onSuccess();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onExpired();
      } else {
        setError(cause instanceof Error ? cause.message : 'Failed to update service rules');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modern-modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modern-modal-card modal-service-optimized" role="dialog" aria-modal="true">
        <header className="modern-modal-header">
          <div className="modern-modal-title-group">
            <div className="modern-modal-badge">
              <Icon name="catalogue" />
            </div>
            <div>
              <h2>Edit Rules: {service.nameEn}</h2>
              <p>Configure canonical rules, volunteer staffing, photo and skill requirements</p>
            </div>
          </div>
          <button type="button" className="modern-modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="service-modal-form">
          <div className="service-modal-split">
            {/* LEFT COLUMN: FORM FIELDS */}
            <div className="service-modal-fields">
              {error && (
                <p role="alert" className="error-message">
                  {error}
                </p>
              )}

              {/* CARD 1: SERVICE IDENTITY */}
              <div className="modal-section-card">
                <div className="modal-section-card-title">
                  <div className="modal-section-title-left">
                    <span className="modal-section-badge">1</span>
                    <span className="modal-section-title-text">Service Identity</span>
                  </div>
                  <span className="modal-section-hint">Code: {service.code}</span>
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label className="form-field-label">Name (English)</label>
                    <input
                      className="form-input"
                      required
                      value={nameEn}
                      onChange={(e) => setNameEn(e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-field-label">Name (Malayalam)</label>
                    <input
                      className="form-input"
                      required
                      value={nameMl}
                      onChange={(e) => setNameMl(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label className="form-field-label">
                    <span>Description (English)</span>
                    <span className="form-field-optional">Optional</span>
                  </label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Brief summary of activities, expectations, and scope..."
                    value={descriptionEn}
                    onChange={(e) => setDescriptionEn(e.target.value)}
                  />
                </div>
              </div>

              {/* CARD 2: SERVICE PHOTO */}
              <div className="modal-section-card">
                <div className="modal-section-card-title">
                  <div className="modal-section-title-left">
                    <span className="modal-section-badge">2</span>
                    <span className="modal-section-title-text">Service Photo</span>
                  </div>
                  <div className="modal-upload-tabs" style={{ margin: 0 }}>
                    <button
                      type="button"
                      className={`modal-tab-btn ${uploadMode === 'upload' ? 'is-active' : ''}`}
                      onClick={() => setUploadMode('upload')}
                    >
                      Upload File
                    </button>
                    <button
                      type="button"
                      className={`modal-tab-btn ${uploadMode === 'library' ? 'is-active' : ''}`}
                      onClick={() => setUploadMode('library')}
                    >
                      Photo Library
                    </button>
                    <button
                      type="button"
                      className={`modal-tab-btn ${uploadMode === 'url' ? 'is-active' : ''}`}
                      onClick={() => setUploadMode('url')}
                    >
                      Image URL
                    </button>
                  </div>
                </div>

                {uploadMode === 'upload' && (
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleFileChange}
                    />
                    <div
                      className="file-upload-dropzone"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                    >
                      <Icon name="requests" />
                      <div>
                        <span className="dropzone-text">
                          {isProcessingFile
                            ? 'Compressing image…'
                            : uploadedFileName
                              ? `Selected: ${uploadedFileName}`
                              : 'Click to browse or drop an image file to update'}
                        </span>
                        <span className="dropzone-sub">
                          Supports JPG, PNG, WebP (auto-optimized)
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {uploadMode === 'library' && (
                  <div className="photo-preset-grid-4">
                    {CURATED_SERVICE_PHOTOS.map((preset) => (
                      <button
                        type="button"
                        key={preset.name}
                        className={`photo-preset-card ${imageUrl === preset.url ? 'is-active' : ''}`}
                        onClick={() => setImageUrl(preset.url)}
                        title={preset.name}
                      >
                        <img src={preset.url} alt={preset.name} />
                        <span className="photo-preset-name">{preset.name}</span>
                        {imageUrl === preset.url && (
                          <span className="preset-check-badge">
                            <Icon name="check" />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {uploadMode === 'url' && (
                  <div className="form-field">
                    <input
                      type="url"
                      className="modal-img-url-input"
                      placeholder="Paste image link (https://...)"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* CARD 3: STAFFING */}
              <div className="modal-section-card">
                <div className="modal-section-card-title">
                  <div className="modal-section-title-left">
                    <span className="modal-section-badge">3</span>
                    <span className="modal-section-title-text">Volunteer Staffing</span>
                  </div>
                  <span className="modal-section-hint">Standard headcount required</span>
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label className="form-field-label">Min Volunteers</label>
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      value={minVolunteers}
                      onChange={(e) => setMinVolunteers(Number(e.target.value) || 1)}
                    />
                  </div>

                  <div className="form-field">
                    <label className="form-field-label">Preferred Volunteers</label>
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      value={preferredVolunteers}
                      onChange={(e) => setPreferredVolunteers(Number(e.target.value) || 1)}
                    />
                  </div>
                </div>
              </div>

              {/* CARD 4: SAFETY & REQUIREMENTS */}
              <div className="modal-section-card">
                <div className="modal-section-card-title">
                  <div className="modal-section-title-left">
                    <span className="modal-section-badge">4</span>
                    <span className="modal-section-title-text">Safety & Requirements</span>
                  </div>
                  <span className="modal-section-hint">Verification policies</span>
                </div>

                <div className="stack" style={{ gap: 10 }}>
                  <label className="modern-toggle-box">
                    <div>
                      <strong>Verified Skills Required</strong>
                      <small>Only approved volunteers with matching verified skills can accept requests</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={requiresSkills}
                      onChange={(e) => setRequiresSkills(e.target.checked)}
                    />
                  </label>

                  {requiresSkills && (
                    <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                      <div className="form-field">
                        <label className="form-field-label">
                          <span>Required Skill Codes</span>
                          <span className="form-field-optional">Click presets or type codes</span>
                        </label>
                        <input
                          className="form-input font-mono"
                          placeholder="e.g. FIRST_AID, ELDER_CARE"
                          value={skillCodesInput}
                          onChange={(e) => setSkillCodesInput(e.target.value)}
                        />
                      </div>

                      <div className="skill-tag-picker">
                        {POPULAR_SKILL_TAGS.map((tag) => {
                          const isSelected = activeSkillsList.includes(tag);
                          return (
                            <button
                              type="button"
                              key={tag}
                              className={`skill-tag-chip ${isSelected ? 'is-selected' : ''}`}
                              onClick={() => toggleSkillTag(tag)}
                            >
                              {isSelected ? '✓ ' : '+ '}
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <label className="modern-toggle-box">
                    <div>
                      <strong>Heavy or Risky Physical Work</strong>
                      <small>If team falls below minimum safe headcount, automated dispatch halts</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={isHazardous}
                      onChange={(e) => setIsHazardous(e.target.checked)}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: STICKY LIVE PREVIEW */}
            <div className="service-modal-preview-col">
              <div className="live-preview-box">
                <div className="live-preview-header">
                  <span>Live Preview</span>
                  <span className="live-preview-indicator">Updated</span>
                </div>

                <div className="service-card-mockup">
                  <div className="mockup-img-wrap">
                    <img
                      src={imageUrl}
                      alt={nameEn}
                      className="mockup-img"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=360&auto=format&fit=crop&q=80';
                      }}
                    />
                    <div className="mockup-cat-badge">{service.category?.nameEn || 'General'}</div>
                  </div>

                  <div className="mockup-body">
                    <span className="mockup-code">{service.code}</span>
                    <h4 className="mockup-title">{nameEn}</h4>
                    <p className="mockup-title-ml">{nameMl}</p>
                    <p className="mockup-desc">
                      {descriptionEn || 'No description provided.'}
                    </p>

                    <div className="mockup-pills">
                      <span className="mockup-pill pill-blue">
                        <Icon name="memberships" />
                        {minVolunteers === preferredVolunteers
                          ? `${minVolunteers} vol${minVolunteers > 1 ? 's' : ''}`
                          : `${minVolunteers}–${Math.max(preferredVolunteers, minVolunteers)} vols`}
                      </span>

                      {requiresSkills && (
                        <span className="mockup-pill pill-amber" title={activeSkillsList.join(', ')}>
                          <Icon name="safety" />
                          {activeSkillsList.length > 0
                            ? `${activeSkillsList.length} skill${activeSkillsList.length > 1 ? 's' : ''} req.`
                            : 'Skills req.'}
                        </span>
                      )}

                      {isHazardous && (
                        <span className="mockup-pill pill-rose">
                          <Icon name="safety" /> Heavy / Risk
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="preview-info-box">
                  <strong>Changes apply globally:</strong> Edits to canonical rules immediately update the service guidelines for all organizations offering this service.
                </div>
              </div>
            </div>
          </div>

          <footer className="modern-modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving Changes…' : 'Save Changes'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
