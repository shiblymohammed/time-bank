'use client';
import { useEffect, useRef, useState } from 'react';
import { backend, ApiError } from '@/lib/api';
import { indiaTime } from '@/lib/request-utils';

type Session = {
  id: string;
  description: string;
  status: string;
  volunteerName: string | null;
  membershipNumber: string;
  membershipStatus: string;
  startedAt: string;
  finishedAt: string | null;
  locationLabel: string;
  latitude: number | null;
  longitude: number | null;
  reportedMinutes: number | null;
  approvedMinutes: number | null;
  notes: string | null;
  reviewNotes: string | null;
  version: number;
  photos: string[];
  voiceDurationMs: number | null;
  creditsEarned: number;
};
export function InstantHelpReviews({
  organizationId,
  initialCaseId = '',
  onExpired,
  dashboardRevision,
}: {
  organizationId: string;
  initialCaseId?: string;
  onExpired: () => void;
  dashboardRevision: number;
}) {
  const [status, setStatus] = useState('PENDING');
  const [refresh, setRefresh] = useState(0);
  const [rows, setRows] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const loadedStatus = useRef<string | null>(null);
  const [message, setMessage] = useState('');
  const [minutes, setMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const epoch = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const caseToOpen = useRef(initialCaseId);
  const openedFromAttention = useRef(false);
  useEffect(() => {
    if (!initialCaseId || selected?.id !== initialCaseId || openedFromAttention.current) return;
    const panel = document.getElementById('instant-help-review-detail');
    if (!panel) return;
    openedFromAttention.current = true;
    panel.focus();
    panel.scrollIntoView({ block: 'start' });
  }, [initialCaseId, selected]);
  useEffect(() => {
    if (busy) return;
    const version = ++epoch.current;
    setLoading(true);
    setLoadError('');
    if (loadedStatus.current !== status) {
      setSelected(null);
      setRows([]);
    }
    const controller = new AbortController();
    backend<Session[]>(
      `/organizations/${organizationId}/instant-help/reviews?status=${status}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((data) => {
        if (epoch.current !== version) return;
        setRows(data);
        loadedStatus.current = status;
        if (caseToOpen.current) {
          const match = data.find((row) => row.id === caseToOpen.current);
          caseToOpen.current = '';
          if (match) choose(match);
          else setMessage('This case is no longer waiting for review.');
        }
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        if (e instanceof ApiError && e.status === 401) onExpired();
        else if (epoch.current === version) {
          if (e instanceof ApiError && e.status === 403) {
            setRows([]);
            setSelected(null);
          }
          setLoadError('Could not load the latest sessions. Use Check for new sessions to retry.');
        }
      })
      .finally(() => {
        if (epoch.current === version) setLoading(false);
      });
    return () => {
      controller.abort();
      epoch.current++;
    };
  }, [organizationId, status, onExpired, refresh, dashboardRevision, busy]);
  function choose(row: Session) {
    setSelected(row);
    setNotes('');
    setMinutes(String(Math.min(row.reportedMinutes ?? 1, 720)));
    setError('');
    setMessage('');
  }
  async function review(decision: 'APPROVE' | 'REJECT' | 'NEEDS_INFO') {
    if (!selected || busy || loading) return;
    if (notes.trim().length < 3) {
      setError('Add a short explanation for the volunteer.');
      return;
    }
    const approved = Number(minutes);
    if (
      decision === 'APPROVE' &&
      (!Number.isInteger(approved) ||
        approved < 1 ||
        approved > Math.min(selected.reportedMinutes ?? 0, 720))
    ) {
      setError('Enter whole minutes up to the recorded duration, with a maximum of 720.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await backend<Session>(
        `/organizations/${organizationId}/instant-help/${selected.id}/review`,
        'POST',
        {
          decision,
          version: selected.version,
          notes: notes.trim(),
          ...(decision === 'APPROVE' ? { minutes: approved } : {}),
        },
      );
      if (!mounted.current) return;
      setRows((old) => old.filter((row) => row.id !== saved.id));
      setSelected(saved);
      setMessage(
        decision === 'APPROVE'
          ? `Approved ${saved.approvedMinutes} minutes. ${saved.creditsEarned} time credits recorded.`
          : decision === 'NEEDS_INFO'
            ? 'The volunteer has been asked for more information.'
            : 'Session closed without credits.',
      );
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof ApiError && e.status === 401) onExpired();
      else {
        setError(e instanceof Error ? e.message : 'Review failed');
        if (e instanceof ApiError && e.status === 409) {
          setSelected(null);
          setRefresh((value) => value + 1);
        }
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="glass-panel" aria-label="Instant help reviews">
      <div className="section-heading">
        <div>
          <h2>Instant help reviews</h2>
          <p>Verify unplanned help before awarding time credits. Evidence stays private.</p>
        </div>
        <label>
          Status{' '}
          <select value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)}>
            <option value="PENDING">Awaiting review</option>
            <option value="NEEDS_INFO">Needs information</option>
            <option value="RUNNING">Running timers</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Not approved</option>
          </select>
        </label>
      </div>
      <button
        className="btn btn-secondary"
        disabled={busy || loading}
        onClick={() => setRefresh((value) => value + 1)}
      >
        Check for new sessions
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loadError && <p role="alert">{loadError}</p>}
      {message && <p role="status">{message}</p>}
      {loading && rows.length > 0 && <p role="status">Refreshing instant help.</p>}
      {loading && rows.length === 0 ? (
        <p role="status">Loading instant help…</p>
      ) : rows.length === 0 ? (
        !loadError && <p>No sessions in this status.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Volunteer</th>
                <th>Situation</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.volunteerName ?? row.membershipNumber}
                    <small style={{ display: 'block' }}>{row.membershipNumber}</small>
                  </td>
                  <td>{row.description}</td>
                  <td>{indiaTime(row.startedAt)}</td>
                  <td>{row.reportedMinutes == null ? 'Running' : `${row.reportedMinutes} min`}</td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => choose(row)}
                    >
                      View session
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <section
          id="instant-help-review-detail"
          tabIndex={-1}
          className="glass-panel"
          style={{ marginTop: 20, padding: 20 }}
          aria-label="Session evidence"
        >
          <h3>{selected.description}</h3>
          <p>
            <strong>{selected.volunteerName ?? selected.membershipNumber}</strong> ·{' '}
            {selected.membershipNumber} · Membership {selected.membershipStatus.toLowerCase()}
          </p>
          <dl>
            <dt>Location</dt>
            <dd>
              {selected.locationLabel}
              {selected.latitude != null && selected.longitude != null && (
                <small style={{ display: 'block' }}>
                  {selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}
                </small>
              )}
            </dd>
            <dt>Started</dt>
            <dd>{indiaTime(selected.startedAt)}</dd>
            {selected.finishedAt && (
              <>
                <dt>Finished</dt>
                <dd>{indiaTime(selected.finishedAt)}</dd>
              </>
            )}
            <dt>Server-recorded elapsed time</dt>
            <dd>
              {selected.finishedAt
                ? `${Math.max(0, Math.floor((Date.parse(selected.finishedAt) - Date.parse(selected.startedAt)) / 1000))} seconds`
                : 'Timer running'}
            </dd>
            <dt>Reported duration</dt>
            <dd>
              {selected.reportedMinutes == null
                ? 'Still running'
                : `${selected.reportedMinutes} minutes`}
            </dd>
            {selected.approvedMinutes != null && (
              <>
                <dt>Approved duration</dt>
                <dd>{selected.approvedMinutes} minutes</dd>
              </>
            )}
          </dl>
          {selected.latitude != null && selected.longitude != null && (
            <a
              className="btn btn-secondary"
              target="_blank"
              rel="noreferrer"
              href={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}`}
            >
              View location pin ↗
            </a>
          )}
          <p style={{ whiteSpace: 'pre-wrap' }}>{selected.notes ?? 'No completion note yet.'}</p>
          {selected.reviewNotes && (
            <p>
              <strong>Last review note:</strong> {selected.reviewNotes}
            </p>
          )}
          {selected.voiceDurationMs != null && (
            <div key={selected.id} style={{ margin: '16px 0' }}>
              <p>
                <strong>Volunteer voice note</strong> · {Math.ceil(selected.voiceDurationMs / 1000)}{' '}
                sec
              </p>
              <audio
                controls
                preload="none"
                aria-label="Play private voice note"
                style={{ width: '100%', maxWidth: 380 }}
                src={`/api/backend/organizations/${organizationId}/instant-help/${selected.id}/voice`}
                onError={() =>
                  setError('Could not load the voice note. Reopen the session to try again.')
                }
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {selected.photos.map((id, index) => (
              <a
                key={id}
                target="_blank"
                rel="noreferrer"
                href={`/api/backend/organizations/${organizationId}/instant-help/${selected.id}/photos/${id}`}
                aria-label={`Open private evidence photo ${index + 1}`}
              >
                {/* Private same-origin gateway supplies authentication; no public image URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/backend/organizations/${organizationId}/instant-help/${selected.id}/photos/${id}`}
                  alt={`Evidence ${index + 1}`}
                  style={{ width: 140, height: 110, objectFit: 'cover', borderRadius: 14 }}
                />
              </a>
            ))}
          </div>
          {['PENDING', 'RUNNING', 'NEEDS_INFO'].includes(selected.status) && (
            <form
              onSubmit={(e) => e.preventDefault()}
              style={{ display: 'grid', gap: 12, marginTop: 20 }}
            >
              {selected.status === 'PENDING' && (
                <label>
                  Minutes to approve{' '}
                  <input
                    type="number"
                    min={1}
                    max={Math.min(selected.reportedMinutes ?? 0, 720)}
                    step={1}
                    value={minutes}
                    disabled={busy}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                </label>
              )}
              <label>
                Explanation for the volunteer
                <textarea
                  value={notes}
                  minLength={3}
                  maxLength={2000}
                  disabled={busy}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {selected.status === 'PENDING' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => review('APPROVE')}
                    >
                      {busy ? 'Saving…' : 'Approve time & credits'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => review('NEEDS_INFO')}
                    >
                      Request information
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => review('REJECT')}
                >
                  {selected.status === 'RUNNING'
                    ? 'Close abandoned timer without credits'
                    : 'Reject with reason'}
                </button>
              </div>
            </form>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            style={{ marginTop: 12 }}
            onClick={() => setSelected(null)}
          >
            Close details
          </button>
        </section>
      )}
      <small>
        Shows up to 100 most recent sessions for the selected status. Long sessions require an
        explained adjustment; at most 720 minutes can be approved.
      </small>
    </section>
  );
}
