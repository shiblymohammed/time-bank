'use client';

import { useEffect, useState } from 'react';
import { ApiError, backend } from '@/lib/api';

export type AttentionDestination = 'safety' | 'requests' | 'instant-help' | 'memberships';
const destinationLabels: Record<AttentionDestination, string> = {
  safety: 'Safety Alerts',
  requests: 'Requests & Matching',
  'instant-help': 'Instant Help',
  memberships: 'Memberships',
};
type Row = { id: string; label: string; detail?: string };
type Queue = { total: number; rows: Row[]; capped?: boolean };
type Group = {
  id: string;
  title: string;
  destination: AttentionDestination;
  load: () => Promise<Queue>;
};
type GroupResult = Pick<Group, 'id' | 'title' | 'destination'> & {
  queue?: Queue;
  error?: string;
  keepPrevious?: boolean;
};
type RequestRow = {
  id: string;
  requestNumber: string;
  serviceCatalog?: { customLabelEn?: string; globalService?: { nameEn: string } };
};
type Member = {
  id: string;
  membershipNumber?: string;
  user?: { fullName?: string };
};

function queueGroups(organizationId: string, signal: AbortSignal): Group[] {
  const base = `/organizations/${organizationId}`;
  const get = <T,>(path: string) => backend<T>(`${base}/${path}`, 'GET', undefined, signal);
  const requests = async (filter: 'needsDispatch' | 'needsReview') => {
    const result = await get<{ data: RequestRow[]; total: number }>(
      `requests?${filter}=true&limit=5`,
    );
    return {
      total: result.total,
      rows: result.data.map((row) => ({
        id: row.id,
        label:
          row.serviceCatalog?.customLabelEn ||
          row.serviceCatalog?.globalService?.nameEn ||
          'Help request',
        detail: row.requestNumber,
      })),
    };
  };
  return [
    {
      id: 'safety',
      title: 'Safety alerts',
      destination: 'safety',
      load: async () => {
        const alerts = await get<
          {
            id: string;
            status: string;
            request: { serviceName: string; requestNumber: string };
          }[]
        >('safety-alerts');
        const ordered = [...alerts].sort(
          (a, b) => Number(b.status === 'OPEN') - Number(a.status === 'OPEN'),
        );
        return {
          total: alerts.length,
          capped: alerts.length === 100,
          rows: ordered.slice(0, 5).map((alert) => ({
            id: alert.id,
            label: alert.request.serviceName,
            detail: `${alert.status === 'OPEN' ? 'New alert' : 'Acknowledged'} · ${alert.request.requestNumber}`,
          })),
        };
      },
    },
    {
      id: 'dispatch',
      title: 'Requests needing a volunteer',
      destination: 'requests',
      load: () => requests('needsDispatch'),
    },
    {
      id: 'visits',
      title: 'Scheduled visits needing review',
      destination: 'requests',
      load: () => requests('needsReview'),
    },
    {
      id: 'instant',
      title: 'Instant Help to verify',
      destination: 'instant-help',
      load: async () => {
        const sessions = await get<
          { id: string; volunteerName: string | null; membershipNumber: string }[]
        >('instant-help/reviews?status=PENDING');
        return {
          total: sessions.length,
          capped: sessions.length === 100,
          rows: sessions.slice(0, 5).map((session) => ({
            id: session.id,
            label: session.volunteerName || 'Volunteer',
            detail: session.membershipNumber,
          })),
        };
      },
    },
    {
      id: 'members',
      title: 'Open membership applications',
      destination: 'memberships',
      load: async () => {
        const batches = await Promise.all(
          ['PENDING_REVIEW', 'APPLIED'].map((status) =>
            get<{ memberships: Member[]; total: number }>(`memberships?status=${status}&limit=5`),
          ),
        );
        return {
          total: batches.reduce((total, batch) => total + batch.total, 0),
          rows: batches
            .flatMap((batch) => batch.memberships)
            .slice(0, 5)
            .map((member) => ({
              id: member.id,
              label: member.user?.fullName || 'Membership application',
              ...(member.membershipNumber ? { detail: member.membershipNumber } : {}),
            })),
        };
      },
    },
  ];
}

export function NeedsAttention({
  organizationId,
  revision,
  onOpen,
  onExpired,
}: {
  organizationId: string;
  revision: number;
  onOpen: (destination: AttentionDestination, id: string) => void;
  onExpired: () => void;
}) {
  const [groups, setGroups] = useState<GroupResult[] | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function load() {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      setLoading(true);
      const result: GroupResult[] = await Promise.all(
        queueGroups(organizationId, controller.signal).map(async ({ load, ...group }) => {
          try {
            return { ...group, queue: await load() };
          } catch (error) {
            if (!controller.signal.aborted && error instanceof ApiError && error.status === 401)
              onExpired();
            const status = error instanceof ApiError ? error.status : undefined;
            return {
              ...group,
              error: group.id === 'dispatch' && status === 400
                ? 'The running API could not load the dispatch queue. Check that the API is up to date.'
                : 'Could not load this queue. Use Refresh to retry.',
              keepPrevious: status !== 401 && status !== 403,
            };
          }
        }),
      );
      if (!controller.signal.aborted) {
        setGroups((previous) => result.map((group) => {
          const cached = group.keepPrevious && previous?.find((item) => item.id === group.id)?.queue;
          return cached ? { ...group, queue: cached } : group;
        }));
        setLoading(false);
      }
      inFlight = false;
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30_000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [organizationId, revision, refresh, onExpired]);

  return (
    <div className="request-workspace request-page">
      <div className="section-heading request-page-heading">
        <h2>Needs attention</h2>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          Refresh
        </button>
      </div>
      {!groups && <p role="status">Checking for cases…</p>}
      {groups?.map(({ id, title, destination, queue, error }) => (
        <section
          className={`glass-panel detail-panel attention-queue${id === 'safety' && queue?.total ? ' attention-queue-urgent' : ''}`}
          key={id}
          aria-labelledby={`attention-${id}`}
        >
          <div className="section-heading">
            <h3 id={`attention-${id}`}>{title}</h3>
            {queue && (
              <span className="record-count">
                {queue.total}
                {queue.capped ? '+' : ''}
              </span>
            )}
          </div>
          {error && (
            <p className="error-message" role="status">
              {error}
            </p>
          )}
          {queue?.total === 0 && <p className="help-text">No cases waiting.</p>}
          {queue?.rows.length ? (
            <ul className="attention-case-list">
              {queue.rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => onOpen(destination, row.id)}
                  >
                    {row.label}
                    {row.detail ? ` · ${row.detail}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {queue && queue.total > queue.rows.length && (
            <div className="action-row">
              <span className="help-text">Showing the first {queue.rows.length} cases.</span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onOpen(destination, '')}
              >
                Open {destinationLabels[destination]}
              </button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
