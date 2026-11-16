'use client';

import { useEffect, useState } from 'react';
import { backend } from '@/lib/api';

const reasons: Record<string, string> = {
  INAPPROPRIATE: 'Inappropriate content',
  PRIVACY: 'Shares private information',
  MISLEADING: 'Misleading information',
  HARASSMENT: 'Harassment',
  OTHER: 'Other concern',
};

type Report = {
  id: string;
  reason: string;
  details: string | null;
  created_at: string;
  post_id: string;
  post_body: string;
  post_status: string;
};
type Queue = { items: Report[]; hasMore: boolean };
type Decision = 'DISMISS' | 'REMOVE_POST';

export function CommunityReportQueue({
  organizationId,
  revision,
  announcementRevision,
  onPostRemoved,
}: {
  organizationId: string;
  revision: number;
  announcementRevision: number;
  onPostRemoved: () => void;
}) {
  const path = `/organizations/${organizationId}/community/reports`;
  const [queue, setQueue] = useState<Queue | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [selection, setSelection] = useState<{ report: Report; decision: Decision } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setQueue(null);
    setProblem('');
    void backend<Queue>(path, 'GET', undefined, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setQueue(result);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setProblem(error instanceof Error ? error.message : 'Could not load reports.');
      });
    return () => controller.abort();
  }, [path, revision, announcementRevision, refresh]);

  async function decide() {
    if (!selection || !note.trim() || busy) return;
    const { report, decision } = selection;
    setBusy(true);
    setProblem('');
    setNotice('');
    try {
      await backend(`${path}/${report.id}/decision`, 'POST', { decision, note: note.trim() });
      setSelection(null);
      setNote('');
      setNotice(
        decision === 'REMOVE_POST'
          ? 'Post removed and its open reports closed.'
          : 'Report dismissed.',
      );
      if (decision === 'REMOVE_POST') onPostRemoved();
      setRefresh((value) => value + 1);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not save the decision.');
    } finally {
      setBusy(false);
    }
  }

  function start(report: Report, decision: Decision) {
    setSelection({ report, decision });
    setNote('');
    setProblem('');
    setNotice('');
  }

  return (
    <section
      className="glass-panel stack"
      style={{ padding: 22 }}
      aria-busy={busy || (!queue && !problem)}
    >
      <h2>Reported posts</h2>
      <div>
        <button
          className="btn btn-secondary"
          disabled={busy || (!queue && !problem)}
          onClick={() => {
            setSelection(null);
            setRefresh((value) => value + 1);
          }}
        >
          Refresh reports
        </button>
      </div>
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
      {problem && (
        <p className="error-message" role="alert">
          {problem}
        </p>
      )}
      {!queue && !problem && <p role="status">Loading reports…</p>}
      {queue?.items.length === 0 && <p>No open reports.</p>}
      {queue?.hasMore && (
        <p className="help-text">
          Showing the oldest 100 reports. More will appear as these are resolved.
        </p>
      )}
      {queue?.items.map((report) => (
        <article
          key={report.id}
          className="stack"
          style={{ borderTop: '1px solid #ddd', paddingTop: 16 }}
        >
          <h3>{reasons[report.reason] ?? 'Reported content'}</h3>
          <p className="help-text">
            <time dateTime={report.created_at}>{new Date(report.created_at).toLocaleString()}</time>
            {report.post_status !== 'PUBLISHED' && ' · Post is no longer visible'}
          </p>
          {report.details && (
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{report.details}</p>
          )}
          <blockquote
            style={{
              margin: 0,
              paddingLeft: 14,
              borderLeft: '3px solid #ddd',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {report.post_body}
          </blockquote>
          {selection?.report.id === report.id ? (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void decide();
              }}
            >
              <label htmlFor="report-decision-note">Reason for this decision</label>
              <textarea
                id="report-decision-note"
                className="form-input"
                required
                maxLength={500}
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={busy}
              />
              {selection.decision === 'REMOVE_POST' && (
                <p className="help-text">
                  This removes the post from the member feed and closes all its open reports.
                </p>
              )}
              <div className="action-row">
                <button
                  type="submit"
                  className={
                    selection.decision === 'REMOVE_POST' ? 'btn btn-danger' : 'btn btn-primary'
                  }
                  disabled={busy || !note.trim()}
                >
                  {selection.decision === 'REMOVE_POST' ? 'Confirm removal' : 'Confirm dismissal'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => setSelection(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="action-row">
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => start(report, 'DISMISS')}
              >
                Dismiss report
              </button>
              {report.post_status === 'PUBLISHED' && (
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => start(report, 'REMOVE_POST')}
                >
                  Remove post
                </button>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
