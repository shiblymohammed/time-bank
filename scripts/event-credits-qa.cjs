// End-to-end check of community event QR check-in and credits against the disposable
// interface-QA API. Usage (after start-interface-qa.ps1 and migrations up to 1729118400045):
//   node scripts/event-credits-qa.cjs
// It moves its own test event through time directly in the QA database, so it refuses
// to run against anything but a ktb_interface_qa_* database.
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../apps/api/package.json'));
const { Client } = req('pg');

const qaRoot = path.resolve(__dirname, '../node_modules/.cache/interface-qa');
const state = require(path.join(qaRoot, 'state.json'));
if (!/^ktb_interface_qa_[a-z0-9_]+$/.test(state.database))
  throw new Error('This check only runs on the disposable interface-QA database');
const API = `http://127.0.0.1:${state.apiPort ?? 3001}/api`;
const OTP = '123456';
// Kottakkal bus stand, and points about 50 m and 1 km away.
const VENUE = { latitude: 10.9982, longitude: 76.0011 };
const NEAR = { latitude: 10.99865, longitude: 76.0011, accuracyMeters: 12 };
const FAR = { latitude: 10.9982, longitude: 76.0102, accuracyMeters: 12 };

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures += 1;
}

async function call(token, method, route, body) {
  const res = await fetch(API + route, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function signIn(phone) {
  // Sign-in is rate limited per minute; wait and retry rather than fail.
  for (let attempt = 0; ; attempt += 1) {
    const sent = await call(null, 'POST', '/auth/otp/request', { phone });
    if (sent.status !== 429) break;
    if (attempt === 4) throw new Error(`Sign-in stayed rate limited for ${phone}`);
    await new Promise((resolve) => setTimeout(resolve, 20_000));
  }
  // Roles come from the community chosen at sign-in.
  const res = await call(null, 'POST', '/auth/otp/verify', {
    phone,
    code: OTP,
    organizationCode: 'KOTTAKKAL',
  });
  const token = res.body?.accessToken ?? res.body?.tokens?.accessToken;
  if (!token)
    throw new Error(`Sign-in failed for ${phone}: ${res.status} ${JSON.stringify(res.body)}`);
  return token;
}

const db = new Client({
  connectionString: `postgresql://ktb_interface_qa@127.0.0.1:${state.port}/${state.database}`,
});

(async () => {
  await db.connect();
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];

  const org = (await one("SELECT id FROM organizations WHERE code='KOTTAKKAL'")).id;
  const member = async (phone) =>
    (
      await one(
        `SELECT m.id FROM organization_memberships m JOIN users u ON u.id=m.user_id
         WHERE u.phone_e164=$1 AND m.organization_id=$2`,
        [phone, org],
      )
    ).id;
  const balance = async (phone) =>
    Number(
      (
        await one(
          `SELECT COALESCE(w.balance_credits,0) AS b FROM users u
           LEFT JOIN universal_time_wallets w ON w.user_id=u.id WHERE u.phone_e164=$1`,
          [phone],
        )
      ).b,
    );

  // Staff powers need an email on file and the emailed staff code (fixed in local QA).
  await db.query(
    "UPDATE users SET email='qa-' || id || '@example.test' WHERE email IS NULL AND phone_e164='+919000000101'",
  );
  const coordinator = await signIn('+919000000101');
  for (const [route, body] of [
    ['/auth/staff-code/request', {}],
    ['/auth/staff-code/verify', { code: OTP }],
  ]) {
    const step = await call(coordinator, 'POST', route, body);
    if (step.status >= 300) throw new Error(`Staff code step ${route} failed: ${step.status}`);
  }
  const volunteer = await signIn('+919000000103');
  const recipient = await signIn('+919000000102');
  const volunteerMember = await member('+919000000103');
  const recipientMember = await member('+919000000102');
  const events = `/organizations/${org}/community/events`;

  const startsAt = new Date(Date.now() + 10 * 60_000);
  const endsAt = new Date(startsAt.getTime() + 180 * 60_000);
  const base = {
    title: 'Bus stand clean-up (QA)',
    description: 'Three hours of shared work.',
    venue: 'Kottakkal bus stand',
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };

  const noLocation = await call(coordinator, 'POST', events, {
    ...base,
    id: crypto.randomUUID(),
    earnsCredits: true,
  });
  check('a credit event needs a check-in location', noLocation.status === 400, `${noLocation.status}`);

  const eventId = crypto.randomUUID();
  const publish = await call(coordinator, 'POST', events, {
    ...base,
    id: eventId,
    earnsCredits: true,
    ...VENUE,
    checkInRadiusMeters: 200,
  });
  check('staff publish a credit event with a location', publish.status === 201, `${publish.status}`);

  // The venue QR: staff only, and its secret never appears in member-facing responses.
  const token = (await one('SELECT checkin_token FROM community_events WHERE id=$1', [eventId])).checkin_token;
  check('every event gets a 64-character check-in secret', /^[0-9a-f]{64}$/.test(token));
  const qr = await call(coordinator, 'GET', `${events}/${eventId}/check-in-qr`);
  check('staff get the venue QR for the event', qr.status === 200 && qr.body?.code === `ktb-event:${eventId}:${token}` && String(qr.body?.qrSvg).includes('<svg'), `${qr.status}`);
  const memberQr = await call(volunteer, 'GET', `${events}/${eventId}/check-in-qr`);
  check('members cannot read the venue QR', memberQr.status === 403, `${memberQr.status}`);
  const withCode = (position, code = token) => ({ ...position, code });

  const listed = (await call(volunteer, 'GET', `${events}?view=upcoming`)).body?.items?.find(
    (e) => e.id === eventId,
  );
  check('members see the location and range', listed?.checkin_radius_meters === 200 && listed?.latitude === VENUE.latitude);
  check('the event shows as upcoming', listed?.phase === 'UPCOMING');
  check('the check-in secret is never sent to members', !JSON.stringify(listed).includes(token));
  const staffRows = (await call(coordinator, 'GET', `${events}?view=staff`)).body;
  check('nor in the staff event list', !JSON.stringify(staffRows).includes(token));

  const notJoined = await call(recipient, 'POST', `${events}/${eventId}/check-in`, withCode(NEAR));
  check('check-in before the event starts is refused', notJoined.status === 409, `${notJoined.status}`);

  for (const token of [volunteer, recipient])
    await call(token, 'PUT', `${events}/${eventId}/attendance`);

  const early = await call(volunteer, 'POST', `${events}/${eventId}/check-in`, withCode(NEAR));
  check('check-in opens only when the event starts', early.status === 409, `${early.status} ${early.body?.message}`);

  // The event is now running (QA database only).
  await db.query(
    "UPDATE community_events SET starts_at=now()-interval '30 minutes', ends_at=now()+interval '150 minutes' WHERE id=$1",
    [eventId],
  );
  const live = (await call(volunteer, 'GET', `${events}?view=upcoming`)).body?.items?.find(
    (e) => e.id === eventId,
  );
  check('the event shows as live with check-in open', live?.phase === 'LIVE' && live?.can_check_in === true);

  const far = await call(volunteer, 'POST', `${events}/${eventId}/check-in`, withCode(FAR));
  check('check-in from 1 km away is refused', far.status === 403, `${far.status} ${far.body?.message}`);
  const sloppy = await call(volunteer, 'POST', `${events}/${eventId}/check-in`, withCode({
    ...FAR,
    accuracyMeters: 5000,
  }));
  check('a poor GPS fix cannot stretch the range', sloppy.status === 403, `${sloppy.status}`);

  const near = await call(volunteer, 'POST', `${events}/${eventId}/check-in`, withCode(NEAR));
  check('check-in within range succeeds', near.status === 201 && near.body?.checkedIn === true, `${near.status} ${JSON.stringify(near.body)}`);
  check('the server records the distance', near.body?.distanceMeters >= 40 && near.body?.distanceMeters <= 60, `${near.body?.distanceMeters} m`);
  const again = await call(volunteer, 'POST', `${events}/${eventId}/check-in`, withCode(NEAR));
  check('checking in twice is harmless', again.body?.replayed === true);

  // Scanning is also how a member who never signed up gets in.
  const stranger = await signIn('+919000000201');
  const strangerMember = await member('+919000000201');
  const strangerRows = async () =>
    (await one('SELECT count(*)::int AS n FROM community_event_attendance WHERE event_id=$1 AND membership_id=$2', [eventId, strangerMember])).n;
  const noCode = await call(stranger, 'POST', `${events}/${eventId}/check-in`, NEAR);
  check('check-in without a QR code is refused', noCode.status === 400, `${noCode.status}`);
  const wrongCode = await call(stranger, 'POST', `${events}/${eventId}/check-in`, withCode(NEAR, 'f'.repeat(64)));
  check('a QR code for another event is refused', wrongCode.status === 403, `${wrongCode.status} ${wrongCode.body?.message}`);
  const junkCode = await call(stranger, 'POST', `${events}/${eventId}/check-in`, withCode(NEAR, 'not-a-code'));
  check('a malformed code is refused', junkCode.status === 400, `${junkCode.status}`);
  const awayScan = await call(stranger, 'POST', `${events}/${eventId}/check-in`, withCode(FAR));
  check('scanning the right QR from far away is refused', awayScan.status === 403, `${awayScan.status}`);
  check('refused scans do not sign anyone up', (await strangerRows()) === 0);
  const walkIn = await call(stranger, 'POST', `${events}/${eventId}/check-in`, withCode(NEAR));
  check(
    'scanning at the venue signs up and checks in a new member',
    walkIn.status === 201 && walkIn.body?.checkedIn === true && walkIn.body?.joinedOnSpot === true,
    `${walkIn.status} ${JSON.stringify(walkIn.body)}`,
  );
  check('the walk-in appears on the roster as checked in', (await strangerRows()) === 1);
  const walkAgain = await call(stranger, 'POST', `${events}/${eventId}/check-in`, withCode(NEAR));
  check('scanning twice is harmless', walkAgain.body?.replayed === true);
  const walkLive = (await call(stranger, 'GET', `${events}?view=mine`)).body?.items?.find((e) => e.id === eventId);
  check('My events lists the walk-in with their check-in', !!walkLive?.my_checked_in_at && walkLive?.joined === true);
  // A full event stops walk-ins, and the walk-in is removed so later payment checks stay simple.
  await db.query('UPDATE community_events SET capacity=(SELECT count(*) FROM community_event_attendance WHERE event_id=$1) WHERE id=$1', [eventId]);
  const late = await signIn('+919000000104');
  const full = await call(late, 'POST', `${events}/${eventId}/check-in`, withCode(NEAR));
  check('a full event refuses walk-ins', full.status === 409, `${full.status} ${full.body?.message}`);
  await db.query('UPDATE community_events SET capacity=NULL WHERE id=$1', [eventId]);
  await db.query('DELETE FROM community_event_attendance WHERE event_id=$1 AND membership_id=$2', [eventId, strangerMember]);

  const tooSoon = await call(coordinator, 'POST', `${events}/${eventId}/attendees/confirm-all`, {});
  check('approval waits until the event ends', tooSoon.status === 409, `${tooSoon.status}`);

  // The event has ended; the volunteer arrived 30 minutes after the start (QA database only).
  await db.query(
    "UPDATE community_events SET starts_at=now()-interval '3 hours', ends_at=now()-interval '1 minute' WHERE id=$1",
    [eventId],
  );
  await db.query(
    `UPDATE community_event_attendance
     SET checked_in_at=(SELECT ends_at FROM community_events WHERE id=$1)-interval '150 minutes 30 seconds'
     WHERE event_id=$1 AND checked_in_at IS NOT NULL`,
    [eventId],
  );
  const ended = (await call(volunteer, 'GET', `${events}?view=mine`)).body?.items?.find(
    (e) => e.id === eventId,
  );
  check('the event shows as ended', ended?.phase === 'ENDED' && ended?.can_check_in === false);
  const lateCheckIn = await call(recipient, 'POST', `${events}/${eventId}/check-in`, withCode(NEAR));
  check('check-in is closed after the event ends', lateCheckIn.status === 409, `${lateCheckIn.status}`);

  const roster = (await call(coordinator, 'GET', `${events}/${eventId}/attendees`)).body;
  const vRow = roster?.items?.find((r) => r.membershipId === volunteerMember);
  const rRow = roster?.items?.find((r) => r.membershipId === recipientMember);
  check('the roster shows who checked in', !!vRow?.checkedInAt && rRow?.checkedInAt === null);
  check('the limit runs from check-in to the end', vRow?.limitMinutes === 150, `${vRow?.limitMinutes}`);
  check('a member who did not check in has no limit', rRow?.limitMinutes === 0, `${rRow?.limitMinutes}`);

  const noShow = await call(
    coordinator,
    'POST',
    `${events}/${eventId}/attendees/${recipientMember}/confirm`,
    { minutes: 60 },
  );
  check('a member who did not check in cannot be paid', noShow.status === 409, `${noShow.status}`);
  const over = await call(
    coordinator,
    'POST',
    `${events}/${eventId}/attendees/${volunteerMember}/confirm`,
    { minutes: 151 },
  );
  check('minutes above the limit are refused', over.status === 400, `${over.status}`);

  const memberTries = await call(volunteer, 'POST', `${events}/${eventId}/attendees/confirm-all`, {});
  check('a member cannot approve attendance', memberTries.status === 403, `${memberTries.status}`);

  const before = await balance('+919000000103');
  const all = await call(coordinator, 'POST', `${events}/${eventId}/attendees/confirm-all`, {
    maxMinutes: 90,
  });
  check(
    'approve everyone pays checked-in members only, at the cap',
    all.body?.confirmed === 1 && all.body?.creditsEarned === 1.5,
    JSON.stringify(all.body),
  );
  const after = await balance('+919000000103');
  check('the volunteer balance rises by 1.5', Math.round((after - before) * 100) === 150, `${before} → ${after}`);

  const repeat = await call(coordinator, 'POST', `${events}/${eventId}/attendees/confirm-all`, {});
  check('approving everyone again pays nothing more', repeat.body?.confirmed === 0, JSON.stringify(repeat.body));
  check('the balance is unchanged after a repeat', (await balance('+919000000103')) === after);

  const rows = await one(
    "SELECT count(*)::int AS n FROM time_credit_ledger WHERE tx_type='EVENT_EARNED' AND community_event_id=$1",
    [eventId],
  );
  check('exactly one ledger entry exists for the event', rows.n === 1, `${rows.n}`);

  const mine = (await call(volunteer, 'GET', `${events}?view=mine`)).body?.items?.find(
    (e) => e.id === eventId,
  );
  check('My events shows check-in, minutes and credits', !!mine?.my_checked_in_at && mine?.my_attended_minutes === 90 && mine?.my_credits_earned === 1.5);

  const history = await call(volunteer, 'GET', '/wallet/transactions?page=1&limit=5');
  const entry = history.body?.data?.find((e) => e.communityEvent?.id === eventId);
  check('Wallet history names the event', entry?.communityEvent?.title === base.title);

  const wallet = (
    await one(
      "SELECT w.id FROM universal_time_wallets w JOIN users u ON u.id=w.user_id WHERE u.phone_e164='+919000000103'",
    )
  ).id;
  const duplicate = await db
    .query(
      `INSERT INTO time_credit_ledger(wallet_id,amount,balance_after,tx_type,originating_org_id,community_event_id,minutes)
       VALUES($1,1,1,'EVENT_EARNED',$2,$3,60)`,
      [wallet, org, eventId],
    )
    .then(() => 'inserted')
    .catch((e) => e.code);
  check('the database rejects a second payment for the same event', duplicate === '23505', duplicate);
  const unchecked = await db
    .query(
      'UPDATE community_event_attendance SET attended_minutes=60, confirmed_at=now(), confirmed_by=(SELECT user_id FROM organization_memberships WHERE id=$3) WHERE event_id=$1 AND membership_id=$2',
      [eventId, recipientMember, volunteerMember],
    )
    .then(() => 'updated')
    .catch((e) => e.code);
  check('the database refuses confirmation without check-in', unchecked === '23514', unchecked);

  await db.end();
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll event check-in and credit checks passed.');
  process.exitCode = failures ? 1 : 0;
})().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await db.end().catch(() => {});
});
