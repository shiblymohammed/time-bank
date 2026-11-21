// End-to-end check of community event cover images against the disposable interface-QA API.
// Usage (after start-interface-qa.ps1 and migrations up to 1729118400044): node scripts/event-photos-qa.cjs
// It only talks to the QA API and refuses to run against anything but a ktb_interface_qa_* database.
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../apps/api/package.json'));
const { Client } = req('pg');
const sharp = req('sharp');

const qaRoot = path.resolve(__dirname, '../node_modules/.cache/interface-qa');
const state = require(path.join(qaRoot, 'state.json'));
if (!/^ktb_interface_qa_[a-z0-9_]+$/.test(state.database))
  throw new Error('This check only runs on the disposable interface-QA database');
const API = `http://127.0.0.1:${state.apiPort ?? 3001}/api`;
const OTP = '123456';

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures += 1;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(token, method, route, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(API + route, {
    method,
    headers: {
      ...(isForm ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  let json = null;
  try {
    json = JSON.parse(bytes.toString('utf8'));
  } catch {
    /* binary or empty */
  }
  return { status: res.status, body: json, bytes, type: res.headers.get('content-type') ?? '' };
}

async function signIn(phone, staff = false, organizationCode = 'KOTTAKKAL') {
  for (let attempt = 0; ; attempt += 1) {
    const sent = await call(null, 'POST', '/auth/otp/request', { phone });
    if (sent.status !== 429) break;
    if (attempt === 4) throw new Error(`Sign-in stayed rate limited for ${phone}`);
    await sleep(20_000);
  }
  const res = await call(null, 'POST', '/auth/otp/verify', {
    phone,
    code: OTP,
    organizationCode,
  });
  const token = res.body?.accessToken;
  if (!token) throw new Error(`Sign-in failed for ${phone}: ${res.status}`);
  if (staff) {
    for (const [route, body] of [
      ['/auth/staff-code/request', {}],
      ['/auth/staff-code/verify', { code: OTP }],
    ]) {
      const step = await call(token, 'POST', route, body);
      if (step.status >= 300) throw new Error(`Staff code step ${route} failed: ${step.status}`);
    }
  }
  return token;
}

const png = (width, height, color) =>
  sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();

function form(fields, file, type = 'image/png', name = 'cover.png') {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, String(value));
  if (file) data.set('file', new Blob([file], { type }), name);
  return data;
}

const isJpeg = (b) =>
  b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9;

const db = new Client({
  connectionString: `postgresql://ktb_interface_qa@127.0.0.1:${state.port}/${state.database}`,
});

(async () => {
  await db.connect();
  const org = (await db.query("SELECT id FROM organizations WHERE code='KOTTAKKAL'")).rows[0].id;
  await db.query(
    "UPDATE users SET email='qa-' || id || '@example.test' WHERE email IS NULL AND phone_e164='+919000000101'",
  );
  const coordinator = await signIn('+919000000101', true);
  const volunteer = await signIn('+919000000103');
  const applicant = await signIn('+919000000105');
  const events = `/organizations/${org}/community/events`;
  const when = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();
  const base = (title) => ({
    id: crypto.randomUUID(),
    title,
    description: 'A cover image check.',
    venue: 'Kottakkal bus stand',
    startsAt: when(48),
    endsAt: when(51),
  });
  const count = async (id) =>
    (await db.query('SELECT count(*)::int AS n FROM community_events WHERE id=$1', [id])).rows[0].n;

  // 1. A staff member publishes an event with a cover image in one request.
  const cover = await sharp({
    create: { width: 3000, height: 2000, channels: 3, background: '#2b6cb0' },
  })
    .withMetadata({ exif: { IFD0: { Copyright: 'QA-PRIVATE-MARKER' } } })
    .jpeg()
    .toBuffer();
  check('the test image carries embedded metadata', !!(await sharp(cover).metadata()).exif);
  const withPhoto = {
    ...base('Cover image event (QA)'),
    earnsCredits: true,
    latitude: 10.9982,
    longitude: 76.0011,
    checkInRadiusMeters: 250,
    capacity: 40,
  };
  const published = await call(coordinator, 'POST', events, form(withPhoto, cover, 'image/jpeg', 'cover.jpg'));
  check('staff publish an event with an image', published.status === 201, `${published.status} ${published.bytes.toString().slice(0, 120)}`);
  check(
    'form fields arrive as the right types',
    (await call(volunteer, 'GET', `${events}?view=upcoming`)).body?.items?.some(
      (e) =>
        e.id === withPhoto.id &&
        e.earns_credits === true &&
        e.capacity === 40 &&
        e.latitude === 10.9982 &&
        e.checkin_radius_meters === 250,
    ),
  );

  // 2. The list says there is an image; the image itself is a safe, resized JPEG.
  const listed = (await call(volunteer, 'GET', `${events}?view=upcoming`)).body.items.find((e) => e.id === withPhoto.id);
  check('the event list reports an image version', /^[0-9a-f-]{36}$/.test(listed?.photo_version ?? ''), listed?.photo_version);
  const photo = await call(volunteer, 'GET', `${events}/${withPhoto.id}/photo`);
  check('a member can fetch the image', photo.status === 200 && photo.type.startsWith('image/jpeg'), `${photo.status} ${photo.type}`);
  check('the image is a valid JPEG', isJpeg(photo.bytes), `${photo.bytes.length} bytes`);
  // The member app and the dashboard gateway both fetch the image this way.
  const asApp = await fetch(`${API}${events}/${withPhoto.id}/photo?v=${listed.photo_version}`, {
    headers: { authorization: `Bearer ${volunteer}`, accept: 'image/jpeg' },
  });
  const appBytes = Buffer.from(await asApp.arrayBuffer());
  check(
    'the app request returns a downloadable JPEG attachment',
    asApp.status === 200 &&
      asApp.headers.get('content-type')?.split(';')[0] === 'image/jpeg' &&
      (asApp.headers.get('content-disposition') ?? '').startsWith('attachment') &&
      isJpeg(appBytes),
    `${asApp.status} ${asApp.headers.get('content-disposition')}`,
  );
  const meta = await sharp(photo.bytes).metadata();
  check('the image is resized to fit 1440 px', Math.max(meta.width, meta.height) === 1440, `${meta.width}x${meta.height}`);
  check('embedded metadata is removed', meta.exif === undefined);
  check('the stored original never contains the private marker', !photo.bytes.includes('QA-PRIVATE-MARKER'));

  // 3. Events without an image are unchanged.
  const plain = base('No image event (QA)');
  const json = await call(coordinator, 'POST', events, plain);
  check('a JSON publish without an image still works', json.status === 201, `${json.status}`);
  const plainRow = (await call(volunteer, 'GET', `${events}?view=upcoming`)).body.items.find((e) => e.id === plain.id);
  check('an event without an image has no image version', plainRow?.photo_version === null);
  const none = await call(volunteer, 'GET', `${events}/${plain.id}/photo`);
  check('fetching a missing image is a 404', none.status === 404, `${none.status}`);

  // 4. Bad files are refused and leave no event behind.
  const refuse = async (label, file, type, name, expected) => {
    const fields = base(label);
    const res = await call(coordinator, 'POST', events, form(fields, file, type, name));
    check(`${label} is refused`, expected.includes(res.status) && (await count(fields.id)) === 0, `${res.status}`);
  };
  await refuse('a text file posing as an image', Buffer.from('not an image at all'), 'image/png', 'fake.png', [400]);
  await refuse(
    'an animated GIF',
    await sharp({ create: { width: 40, height: 40, channels: 3, background: '#fff' } }).gif().toBuffer(),
    'image/gif',
    'anim.gif',
    [400],
  );
  await refuse('an image over 5 MB', crypto.randomBytes(5.5 * 1024 * 1024), 'image/png', 'huge.png', [413]);
  const empty = base('an empty file');
  const emptyRes = await call(coordinator, 'POST', events, form(empty, Buffer.alloc(0), 'image/png', 'empty.png'));
  check('an empty file does not create a broken event', (await count(empty.id)) === 0, `${emptyRes.status}`);

  // 5. A credit event still needs its location, and the image is not kept when the publish fails.
  const noLocation = { ...base('Credit event without location'), earnsCredits: true };
  const noLocationRes = await call(coordinator, 'POST', events, form(noLocation, await png(300, 200, '#38a169')));
  check(
    'a rejected publish stores no event and no image',
    noLocationRes.status === 400 &&
      (await count(noLocation.id)) === 0 &&
      (await db.query('SELECT count(*)::int AS n FROM community_event_photos WHERE event_id=$1', [noLocation.id])).rows[0].n === 0,
    `${noLocationRes.status}`,
  );

  // 6. Who may publish and who may view.
  const memberFields = base('Member attempt');
  const memberRes = await call(volunteer, 'POST', events, form(memberFields, await png(300, 200, '#e53e3e')));
  check('a member cannot publish an event with an image', memberRes.status === 403 && (await count(memberFields.id)) === 0, `${memberRes.status}`);
  const outsider = await call(applicant, 'GET', `${events}/${withPhoto.id}/photo`);
  check('someone not yet approved cannot see the image', outsider.status === 403, `${outsider.status}`);
  const anonymous = await call(null, 'GET', `${events}/${withPhoto.id}/photo`);
  check('signing in is required to see the image', anonymous.status === 401, `${anonymous.status}`);
  // The same person is an approved member of a second community. Signed in there, they must
  // not be able to reach this community's event image by naming it in their own community.
  const otherOrg = (await db.query("SELECT id FROM organizations WHERE code='OTHER_QA'")).rows[0].id;
  await sleep(61_000);
  const otherSession = await signIn('+919000000103', false, 'OTHER_QA');
  const crossOrg = await call(otherSession, 'GET', `/organizations/${otherOrg}/community/events/${withPhoto.id}/photo`);
  check('an event image is not served through another community', crossOrg.status === 404, `${crossOrg.status}`);
  const wrongToken = await call(volunteer, 'GET', `/organizations/${otherOrg}/community/events/${withPhoto.id}/photo`);
  check('a sign-in for one community cannot read another', wrongToken.status === 403, `${wrongToken.status}`);

  // 7. A retried publish is recognised; a changed image is not silently accepted.
  const retry = await call(coordinator, 'POST', events, form(withPhoto, cover, 'image/jpeg', 'cover.jpg'));
  check('retrying the same publish returns the same event', retry.status === 201 && retry.body?.id === withPhoto.id, `${retry.status}`);
  check('a retry stores the image only once', (await db.query('SELECT count(*)::int AS n FROM community_event_photos WHERE event_id=$1', [withPhoto.id])).rows[0].n === 1);
  const different = await call(coordinator, 'POST', events, form(withPhoto, await png(800, 400, '#805ad5')));
  check('the same event id with a different image is refused', different.status === 409, `${different.status}`);
  const dropped = await call(coordinator, 'POST', events, withPhoto);
  check('the same event id with the image left out is refused', dropped.status === 409, `${dropped.status}`);

  // 8. Database guards.
  const oversize = await db
    .query('INSERT INTO community_event_photos(event_id,jpeg,sha256) VALUES($1,$2,$3)', [plain.id, Buffer.alloc(0), 'x'.repeat(64)])
    .then(() => 'inserted')
    .catch((e) => e.code);
  check('the database rejects an empty image', oversize === '23514', oversize);
  const dup = await db
    .query('INSERT INTO community_event_photos(event_id,jpeg,sha256) VALUES($1,$2,$3)', [withPhoto.id, Buffer.from([1]), 'y'.repeat(64)])
    .then(() => 'inserted')
    .catch((e) => e.code);
  check('the database allows only one image per event', dup === '23505', dup);

  await db.end();
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll event image checks passed.');
  process.exitCode = failures ? 1 : 0;
})().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await db.end().catch(() => {});
});
