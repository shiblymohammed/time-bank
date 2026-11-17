const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fixture = require('../node_modules/.cache/shop-wallet-preview/fixture.json');
const origin = 'http://127.0.0.1:3111';
const state = require('../node_modules/.cache/shop-wallet-preview/state.json');
assert.match(state.database, /^ktb_interface_qa_/);
assert.equal(state.apiPort, 3111);
async function call(path, token, method = 'GET', body) {
  const r = await fetch(origin + '/api' + path, {
    method,
    headers: {
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}
function ok(r) {
  assert.ok(r.status >= 200 && r.status < 300, `HTTP ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}
async function login(phone, staff = false) {
  ok(await call('/auth/otp/request', null, 'POST', { phone }));
  const session = ok(await call('/auth/otp/verify', null, 'POST', { phone, code: '123456' }));
  if (staff) {
    ok(await call('/auth/staff-code/request', session.accessToken, 'POST'));
    ok(await call('/auth/staff-code/verify', session.accessToken, 'POST', { code: '123456' }));
  }
  return session.accessToken;
}
(async () => {
  const volunteer = await login(fixture.people.volunteer.phone),
    staff = await login(fixture.people.coordinator.phone, true),
    other = await login(fixture.people.beneficiary.phone);
  const base = `/organizations/${fixture.org}/instant-help`;
  const before = ok(await call('/wallet/summary', volunteer));
  const pendingOld = ok(await call(base + '/mine', volunteer)).filter(
    (s) => s.status === 'RUNNING',
  );
  for (const s of pendingOld) {
    assert.ok(
      s.description.startsWith('QA instant help:'),
      'A different demo timer is running; leave it unchanged',
    );
    ok(
      await call(base + '/' + s.id + '/review', staff, 'POST', {
        decision: 'REJECT',
        version: s.version,
        notes: 'Close prior disposable QA timer',
      }),
    );
  }
  const dto = {
    key: randomUUID(),
    description: 'QA instant help: supported a neighbour',
    locationLabel: 'Kottakkal QA junction',
    latitude: 10.999,
    longitude: 76.001,
  };
  assert.equal((await call(base, other, 'POST', dto)).status, 403);
  assert.equal((await call(base, volunteer, 'POST', { ...dto, latitude: undefined })).status, 400);
  assert.equal(
    (await call(base, volunteer, 'POST', { ...dto, latitude: undefined, longitude: undefined })).status,
    400,
  );
  const sharp = require('../apps/api/node_modules/sharp');
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#6235f5' } })
    .png()
    .toBuffer();
  // One second of synthetic audio. No real person or recording is used.
  const voice = Buffer.alloc(32044);
  voice.write('RIFF', 0);
  voice.writeUInt32LE(voice.length - 8, 4);
  voice.write('WAVEfmt ', 8);
  voice.writeUInt32LE(16, 16);
  voice.writeUInt16LE(1, 20);
  voice.writeUInt16LE(1, 22);
  voice.writeUInt32LE(16000, 24);
  voice.writeUInt32LE(32000, 28);
  voice.writeUInt16LE(2, 32);
  voice.writeUInt16LE(16, 34);
  voice.write('data', 36);
  voice.writeUInt32LE(voice.length - 44, 40);
  function startWithEvidence(audio) {
    const form = new FormData();
    for (const [key, value] of Object.entries(dto)) form.append(key, String(value));
    form.append('photo', new Blob([png], { type: 'image/png' }), 'qa.png');
    form.append('voice', new Blob([audio], { type: 'audio/wav' }), 'qa.wav');
    return fetch(origin + '/api' + base, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + volunteer },
      body: form,
    });
  }
  assert.equal((await startWithEvidence(Buffer.from('invalid media'))).status, 400);
  const evidenceStart = await startWithEvidence(voice);
  assert.equal(evidenceStart.status, 201, await evidenceStart.clone().text());
  const started = await evidenceStart.json();
  assert.equal(started.status, 'RUNNING');
  assert.equal(started.latitude, dto.latitude);
  assert.equal(started.longitude, dto.longitude);
  assert.equal(started.voiceDurationMs, 1000);
  assert.equal(started.photos.length, 1);
  const audioPath = origin + '/api' + base + '/' + started.id + '/voice';
  const privateAudio = await fetch(audioPath, { headers: { authorization: 'Bearer ' + staff } });
  assert.equal(privateAudio.status, 200);
  assert.match(privateAudio.headers.get('content-type'), /audio\/wav/);
  assert.match(privateAudio.headers.get('cache-control'), /no-store/);
  assert.ok(Buffer.from(await privateAudio.arrayBuffer()).equals(voice));
  assert.equal(
    (await fetch(audioPath, { headers: { authorization: 'Bearer ' + other } })).status,
    404,
  );
  assert.ok(started.startedAt);
  assert.equal(started.creditsEarned, 0);
  const repeatedStart = await startWithEvidence(voice);
  assert.equal(repeatedStart.status, 201);
  const repeated = await repeatedStart.json();
  assert.equal(repeated.id, started.id);
  assert.equal(repeated.photos.length, 1);
  assert.equal(
    (await call(base, volunteer, 'POST', { ...dto, description: 'Different request' })).status,
    409,
  );
  assert.equal((await call(base, volunteer, 'POST', { ...dto, key: randomUUID() })).status, 409);
  assert.equal((await call(base + '/' + started.id, other)).status, 404);
  assert.equal(
    (await call(`/organizations/${fixture.orgB}/instant-help/${started.id}`, staff)).status >= 400,
    true,
  );
  assert.equal((await call(base + '/reviews', volunteer)).status, 403);
  const ownAssignments = ok(
    await call(`/organizations/${fixture.org}/assignments/mine`, volunteer),
  );
  if (ownAssignments[0]) {
    const conflict = await call(
      `/organizations/${fixture.org}/assignments/${ownAssignments[0].id}/start`,
      volunteer,
      'POST',
      {},
    );
    assert.equal(conflict.status, 409);
    assert.match(JSON.stringify(conflict.data), /active timer/);
  }
  // Private evidence is decoded and stripped of original metadata before storage.
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'qa.png');
  const upload = await fetch(origin + '/api' + base + '/' + started.id + '/photos', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + volunteer },
    body: form,
  });
  assert.equal(upload.status, 201, await upload.clone().text());
  const withPhoto = await upload.json();
  assert.equal(withPhoto.photos.length, 1);
  const repeatUpload = await fetch(origin + '/api' + base + '/' + started.id + '/photos', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + volunteer },
    body: form,
  });
  assert.equal(repeatUpload.status, 201);
  assert.equal((await repeatUpload.json()).photos.length, 1);

  const photoPath = origin + '/api' + base + '/' + started.id + '/photos/' + withPhoto.photos[0];
  const privateRead = await fetch(photoPath, { headers: { authorization: 'Bearer ' + staff } });
  assert.equal(privateRead.status, 200);
  assert.match(privateRead.headers.get('cache-control'), /private/);
  assert.match(privateRead.headers.get('content-type'), /image\/jpeg/);
  assert.equal(
    (await fetch(photoPath, { headers: { authorization: 'Bearer ' + other } })).status,
    404,
  );
  const stopped = ok(await call(base + '/' + started.id + '/stop', volunteer, 'POST', {}));
  assert.equal(stopped.status, 'NEEDS_INFO');
  assert.equal(stopped.creditsEarned, 0);
  assert.equal(
    (
      await call(base + '/' + started.id + '/review', staff, 'POST', {
        decision: 'APPROVE',
        version: stopped.version,
        minutes: 1,
        notes: 'Cannot approve before submission',
      })
    ).status,
    409,
  );

  const stoppedAgain = ok(await call(base + '/' + started.id + '/stop', volunteer, 'POST', {}));
  assert.equal(stoppedAgain.finishedAt, stopped.finishedAt);
  const pending = ok(
    await call(base + '/' + started.id + '/resubmit', volunteer, 'POST', {
      notes: 'Helped the neighbour reach a safe place. Disposable QA.',
    }),
  );
  assert.equal(pending.status, 'PENDING');
  assert.equal(pending.finishedAt, stopped.finishedAt);
  assert.ok(pending.reportedMinutes >= 1);
  assert.equal(pending.creditsEarned, 0);
  const submittedAgain = ok(
    await call(base + '/' + started.id + '/resubmit', volunteer, 'POST', { notes: pending.notes }),
  );
  assert.equal(submittedAgain.version, pending.version);

  assert.equal(
    (
      await call(base + '/' + started.id + '/review', volunteer, 'POST', {
        decision: 'APPROVE',
        version: pending.version,
        minutes: 1,
        notes: 'Self approval attempt',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call(base + '/' + started.id + '/review', staff, 'POST', {
        decision: 'APPROVE',
        version: pending.version,
        minutes: pending.reportedMinutes + 1,
        notes: 'Over claimed duration',
      })
    ).status,
    400,
  );
  const info = ok(
    await call(base + '/' + started.id + '/review', staff, 'POST', {
      decision: 'NEEDS_INFO',
      version: pending.version,
      notes: 'Please explain who was helped',
    }),
  );
  assert.equal(info.status, 'NEEDS_INFO');
  const resubmitted = ok(
    await call(base + '/' + started.id + '/resubmit', volunteer, 'POST', {
      notes: 'Added details about the neighbour and the situation. QA.',
    }),
  );
  const decision = {
    decision: 'APPROVE',
    version: resubmitted.version,
    minutes: 1,
    notes: 'Verified the fictional session location and evidence',
  };
  const results = await Promise.all([
    call(base + '/' + started.id + '/review', staff, 'POST', decision),
    call(base + '/' + started.id + '/review', staff, 'POST', decision),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const approved = ok(await call(base + '/' + started.id, volunteer));
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.creditsEarned, 0.02);
  if (ownAssignments[0]) {
    const overlap = await call(
      `/organizations/${fixture.org}/assignments/${ownAssignments[0].id}/start`,
      volunteer,
      'POST',
      {
        occurredAt: new Date(Date.parse(started.startedAt) - 180000).toISOString(),
        clientOperationId: randomUUID(),
      },
    );
    assert.equal(overlap.status, 409);
    assert.match(JSON.stringify(overlap.data), /overlaps an instant help/);
  }

  const wallet = ok(await call('/wallet/transactions?page=1&limit=50', volunteer));
  const entries = wallet.data.filter((e) => e.instantHelpSessionId === started.id);
  assert.equal(entries.length, 1);
  assert.equal(Number(entries[0].amount), 0.02);
  const after = ok(await call('/wallet/summary', volunteer));
  assert.equal(Math.round((Number(after.balanceCredits) - Number(before.balanceCredits)) * 100), 2);
  assert.equal(Number(after.minutesGiven) - Number(before.minutesGiven), 1);
  // Competing starts are serialized across API instances by the database lock.
  const races = await Promise.all([
    call(base, volunteer, 'POST', { ...dto, key: randomUUID() }),
    call(base, volunteer, 'POST', { ...dto, key: randomUUID() }),
  ]);
  assert.deepEqual(races.map((r) => r.status).sort(), [201, 409]);
  const abandoned = races.find((r) => r.status === 201).data;
  const closed = ok(
    await call(base + '/' + abandoned.id + '/review', staff, 'POST', {
      decision: 'REJECT',
      version: abandoned.version,
      notes: 'Close disposable abandoned timer without awarding credits',
    }),
  );
  assert.equal(closed.status, 'REJECTED');
  assert.equal(closed.creditsEarned, 0);
  console.log(
    JSON.stringify({
      result: 'passed',
      session: started.id,
      checks: [
        'volunteer approval gate',
        'location validation',
        'idempotent start',
        'single active timer',
        'scheduled timer exclusion',
        'tenant privacy',
        'private photo upload',
        'finish and retry',
        'staff-only review',
        'duration cap',
        'more information',
        'concurrent approval',
        'one ledger entry',
        'wallet balance and profile minutes',
        'concurrent starts',
        'abandoned timer closure',
      ],
    }),
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
