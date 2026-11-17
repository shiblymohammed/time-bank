'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { backend } from '@/lib/api';

type Impact = {
  month: string;
  verifiedMinutes: number;
  completedVisits: number;
  targetHours: number | null;
};
const indiaMonth = (date: Date) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
  }).format(date);

export function CommunityImpact({
  organizationId,
  revision,
}: {
  organizationId: string;
  revision: number;
}) {
  const [month, setMonth] = useState(() => indiaMonth(new Date()));
  const [data, setData] = useState<Impact | null>(null);
  const [hours, setHours] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const path = `/organizations/${organizationId}/community/impact`;
  const current = data?.month === month ? data : null;

  useEffect(() => {
    const request = new AbortController();
    setData(null);
    setError('');
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) return;
    void backend<Impact>(`${path}?month=${month}`, 'GET', undefined, request.signal)
      .then((result) => {
        if (request.signal.aborted) return;
        setData(result);
        setHours(result.targetHours?.toString() ?? '');
      })
      .catch((cause: unknown) => {
        if (!request.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Could not load impact.');
      });
    return () => request.abort();
  }, [path, month, revision, refresh]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!current || saving || !hours) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await backend<{ targetHours: number }>(`${path}/goal`, 'PUT', {
        month,
        targetHours: Number(hours),
      });
      setData({ ...current, targetHours: saved.targetHours });
      setNotice('Community goal saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the goal.');
    } finally {
      setSaving(false);
    }
  }

  const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  return (
    <section className="glass-panel stack community-feature-card community-impact-card">
      <div className="community-card-heading">
        <div>
          <span className="community-section-kicker">COMMUNITY INSIGHTS</span>
          <h2>Community impact</h2>
          <p>Track verified volunteer activity and set a monthly goal.</p>
        </div>
      </div>
      <label className="community-impact-month">
        Reporting month <span>India time</span>
        <input
          className="form-input"
          type="month"
          min="2000-01"
          max="2099-12"
          value={month}
          disabled={saving}
          onChange={(event) => {
            setNotice('');
            setMonth(event.target.value);
          }}
        />
      </label>
      {!current && month && !error && <p role="status">Loading community impact…</p>}
      {current && (
        <>
          <div className="community-impact-stats">
            <article className="community-impact-stat">
              <span>Verified volunteer hours</span>
              <strong>{formatter.format(current.verifiedMinutes / 60)}</strong>
              <small>Hours completed and verified</small>
            </article>
            <article className="community-impact-stat">
              <span>Completed visits</span>
              <strong>{formatter.format(current.completedVisits)}</strong>
              <small>Assistance visits completed</small>
            </article>
          </div>
          {current.targetHours !== null && (
            <div className="community-impact-progress">
              <div>
                <strong>Monthly goal progress</strong>
                <span>
                  {formatter.format(current.verifiedMinutes / 60)} of{' '}
                  {formatter.format(current.targetHours)} hours
                </span>
              </div>
              <progress
                max={current.targetHours * 60}
                value={Math.min(current.verifiedMinutes, current.targetHours * 60)}
              />
            </div>
          )}
          {month >= indiaMonth(new Date()) ? (
            <form className="community-impact-goal" onSubmit={(event) => void save(event)}>
              <div>
                <h3>Monthly volunteer goal</h3>
                <p>Set a target for verified volunteer hours this month.</p>
              </div>
              <label>
                Goal (hours)
                <input
                  className="form-input"
                  type="number"
                  required
                  min={1}
                  max={1000000}
                  value={hours}
                  disabled={saving}
                  onChange={(event) => setHours(event.target.value)}
                />
              </label>
              <div className="community-impact-goal-action">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || !hours || Number(hours) === current.targetHours}
                >
                  {saving ? 'Saving…' : 'Save goal'}
                </button>
              </div>
            </form>
          ) : (
            <p>
              {current.targetHours === null
                ? 'No goal was set for this month.'
                : 'This reporting month has ended.'}
            </p>
          )}
        </>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {!current && error && (
        <div>
          <button className="btn btn-secondary" onClick={() => setRefresh((value) => value + 1)}>
            Retry loading impact
          </button>
        </div>
      )}
      {notice && (
        <p className="success-message" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
