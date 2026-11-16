'use client';

import { useEffect, useState } from 'react';
import { backend } from '@/lib/api';
import { CommunityEvents } from './community-events';
import { CommunityImpact } from './community-impact';
import { CommunityPendingPosts } from './community-pending-posts';
import { CommunityReportQueue } from './community-report-queue';

type Announcement = {
  id: string;
  body: string;
  author_name: string | null;
  published_at: string;
};
type Page = { items: Announcement[]; nextCursor: string | null };

export function CommunityAnnouncements({
  organizationId,
  revision,
}: {
  organizationId: string;
  revision: number;
}) {
  const path = `/organizations/${organizationId}/community/announcements`;
  const [posts, setPosts] = useState<Announcement[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [announcementRevision, setAnnouncementRevision] = useState(0);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'posts' | 'events' | 'impact'>('posts');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setProblem('');
    void backend<Page>(path, 'GET', undefined, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setPosts(page.items);
        setCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setProblem(error instanceof Error ? error.message : 'Could not load announcements.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision, reload]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setProblem('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not complete the action.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="request-workspace stack">
      <div className="action-row" role="group" aria-label="Community workspace">
        <button
          className="btn btn-secondary"
          aria-pressed={tab === 'posts'}
          onClick={() => setTab('posts')}
        >
          Posts and reports
        </button>
        <button
          className="btn btn-secondary"
          aria-pressed={tab === 'events'}
          onClick={() => setTab('events')}
        >
          Events
        </button>
        <button
          className="btn btn-secondary"
          aria-pressed={tab === 'impact'}
          onClick={() => setTab('impact')}
        >
          Impact
        </button>
      </div>
      {tab === 'events' && <CommunityEvents organizationId={organizationId} revision={revision} />}
      {tab === 'impact' && <CommunityImpact organizationId={organizationId} revision={revision} />}
      <div
        className="stack"
        hidden={tab !== 'posts'}
        style={tab !== 'posts' ? { display: 'none' } : undefined}
      >
        <CommunityPendingPosts organizationId={organizationId} revision={revision} />
        <CommunityReportQueue
          organizationId={organizationId}
          revision={revision}
          announcementRevision={announcementRevision}
          onPostRemoved={() => setReload((value) => value + 1)}
        />
        <section className="glass-panel" style={{ padding: 22 }}>
          <h2>Publish an announcement</h2>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (!body.trim() || busy) return;
              void run(async () => {
                await backend(path, 'POST', { body: body.trim() });
                setBody('');
                setNotice('Announcement published.');
                setReload((value) => value + 1);
              });
            }}
          >
            <label htmlFor="community-announcement">Message for members</label>
            <textarea
              id="community-announcement"
              className="form-input"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              maxLength={2000}
              required
              disabled={busy}
            />
            <p className="help-text">
              Members of this community can read it. Leave out private details about people or
              visits.
            </p>
            <div>
              <button type="submit" className="btn btn-primary" disabled={busy || !body.trim()}>
                Publish announcement
              </button>
            </div>
          </form>
        </section>
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
        <section className="glass-panel stack" style={{ padding: 22 }} aria-busy={loading || busy}>
          <h2>Published announcements</h2>
          {loading && <p role="status">Loading announcements…</p>}
          {!loading && problem && (
            <div>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setReload((value) => value + 1)}
              >
                Refresh announcements
              </button>
            </div>
          )}
          {!loading && !problem && posts.length === 0 && (
            <p>No announcements have been published yet.</p>
          )}
          {posts.map((post) => (
            <article key={post.id} className="stack">
              <p className="help-text">
                {post.author_name || 'Community staff'} ·{' '}
                <time dateTime={post.published_at}>
                  {new Date(post.published_at).toLocaleString()}
                </time>
              </p>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{post.body}</p>
              <div className="action-row">
                {removing === post.id ? (
                  <>
                    <span>Remove this announcement from the member feed?</span>
                    <button
                      className="btn btn-danger"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await backend(`${path}/${post.id}`, 'DELETE');
                          setPosts((current) => current.filter((item) => item.id !== post.id));
                          setAnnouncementRevision((value) => value + 1);
                          setRemoving(null);
                          setNotice('Announcement removed.');
                        })
                      }
                    >
                      Confirm removal
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => setRemoving(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => setRemoving(post.id)}
                  >
                    Remove announcement
                  </button>
                )}
              </div>
            </article>
          ))}
          {cursor && (
            <div>
              <button
                className="btn btn-secondary"
                disabled={busy || loading}
                onClick={() =>
                  void run(async () => {
                    const page = await backend<Page>(
                      `${path}?before=${encodeURIComponent(cursor)}`,
                    );
                    setPosts((current) => [
                      ...current,
                      ...page.items.filter((item) => !current.some((post) => post.id === item.id)),
                    ]);
                    setCursor(page.nextCursor);
                  })
                }
              >
                Load older announcements
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
