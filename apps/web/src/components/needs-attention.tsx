'use client';

import { useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/icons';
import { ApiError, backend } from '@/lib/api';

export type AttentionDestination = 'safety' | 'requests' | 'instant-help' | 'memberships';
const queueDetails = {
  safety: { icon: 'safety', action: 'Open safety alerts' },
  dispatch: { icon: 'requests', action: 'Open requests' },
  visits: { icon: 'calendar', action: 'Open requests' },
  instant: { icon: 'lightning', action: 'Open Instant Help' },
  members: { icon: 'memberships', action: 'Open memberships' },
} satisfies Record<string, { icon: IconName; action: string }>;
type Row = { id: string; label: string; detail?: string };
type Queue = { total: number; rows: Row[]; capped?: boolean };
type Group = {
  id: keyof typeof queueDetails;
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
    <section className="staff-workspace" aria-labelledby="staff-queue-title">
      <div className="workspace-section-heading">
        <h2 id="staff-queue-title">Work queues</h2>
        <button
          type="button"
          className="admin-control"
          disabled={loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <Icon name="refresh" size={15} /> Refresh queues
        </button>
      </div>
      {!groups && <p className="staff-queue-loading" role="status">Checking for cases…</p>}
      <div className="staff-queue-grid">
        {groups?.map(({ id, title, destination, queue, error }) => (
          <section
            className="staff-queue-card"
            data-priority={id === 'safety' || id === 'dispatch' ? true : undefined}
            data-urgent={id === 'safety' && Boolean(queue?.total) ? true : undefined}
            key={id}
            aria-labelledby={`attention-${id}`}
          >
            <header className="staff-queue-header">
              <span className="workspace-icon"><Icon name={queueDetails[id].icon} size={18} /></span>
              <h3 id={`attention-${id}`}>{title}</h3>
              {queue && (
                <span className="staff-queue-count">
                  {queue.total.toLocaleString('en-IN')}{queue.capped ? '+' : ''}
                  <span className="sr-only"> cases</span>
                </span>
              )}
            </header>
            {error && (
              <p className="staff-queue-error" role="status">
                {error} {queue && 'Showing the last loaded cases.'}
              </p>
            )}
            {queue?.total === 0 && (
              <p className="staff-queue-empty"><Icon name="check" size={16} /> No cases waiting</p>
            )}
            {queue && queue.rows.length > 0 && (
              <ul className="staff-case-list">
                {queue.rows.map((row) => (
                  <li key={row.id}>
                    <button type="button" onClick={() => onOpen(destination, row.id)}>
                      <span>
                        <strong>{row.label}</strong>
                        {row.detail && <small>{row.detail}</small>}
                      </span>
                      <Icon name="chevronRight" size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <footer className="staff-queue-footer">
              <button type="button" className="workspace-link" onClick={() => onOpen(destination, '')}>
                {queueDetails[id].action} <Icon name="arrowRight" size={15} />
              </button>
              {queue && queue.total > queue.rows.length && (
                <span>First {queue.rows.length} shown</span>
              )}
            </footer>
          </section>
        ))}
      </div>
    </section>
  );
}
