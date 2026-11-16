'use client';

import { useEffect, useState } from 'react';
import { backend } from '@/lib/api';

type Post = {
  id: string;
  post_type: string;
  body: string;
  created_at: string;
  author_name: string | null;
  is_own_post: boolean;
  content_version: number;
  photo_version: number | null;
};
type Queue = { items: Post[]; hasMore: boolean };
type Decision = 'PUBLISHED' | 'REJECTED';

const postTypes: Record<string, string> = {
  ANNOUNCEMENT: 'Announcement',
  OPPORTUNITY: 'Opportunity',
  STORY: 'Community story',
  RECOGNITION: 'Recognition',
};

export function CommunityPendingPosts({
  organizationId,
  revision,
}: {
  organizationId: string;
  revision: number;
}) {
  const path = `/organizations/${organizationId}/community/posts`;
  const [queue, setQueue] = useState<Queue | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [selection, setSelection] = useState<{
    id: string;
    version: number;
    decision: Decision;
  } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setQueue(null);
    setLoadError('');
    void backend<Queue>(`${path}/pending`, 'GET', undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setQueue(data);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(error instanceof Error ? error.message : 'Could not load pending posts.');
      });
    return () => controller.abort();
  }, [path, revision, refresh]);

  function start(post: Post, decision: Decision) {
    setSelection({ id: post.id, version: post.content_version, decision });
    setNote('');
    setDecisionError('');
    setNotice('');
  }

  async function save() {
    if (!selection || saving || (selection.decision === 'REJECTED' && !note.trim())) return;
    setSaving(true);
    setDecisionError('');
    try {
      await backend(`${path}/${selection.id}/decision`, 'POST', {
        status: selection.decision,
        version: selection.version,
        ...(selection.decision === 'REJECTED' ? { note: note.trim() } : {}),
      });
      setSelection(null);
      setNotice(selection.decision === 'PUBLISHED' ? 'Post published.' : 'Post declined.');
      setRefresh((value) => value + 1);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : 'Could not save the decision.');
    } finally {
      setSaving(false);
    }
  }

  const loading = !queue && !loadError;
  return (
    <section className="glass-panel stack" style={{ padding: 22 }} aria-busy={loading || saving}>
      <h2>Pending posts</h2>
      <div>
        <button
          className="btn btn-secondary"
          disabled={loading || saving}
          onClick={() => {
            setSelection(null);
            setDecisionError('');
            setRefresh((value) => value + 1);
          }}
        >
          Refresh pending posts
        </button>
      </div>
      {loading && <p role="status">Loading pending posts…</p>}
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
      {loadError && (
        <p className="error-message" role="alert">
          {loadError}
        </p>
      )}
      {queue?.items.length === 0 && <p>No posts are waiting for review.</p>}
      {queue?.hasMore && <p className="help-text">Showing the oldest 100 posts.</p>}
      {queue?.items.map((post) => (
        <article
          key={post.id}
          className="stack"
          style={{ borderTop: '1px solid #ddd', paddingTop: 16 }}
        >
          <h3>{postTypes[post.post_type] ?? 'Community update'}</h3>
          <p className="help-text">
            {post.author_name || 'Community member'} ·{' '}
            <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleString()}</time>
          </p>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{post.body}</p>
          {post.photo_version !== null && (
            <ReviewPhoto
              key={post.photo_version}
              path={`${path}/${post.id}/photo?v=${post.photo_version}`}
            />
          )}
          {post.is_own_post ? (
            <p className="help-text">Another staff member needs to review your post.</p>
          ) : selection?.id === post.id ? (
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              {selection.decision === 'REJECTED' ? (
                <>
                  <label htmlFor="community-post-feedback">Feedback for the member</label>
                  <textarea
                    id="community-post-feedback"
                    className="form-input"
                    rows={3}
                    required
                    maxLength={500}
                    value={note}
                    disabled={saving}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </>
              ) : (
                <p>This post will be visible to members of this municipality.</p>
              )}
              {decisionError && (
                <p className="error-message" role="alert">
                  {decisionError}
                </p>
              )}
              <div className="action-row">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={saving || (selection.decision === 'REJECTED' && !note.trim())}
                >
                  {saving
                    ? 'Saving…'
                    : selection.decision === 'PUBLISHED'
                      ? 'Confirm publication'
                      : 'Confirm decline'}
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={saving}
                  onClick={() => setSelection(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="action-row">
              <button
                className="btn btn-primary"
                disabled={saving}
                onClick={() => start(post, 'PUBLISHED')}
              >
                Approve and publish
              </button>
              <button
                className="btn btn-secondary"
                disabled={saving}
                onClick={() => start(post, 'REJECTED')}
              >
                Decline post
              </button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

function ReviewPhoto({ path }: { path: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [retry, setRetry] = useState(0);
  return (
    <div>
      {state === 'loading' && <p role="status">Loading attached photo…</p>}
      {state === 'failed' && (
        <button
          className="btn btn-secondary"
          onClick={() => {
            setState('loading');
            setRetry((value) => value + 1);
          }}
        >
          Retry photo preview
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- The original requires the reviewer’s private session. */}
      <img
        src={`/api/backend${path}&retry=${retry}`}
        alt="Photo attached by the member"
        hidden={state !== 'ready'}
        onLoad={() => setState('ready')}
        onError={() => setState('failed')}
        style={{ maxWidth: '100%', maxHeight: 440, borderRadius: 12, objectFit: 'contain' }}
      />
    </div>
  );
}
