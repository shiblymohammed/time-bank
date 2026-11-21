'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { backend, backendFormData } from '@/lib/api';
import { Icon } from '@/components/icons';

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
  earns_credits: boolean;
  confirmed_attendees: number;
  checked_in_attendees?: number;
  /** Set when members check in at a place, which is when the event has a QR code. */
  latitude?: number | null;
  /** Set when the event has a cover image; changes only if the image does. */
  photo_version?: string | null;
};
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
type EventPage = { items: CommunityEvent[]; nextOffset: number | null };
type Attendee = {
  membershipId: string;
  membershipNumber: string | null;
  name: string;
  checkedInAt: string | null;
  checkInDistanceMeters: number | null;
  limitMinutes: number;
  attendedMinutes: number | null;
  confirmedAt: string | null;
  creditsEarned: number | null;
  creditsHeld: boolean | null;
};
type Roster = {
  earnsCredits: boolean;
  ended: boolean;
  cancelled: boolean;
  usesCheckIn: boolean;
  checkInRadiusMeters: number;
  durationMinutes: number;
  items: Attendee[];
};
const emptyEvent = {
  title: '',
  description: '',
  venue: '',
  startsAt: '',
  endsAt: '',
  capacity: '',
  latitude: '',
  longitude: '',
  radius: '200',
};

/** The QR code staff show at the venue. Members scan it in the app to check in on the spot. */
function EventCheckInQr({ path, title }: { path: string; title: string }) {
  const [qr, setQr] = useState<{
    code: string;
    qrSvg: string;
    radiusMeters: number;
    venue: string;
  } | null>(null);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setProblem('');
    void backend<NonNullable<typeof qr>>(`${path}/check-in-qr`, 'GET', undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setQr(value);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setProblem(error instanceof Error ? error.message : 'Could not load the check-in QR.');
      });
    return () => controller.abort();
  }, [path]);

  if (problem)
    return (
      <p role="alert" className="error-message">
        {problem}
      </p>
    );
  if (!qr) return <p role="status">Loading the check-in QR…</p>;
  const src = `data:image/svg+xml,${encodeURIComponent(qr.qrSvg)}`;
  return (
    <div className="stack community-event-qr">
      {/* eslint-disable-next-line @next/next/no-img-element -- The QR is an inline SVG data URL. */}
      <img src={src} width={240} height={240} alt={`Check-in QR code for ${title}`} />
      <p className="help-text">
        Show this at {qr.venue}. Members open Community events in the app, tap “Scan QR to join” and
        scan it. They must be within {qr.radiusMeters} m of the check-in point, and it only works
        while the event is running. Keep it for the event: anyone who has it can try to check in.
      </p>
      <p>
        <a href={src} download="event-check-in-qr.svg">
          Download printable QR
        </a>
      </p>
      <details>
        <summary>Camera not working? Show the code</summary>
        <code style={{ overflowWrap: 'anywhere' }}>{qr.code}</code>
      </details>
    </div>
  );
}
/** Staff confirm who attended an ended credit-earning event; each confirmation pays once. */
function EventAttendance({ path, onChanged }: { path: string; onChanged: () => void }) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [minutes, setMinutes] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState('');
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [cap, setCap] = useState('');
  const [allNotice, setAllNotice] = useState('');
  const [allError, setAllError] = useState('');

  async function confirmAll() {
    if (saving) return;
    setSaving('all');
    setAllError('');
    setAllNotice('');
    try {
      const result = await backend<{ confirmed: number; creditsEarned: number }>(
        `${path}/attendees/confirm-all`,
        'POST',
        cap ? { maxMinutes: Number(cap) } : {},
      );
      setAllNotice(
        result.confirmed
          ? `Approved ${result.confirmed} ${result.confirmed === 1 ? 'person' : 'people'} for ${result.creditsEarned} credits in total.`
          : 'Everyone who checked in is already approved.',
      );
      setRevision((current) => current + 1);
      onChanged();
    } catch (error) {
      setAllError(error instanceof Error ? error.message : 'Could not approve attendance.');
    } finally {
      setSaving(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoadError('');
    void backend<Roster>(`${path}/attendees`, 'GET', undefined, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setRoster(value);
        setMinutes((current) => {
          const next = { ...current };
          for (const person of value.items)
            if (person.limitMinutes > 0) next[person.membershipId] ??= String(person.limitMinutes);
          return next;
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(error instanceof Error ? error.message : 'Could not load attendees.');
      });
    return () => controller.abort();
  }, [path, revision]);

  async function confirm(person: Attendee) {
    if (saving) return;
    const value = Number(minutes[person.membershipId]);
    setSaving(person.membershipId);
    setRowError((current) => ({ ...current, [person.membershipId]: '' }));
    try {
      await backend(`${path}/attendees/${person.membershipId}/confirm`, 'POST', {
        minutes: value,
      });
      setRevision((current) => current + 1);
      onChanged();
    } catch (error) {
      setRowError((current) => ({
        ...current,
        [person.membershipId]:
          error instanceof Error ? error.message : 'Could not confirm attendance.',
      }));
    } finally {
      setSaving(null);
    }
  }

  if (loadError)
    return (
      <p role="alert" className="error-message">
        {loadError}
      </p>
    );
  if (!roster) return <p role="status">Loading attendees…</p>;
  if (!roster.items.length) return <p>Nobody signed up for this event.</p>;
  const checkedIn = roster.items.filter((person) => person.checkedInAt).length;
  const waiting = roster.items.filter(
    (person) => person.checkedInAt && !person.confirmedAt && person.limitMinutes > 0,
  ).length;
  return (
    <div className="stack community-event-attendance">
      <p className="help-text">
        {roster.usesCheckIn
          ? `${checkedIn} of ${roster.items.length} signed-up members checked in within ${roster.checkInRadiusMeters} m. Each person can be paid from their check-in until the event ended, at 1 credit per hour. Approval is final and pays once.`
          : `Confirm each person who attended. They earn 1 credit per hour, up to ${roster.durationMinutes} minutes. A confirmation is final and pays once.`}
      </p>
      {roster.usesCheckIn && waiting > 0 && (
        <div className="action-row">
          <label className="community-event-field">
            Cap everyone at (minutes, optional)
            <input
              className="form-input"
              type="number"
              min={1}
              max={1440}
              value={cap}
              disabled={saving !== null}
              onChange={(event) => setCap(event.target.value)}
            />
          </label>
          <button
            className="btn btn-primary"
            type="button"
            disabled={saving !== null}
            onClick={() => void confirmAll()}
          >
            {saving === 'all' ? 'Approving…' : `Approve all ${waiting} checked-in`}
          </button>
        </div>
      )}
      {allNotice && (
        <p role="status" className="success-message">
          {allNotice}
        </p>
      )}
      {allError && (
        <p role="alert" className="error-message">
          {allError}
        </p>
      )}
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Member</th>
            {roster.usesCheckIn && <th scope="col">Check-in</th>}
            <th scope="col">Minutes attended</th>
            <th scope="col">Credits</th>
          </tr>
        </thead>
        <tbody>
          {roster.items.map((person) => (
            <tr key={person.membershipId}>
              <td>
                {person.name}
                {person.membershipNumber && (
                  <span className="help-text"> · {person.membershipNumber}</span>
                )}
              </td>
              {roster.usesCheckIn && (
                <td>
                  {person.checkedInAt
                    ? `${new Date(person.checkedInAt).toLocaleTimeString()} · ${person.checkInDistanceMeters} m away`
                    : 'Did not check in'}
                </td>
              )}
              <td>
                {person.confirmedAt ? (
                  `${person.attendedMinutes} minutes`
                ) : person.limitMinutes < 1 ? (
                  <span className="help-text">Cannot be paid</span>
                ) : (
                  <div className="action-row">
                    <input
                      className="form-input"
                      type="number"
                      min={1}
                      max={person.limitMinutes}
                      aria-label={`Minutes ${person.name} attended, up to ${person.limitMinutes}`}
                      value={minutes[person.membershipId] ?? ''}
                      disabled={saving !== null}
                      onChange={(event) =>
                        setMinutes({ ...minutes, [person.membershipId]: event.target.value })
                      }
                    />
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={saving !== null || !minutes[person.membershipId]}
                      onClick={() => void confirm(person)}
                    >
                      {saving === person.membershipId ? 'Confirming…' : 'Confirm attended'}
                    </button>
                  </div>
                )}
                {rowError[person.membershipId] && (
                  <p role="alert" className="error-message">
                    {rowError[person.membershipId]}
                  </p>
                )}
              </td>
              <td>
                {person.confirmedAt
                  ? `${person.creditsEarned ?? 0} ${person.creditsHeld ? '(held)' : 'paid'}`
                  : 'Not confirmed'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
  const [earnsCredits, setEarnsCredits] = useState(false);
  const [attendanceId, setAttendanceId] = useState<string | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoProblem, setPhotoProblem] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);

  useEffect(() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone), []);
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
        earnsCredits,
        ...(earnsCredits
          ? {
              latitude: Number(fields.latitude),
              longitude: Number(fields.longitude),
              checkInRadiusMeters: Number(fields.radius),
            }
          : {}),
      };
      if (
        earnsCredits &&
        (!Number.isFinite(values.latitude) ||
          !Number.isFinite(values.longitude) ||
          !fields.latitude.trim() ||
          !fields.longitude.trim())
      ) {
        throw new Error('Enter the event location so members can check in.');
      }
      // A retry of the same form (same details and same image) reuses the event id, so a
      // dropped connection can never publish the event twice.
      const key = JSON.stringify([
        values,
        photo ? [photo.name, photo.size, photo.lastModified] : null,
      ]);
      const id = publishAttempt?.key === key ? publishAttempt.id : crypto.randomUUID();
      setPublishAttempt({ key, id });
      if (photo) {
        const form = new FormData();
        form.set('id', id);
        for (const [name, value] of Object.entries(values)) form.set(name, String(value));
        form.set('file', photo);
        await backendFormData(path, form);
      } else {
        await backend(path, 'POST', { id, ...values });
      }
      setFields(emptyEvent);
      setEarnsCredits(false);
      setPhoto(null);
      setPhotoProblem('');
      if (photoInput.current) photoInput.current.value = '';
      setPublishAttempt(null);
      // The QR code is the first thing the organiser needs once the event exists.
      if (earnsCredits) setQrId(id);
      setNotice(
        earnsCredits
          ? 'Event published. Show its check-in QR code at the venue. Members earn credits once you approve their attendance.'
          : 'Event published. Members can now sign up.',
      );
    });
  }

  return (
    <section className="glass-panel stack community-feature-card" aria-busy={busy || loading}>
      <div className="community-card-heading">
        <div>
          <span className="community-section-kicker">COMMUNITY CALENDAR</span>
          <h2>Community events</h2>
          <p>Publish local events and manage member sign-ups.</p>
        </div>
      </div>
      <form className="community-event-form" onSubmit={publish}>
        <div className="community-subsection-heading">
          <h3>Publish an event</h3>
          <p>Members in this organization can view the event and sign up.</p>
        </div>
        {(
          [
            ['title', 'Event title', 'text', 120],
            ['venue', 'Venue or meeting point', 'text', 200],
            ['startsAt', 'Starts', 'datetime-local'],
            ['endsAt', 'Ends', 'datetime-local'],
            ['capacity', 'Capacity (optional)', 'number'],
          ] as const
        ).map(([key, label, type, maxLength]) => (
          <label className="community-event-field" key={key}>
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
        {timezone && (
          <p className="help-text community-event-timezone">
            Times use your browser’s time zone ({timezone}).
          </p>
        )}
        <label className="community-event-field community-event-description">
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
        <div className="community-event-field community-event-photo-field">
          <span className="community-field-label">Event image (optional)</span>
          <label className={`community-upload-dropzone ${photo ? 'has-file' : ''}`}>
            <input
              ref={photoInput}
              className="community-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Event image"
              disabled={busy}
              onChange={(change) => {
                const selected = change.currentTarget.files?.[0] ?? null;
                if (selected && !PHOTO_TYPES.includes(selected.type)) {
                  setPhotoProblem('Choose a JPEG, PNG or WebP image.');
                  change.currentTarget.value = '';
                  return;
                }
                if (selected && selected.size > PHOTO_MAX_BYTES) {
                  setPhotoProblem('The image must be 5 MB or smaller.');
                  change.currentTarget.value = '';
                  return;
                }
                setPhotoProblem('');
                setPhoto(selected);
              }}
            />
            <span className="community-upload-icon" aria-hidden="true">
              <Icon name="plus" size={18} />
            </span>
            <span className="community-upload-copy">
              <strong>{photo?.name ?? 'Choose an image for this event'}</strong>
              <small>JPEG, PNG or WebP · Up to 5 MB · Shown to members with the event</small>
            </span>
            <span className="community-upload-action">Browse files</span>
          </label>
          {photoProblem && (
            <p className="error-message" role="alert">
              {photoProblem}
            </p>
          )}
          {photoPreview && (
            <div className="community-announcement-photo-preview">
              {/* eslint-disable-next-line @next/next/no-img-element -- Local object URL previews an unsubmitted image. */}
              <img src={photoPreview} alt="Event image preview" />
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
        <label className="community-event-field community-event-credits">
          <input
            type="checkbox"
            checked={earnsCredits}
            disabled={busy}
            onChange={(event) => setEarnsCredits(event.target.checked)}
          />{' '}
          Members earn time credits for attending (1 credit per hour, after you confirm attendance)
        </label>
        {earnsCredits && (
          <fieldset className="community-event-location">
            <legend>Check-in location</legend>
            <p className="help-text">
              Members scan the event’s QR code at this spot while the event is running, and their
              phone must be within the range. Only people who check in can be paid. The QR code
              appears here once the event is published.
            </p>
            {(
              [
                ['latitude', 'Latitude', -90, 90, 'any'],
                ['longitude', 'Longitude', -180, 180, 'any'],
                ['radius', 'Check-in range (metres)', 50, 1000, '10'],
              ] as const
            ).map(([key, label, min, max, step]) => (
              <label className="community-event-field" key={key}>
                {label}
                <input
                  className="form-input"
                  type="number"
                  required
                  min={min}
                  max={max}
                  step={step}
                  value={fields[key]}
                  disabled={busy}
                  onChange={(event) => setFields({ ...fields, [key]: event.target.value })}
                />
              </label>
            ))}
            <div className="action-row">
              <button
                className="btn btn-secondary"
                type="button"
                disabled={busy || typeof navigator === 'undefined' || !navigator.geolocation}
                onClick={() =>
                  navigator.geolocation.getCurrentPosition(
                    (position) =>
                      setFields((current) => ({
                        ...current,
                        latitude: position.coords.latitude.toFixed(6),
                        longitude: position.coords.longitude.toFixed(6),
                      })),
                    () => setActionError('Could not read this device’s location.'),
                    { enableHighAccuracy: true, timeout: 15000 },
                  )
                }
              >
                Use my current location
              </button>
              {fields.latitude && fields.longitude && (
                <a
                  className="btn btn-secondary"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.google.com/maps?q=${encodeURIComponent(fields.latitude)},${encodeURIComponent(fields.longitude)}`}
                >
                  Check on map ↗
                </a>
              )}
            </div>
          </fieldset>
        )}
        <div className="community-event-submit">
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
      <div className="community-subsection-heading community-event-list-heading">
        <div>
          <h3>Published and past events</h3>
          <p>Review event details, sign-ups, and cancellations.</p>
        </div>
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
        <article key={event.id} className="stack community-event-card">
          <div className="community-event-card-heading">
            <h4>{event.title}</h4>
            <span className={`community-event-status ${event.cancelled_at ? 'cancelled' : ''}`}>
              {event.cancelled_at
                ? 'Cancelled'
                : Date.parse(event.starts_at) > Date.now()
                  ? 'Upcoming'
                  : Date.parse(event.ends_at) > Date.now()
                    ? 'In progress'
                    : 'Completed'}
            </span>
          </div>
          {event.photo_version && (
            <a
              href={`/api/backend${path}/${event.id}/photo?v=${event.photo_version}`}
              target="_blank"
              rel="noreferrer"
              className="community-event-photo-link"
              aria-label={`Open the image for ${event.title}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- The image comes from the member-authenticated event photo route. */}
              <img
                className="community-event-photo"
                src={`/api/backend${path}/${event.id}/photo?v=${event.photo_version}`}
                alt={`Image for ${event.title}`}
                loading="lazy"
              />
            </a>
          )}
          <p className="community-event-meta">
            <span>{event.venue}</span>
            <span>
              {new Date(event.starts_at).toLocaleString()} –{' '}
              {new Date(event.ends_at).toLocaleString()}
            </span>
          </p>
          <p
            className="community-event-description"
            style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
          >
            {event.description}
          </p>
          <p className="help-text community-event-attendees">
            {event.attendees}
            {event.capacity !== null ? ` / ${event.capacity}` : ''} signed up
            {event.earns_credits &&
              ` · Earns credits · ${event.checked_in_attendees ?? 0} checked in · ${event.confirmed_attendees} approved`}
          </p>
          {event.earns_credits &&
            event.latitude != null &&
            !event.cancelled_at &&
            Date.parse(event.ends_at) > Date.now() &&
            (qrId === event.id ? (
              <>
                <EventCheckInQr path={`${path}/${event.id}`} title={event.title} />
                <div>
                  <button className="btn btn-secondary" type="button" onClick={() => setQrId(null)}>
                    Hide check-in QR
                  </button>
                </div>
              </>
            ) : (
              <div>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy}
                  onClick={() => setQrId(event.id)}
                >
                  Show check-in QR
                </button>
              </div>
            ))}{' '}
          {event.earns_credits &&
            !event.cancelled_at &&
            Date.parse(event.ends_at) <= Date.now() &&
            (attendanceId === event.id ? (
              <>
                <EventAttendance path={`${path}/${event.id}`} onChanged={reload} />
                <div>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => setAttendanceId(null)}
                  >
                    Close attendance
                  </button>
                </div>
              </>
            ) : (
              <div>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy}
                  onClick={() => setAttendanceId(event.id)}
                >
                  Review and approve attendance
                </button>
              </div>
            ))}
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
        <div className="community-event-load-more">
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
