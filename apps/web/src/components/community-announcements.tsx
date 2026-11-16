'use client';

import { useEffect, useRef, useState } from 'react';
import { backend, backendFormData } from '@/lib/api';
import { Icon } from '@/components/icons';
import { CommunityEvents } from './community-events';
import { CommunityImpact } from './community-impact';
import { CommunityPendingPosts } from './community-pending-posts';
import { CommunityReportQueue } from './community-report-queue';

type Announcement = {
  id: string;
  body: string;
  author_name: string | null;
  published_at: string;
  photo_version: number | null;
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
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [announcementRevision, setAnnouncementRevision] = useState(0);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'posts' | 'events' | 'impact'>('posts');

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const preview = URL.createObjectURL(photo);
    setPhotoPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [photo]);

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
    <div className="request-workspace stack community-workspace">
      <div className="community-tabs" role="group" aria-label="Community workspace">
        <button
          type="button"
          className={`community-tab ${tab === 'posts' ? 'active' : ''}`}
          aria-pressed={tab === 'posts'}
          onClick={() => setTab('posts')}
        >
          Posts and reports
        </button>
        <button
          type="button"
          className={`community-tab ${tab === 'events' ? 'active' : ''}`}
          aria-pressed={tab === 'events'}
          onClick={() => setTab('events')}
        >
          Events
        </button>
        <button
          type="button"
          className={`community-tab ${tab === 'impact' ? 'active' : ''}`}
          aria-pressed={tab === 'impact'}
          onClick={() => setTab('impact')}
        >
          Impact
        </button>
      </div>
      {tab === 'events' && <CommunityEvents organizationId={organizationId} revision={revision} />}
      {tab === 'impact' && <CommunityImpact organizationId={organizationId} revision={revision} />}
      <div
        className="stack community-posts-workspace"
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
        <section className="glass-panel community-compose-card">
          <div className="community-card-heading">
            <div>
              <span className="community-section-kicker">COMMUNITY POSTS</span>
              <h2>Publish an announcement</h2>
              <p>Share a useful update with members of this municipality.</p>
            </div>
            <span className="community-audience-badge">Local members</span>
          </div>
          <form
            className="community-announcement-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!body.trim() || busy) return;
              void run(async () => {
                const form = new FormData();
                form.set('body', body.trim());
                if (photo) form.set('file', photo);
                await backendFormData(path, form);
                setBody('');
                setPhoto(null);
                if (photoInput.current) photoInput.current.value = '';
                setNotice('Announcement published.');
                setReload((value) => value + 1);
              });
            }}
          >
            <div className="community-form-field">
              <label htmlFor="community-announcement">Message for members</label>
              <textarea
                id="community-announcement"
                className="form-input community-announcement-message"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={5}
                maxLength={2000}
                required
                disabled={busy}
                placeholder="Write a clear update for your community…"
              />
              <span className="community-character-count">{body.length} / 2,000</span>
            </div>
            <div className="community-form-field">
              <span className="community-field-label">Image (optional)</span>
              <label className={`community-upload-dropzone ${photo ? 'has-file' : ''}`}>
                <input
                  id="community-announcement-photo"
                  ref={photoInput}
                  className="community-file-input"
                  type="file"
                  accept="image/jpeg,image/png"
                  disabled={busy}
                  onChange={(event) => {
                    const selected = event.currentTarget.files?.[0] ?? null;
                    if (selected && !['image/jpeg', 'image/png'].includes(selected.type)) {
                      setProblem('Choose a JPEG or PNG image.');
                      event.currentTarget.value = '';
                      return;
                    }
                    if (selected && selected.size > 5 * 1024 * 1024) {
                      setProblem('The image must be 5 MB or smaller.');
                      event.currentTarget.value = '';
                      return;
                    }
                    setProblem('');
                    setPhoto(selected);
                  }}
                />
                <span className="community-upload-icon" aria-hidden="true">
                  <Icon name="plus" size={18} />
                </span>
                <span className="community-upload-copy">
                  <strong>{photo?.name ?? 'Choose an image to attach'}</strong>
                  <small>JPEG or PNG · Up to 5 MB</small>
                </span>
                <span className="community-upload-action">Browse files</span>
              </label>
              {photoPreview && (
                <div className="community-announcement-photo-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Local object URL previews an unsubmitted image. */}
                  <img src={photoPreview} alt="Announcement image preview" />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => {
                      setPhoto(null);
                      if (photoInput.current) photoInput.current.value = '';
                    }}
                  >
                    Remove image
                  </button>
                </div>
              )}
            </div>
            <div className="community-compose-footer">
              <p>
                Members of this community can read this. Don&apos;t include private details about
                people or visits.
              </p>
              <button type="submit" className="btn btn-primary" disabled={busy || !body.trim()}>
                {busy ? 'Publishing…' : 'Publish announcement'}
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
        <section
          className="glass-panel stack community-published-card"
          aria-busy={loading || busy}
        >
          <div className="community-card-heading">
            <div>
              <span className="community-section-kicker">LIVE IN THE MEMBER FEED</span>
              <h2>Published announcements</h2>
              <p>Current community notices and updates.</p>
            </div>
            <span className="community-audience-badge">{posts.length} loaded</span>
          </div>
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
            <article key={post.id} className="stack community-published-item">
              <p className="help-text">
                {post.author_name || 'Community staff'} ·{' '}
                <time dateTime={post.published_at}>
                  {new Date(post.published_at).toLocaleString()}
                </time>
              </p>
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{post.body}</p>
              {post.photo_version != null && (
                // eslint-disable-next-line @next/next/no-img-element -- The image uses the member-authenticated community photo route.
                <img
                  className="community-announcement-photo"
                  src={`/api/backend/organizations/${organizationId}/community/posts/${post.id}/photo?v=${post.photo_version}`}
                  alt="Image attached to this community announcement"
                  loading="lazy"
                />
              )}
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
