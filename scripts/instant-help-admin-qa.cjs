const assert = require('node:assert/strict');
const fixture = require('../node_modules/.cache/shop-wallet-preview/fixture.json');
const state = require('../node_modules/.cache/shop-wallet-preview/state.json');
assert.match(state.database, /^ktb_interface_qa_/);
assert.equal(state.webPort, 3110);
(async () => {
  const origin = 'http://127.0.0.1:3110';
  const cookies = new Map();
  async function request(path, body) {
    const r = await fetch(origin + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        origin,
        cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; '),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    for (const c of r.headers.getSetCookie()) {
      const pair = c.split(';')[0];
      const n = pair.indexOf('=');
      cookies.set(pair.slice(0, n), pair.slice(n + 1));
    }
    return r;
  }
  for (const body of [
    { action: 'request-code', phone: fixture.people.coordinator.phone },
    { action: 'verify', phone: fixture.people.coordinator.phone, code: '123456' },
    { action: 'staff-code-request' },
    { action: 'staff-code-verify', code: '123456' },
  ]) {
    const r = await request('/api/session', body);
    assert.ok(r.ok, `Admin sign-in ${body.action}: ${r.status} ${await r.text()}`);
  }
  const base = `/api/backend/organizations/${fixture.org}/instant-help`;
  const list = await request(base + '/reviews?status=APPROVED');
  assert.equal(list.status, 200, 'review list gateway');
  const sessions = await list.json();
  assert.ok(Array.isArray(sessions));
  const sample = sessions.find(
    (s) => s.description.startsWith('QA instant help:') && s.photos.length && s.voiceDurationMs,
  );
  assert.ok(sample, 'approved fictional evidence session');
  const photo = await request(base + '/' + sample.id + '/photos/' + sample.photos[0]);
  assert.equal(photo.status, 200, 'private photo gateway');
  assert.match(photo.headers.get('content-type'), /image\/jpeg/);
  assert.match(photo.headers.get('cache-control'), /no-store/);
  const voicePath = base + '/' + sample.id + '/voice';
  const audio = await request(voicePath);
  assert.equal(audio.status, 200, 'private audio gateway');
  assert.equal(audio.headers.get('content-type'), 'audio/wav');
  assert.equal(audio.headers.get('content-disposition'), 'inline');
  assert.match(audio.headers.get('cache-control'), /no-store/);
  assert.equal(Buffer.from(await audio.arrayBuffer()).subarray(0, 4).toString(), 'RIFF');
  assert.equal((await fetch(origin + voicePath)).status, 401);
  const forbidden = await request(base + '/' + sample.id + '/review', {
    decision: 'APPROVE',
    version: sample.version,
    minutes: 1,
    notes: 'Repeat gateway approval must not award again',
  });
  assert.equal(forbidden.status, 409, 'review POST reaches API conflict protection');
  // A fresh fictional session verifies a successful staff decision through the website gateway.
  async function direct(path, body, token) {
    const r = await fetch('http://127.0.0.1:3111/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(token ? { authorization: 'Bearer ' + token } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const value = await r.json();
    assert.ok(r.ok, `Direct QA setup: ${r.status} ${JSON.stringify(value)}`);
    return value;
  }
  await direct('/auth/otp/request', { phone: fixture.people.volunteer.phone });
  const login = await direct('/auth/otp/verify', {
    phone: fixture.people.volunteer.phone,
    code: '123456',
  });
  const source = `/organizations/${fixture.org}/instant-help`;
  const started = await direct(
    source,
    {
      key: crypto.randomUUID(),
      description: 'QA instant help: website review check',
      locationLabel: 'Fictional Kottakkal QA location',
      latitude: 10.999,
      longitude: 76.001,
    },
    login.accessToken,
  );
  await direct(source + '/' + started.id + '/stop', {}, login.accessToken);
  const pending = await direct(
    source + '/' + started.id + '/resubmit',
    { notes: 'Fictional evidence for gateway decision test' },
    login.accessToken,
  );
  const decision = await request(base + '/' + pending.id + '/review', {
    decision: 'REJECT',
    version: pending.version,
    notes: 'Disposable QA review; close without credits',
  });
  assert.equal(decision.status, 200, 'staff decision through website');
  assert.equal((await decision.json()).status, 'REJECTED');
  console.log(
    JSON.stringify({
      result: 'passed',
      checks: [
        'staff sign-in',
        'staff second factor',
        'review list through website',
        'private image and playable voice note through website',
        'staff decision through website',
        'duplicate approval refused',
      ],
    }),
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
