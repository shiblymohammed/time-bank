'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { backend } from '@/lib/api';

type CommunityEvent = {
  id: string;
  title: string;
  description: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  attendees: number;
  capacity: number | null;
};
type EventPage = { items: CommunityEvent[]; nextOffset: number | null };
const emptyEvent = {
  title: '',
  description: '',
  venue: '',
  startsAt: '',
  endsAt: '',
  capacity: '',
};

export function CommunityEvents({
  organizationId,
  revision,
}: {
  organizationId: string;
  revision: number;
}) {
  const path = `/organizations/${organizationId}/community/events`;
  const [fields, setFields] = useState(emptyEvent);
  const [publishAttempt, setPublishAttempt] = useState<{ key: string; id: string } | null>(null);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [timezone, setTimezone] = useState('');

  useEffect(() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    void backend<EventPage>(
      `${path}?view=staff&offset=${offset}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((page) => {
        if (controller.signal.aborted) return;
        setEvents((current) =>
          offset === 0
            ? page.items
            : [
                ...current,
                ...page.items.filter((item) => !current.some((event) => event.id === item.id)),
              ],
        );
        setNext(page.nextOffset);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(error instanceof Error ? error.message : 'Could not load events.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision, offset, refresh]);

  function reload() {
    setOffset(0);
    setRefresh((value) => value + 1);
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      await action();
      reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not save the event.');
    } finally {
      setBusy(false);
    }
  }

  function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      const startsAt = new Date(fields.startsAt),
        endsAt = new Date(fields.endsAt);
      if (
        !Number.isFinite(startsAt.getTime()) ||
        !Number.isFinite(endsAt.getTime()) ||
        endsAt <= startsAt
      ) {
        throw new Error('Choose a start time and a later end time.');
      }
      const values = {
        title: fields.title.trim(),
        description: fields.description.trim(),
        venue: fields.venue.trim(),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        ...(fields.capacity ? { capacity: Number(fields.capacity) } : {}),
      };
      const key = JSON.stringify(values);
      const id = publishAttempt?.key === key ? publishAttempt.id : crypto.randomUUID();
      setPublishAttempt({ key, id });
      await backend(path, 'POST', { id, ...values });
      setFields(emptyEvent);
      setPublishAttempt(null);
      setNotice('Event published. Members can now sign up.');
    });
  }

  return (
    <section className="glass-panel stack" style={{ padding: 22 }} aria-busy={busy || loading}>
      <h2>Community events</h2>
      <form className="stack" onSubmit={publish}>
        <h3>Publish an event</h3>
        {(
          [
            ['title', 'Event title', 'text', 120],
            ['venue', 'Venue or meeting point', 'text', 200],
            ['startsAt', 'Starts', 'datetime-local'],
            ['endsAt', 'Ends', 'datetime-local'],
            ['capacity', 'Capacity (optional)', 'number'],
          ] as const
        ).map(([key, label, type, maxLength]) => (
          <label key={key}>
            {label}
            <input
              className="form-input"
              type={type}
              required={key !== 'capacity'}
              maxLength={maxLength}
              min={key === 'capacity' ? 1 : undefined}
              max={key === 'capacity' ? 10000 : undefined}
              value={fields[key]}
              disabled={busy}
              onChange={(event) => setFields({ ...fields, [key]: event.target.value })}
            />
          </label>
        ))}
        {timezone && <p className="help-text">Times use your browser’s time zone ({timezone}).</p>}
        <label>
          Description
          <textarea
            className="form-input"
            required
            maxLength={2000}
            rows={3}
            value={fields.description}
            disabled={busy}
            onChange={(event) => setFields({ ...fields, description: event.target.value })}
          />
        </label>
        <div>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Publish event
          </button>
        </div>
      </form>
      {notice && (
        <p role="status" className="success-message">
          {notice}
        </p>
      )}
      {actionError && (
        <p role="alert" className="error-message">
          {actionError}
        </p>
      )}
      <h3>Published and past events</h3>
      <div>
        <button className="btn btn-secondary" disabled={loading || busy} onClick={reload}>
          Refresh events
        </button>
      </div>
      {loading && <p role="status">Loading events…</p>}
      {loadError && (
        <p role="alert" className="error-message">
          {loadError}
        </p>
      )}
      {!loading && !loadError && !events.length && <p>No events have been published.</p>}
      {events.map((event) => (
        <article
          key={event.id}
          className="stack"
          style={{ borderTop: '1px solid #ddd', paddingTop: 16 }}
        >
          <h4>{event.title}</h4>
          <p>
            {event.venue} · {new Date(event.starts_at).toLocaleString()} –{' '}
            {new Date(event.ends_at).toLocaleString()}
          </p>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{event.description}</p>
          <p className="help-text">
            {event.attendees}
            {event.capacity !== null ? ` / ${event.capacity}` : ''} signed up
          </p>
          {event.cancelled_at ? (
            <p>Cancelled. {event.cancellation_reason}</p>
          ) : cancelId === event.id ? (
            <form
              className="stack"
              onSubmit={(submission) => {
                submission.preventDefault();
                void run(async () => {
                  await backend(`${path}/${event.id}/cancel`, 'POST', { reason: reason.trim() });
                  setCancelId(null);
                  setNotice('Event cancelled. Signed-up members can see the reason in My events.');
                });
              }}
            >
              <label>
                Reason visible to signed-up members
                <textarea
                  className="form-input"
                  required
                  maxLength={500}
                  value={reason}
                  disabled={busy}
                  onChange={(change) => setReason(change.target.value)}
                />
              </label>
              <div className="action-row">
                <button className="btn btn-danger" type="submit" disabled={busy || !reason.trim()}>
                  Confirm cancellation
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setCancelId(null)}
                >
                  Keep event
                </button>
              </div>
            </form>
          ) : (
            Date.parse(event.ends_at) > Date.now() && (
              <div>
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    setCancelId(event.id);
                    setReason('');
                    setActionError('');
                  }}
                >
                  Cancel event
                </button>
              </div>
            )
          )}
        </article>
      ))}
      {next !== null && (
        <div>
          <button
            className="btn btn-secondary"
            disabled={loading || busy}
            onClick={() => {
              if (offset === next) setRefresh((value) => value + 1);
              else setOffset(next);
            }}
          >
            Load more events
          </button>
        </div>
      )}
    </section>
  );
}
