// End-to-end member journey against the disposable interface QA API (http://127.0.0.1:3001).
// Two new people join, get approved, ask for and give help, confirm it, earn and gift credits;
// then the side paths: decline, reschedule, cancel, dispute and the coordinator's decision.
// Each step prints PASS or FAIL and the run carries on, so one run lists every gap.
//
//   node scripts/journey-qa.cjs
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const state = require('../node_modules/.cache/interface-qa/state.json');
const fixture = require('../node_modules/.cache/interface-qa/fixture.json');
if (!/^ktb_interface_qa_[a-z0-9_]+$/.test(state.database))
  throw Error('Disposable QA database required');

const API = 'http://127.0.0.1:3001/api';
const ORG = fixture.org;
const ORG_CODE = 'INTERFACE_QA';
const SERVICE = fixture.catalogue;
// Fresh numbers each run, so every run is a first-time join.
const stamp = String(Date.now()).slice(-4);
const PHONES = { beneficiary: `+9190000${stamp}1`, volunteer: `+9190000${stamp}2` };

async function call(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data: data && 'data' in data && !('meta' in data) ? data.data : data };
}
const ok = (r, what) => {
  assert.ok(r.status < 300, `${what}: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  return r.data;
};
const list = (d) => (Array.isArray(d) ? d : (d?.data ?? d?.items ?? d?.memberships ?? []));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function db(sql, params) {
  const { createRequire } = require('node:module');
  const { Client } = createRequire(require.resolve('../apps/api/package.json'))('pg');
  const client = new Client({ connectionString: `postgresql://ktb_interface_qa@127.0.0.1:${state.port}/${state.database}` });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows;
  } finally {
    await client.end();
  }
}
// A real visit takes time; move the start back so the reported hour is believable.
const visitLasted = (assignmentId, minutes) =>
  db(`UPDATE volunteer_assignments SET started_at = now() - ($2 || ' minutes')::interval WHERE id = $1`, [
    assignmentId,
    String(minutes),
  ]);

const results = [];
async function step(name, fn) {
  try {
    const note = await fn();
    results.push(['PASS', name]);
    console.log(`PASS  ${name}${note ? ` - ${note}` : ''}`);
  } catch (error) {
    results.push(['FAIL', name]);
    console.log(`FAIL  ${name}\n      ${String(error.message).split('\n')[0]}`);
  }
}

async function signIn(phone, app = true) {
  const challenge = ok(await call('POST', '/auth/otp/request', null, { phone }), 'otp request');
  const session = ok(
    await call('POST', '/auth/otp/verify', null, {
      phone,
      code: challenge.devOtp ?? '123456',
      ...(app ? { organizationCode: ORG_CODE } : {}),
    }),
    'otp verify',
  );
  return session.accessToken;
}
async function staffSignIn(phone) {
  const token = await signIn(phone, false);
  ok(await call('POST', '/auth/staff-code/request', token), 'staff code request');
  ok(await call('POST', '/auth/staff-code/verify', token, { code: '123456' }), 'staff code verify');
  return token;
}
async function waitFor(what, fn, seconds = 40) {
  for (let i = 0; i < seconds; i++) {
    const value = await fn();
    if (value) return value;
    await sleep(1000);
  }
  throw Error(`timed out waiting for ${what}`);
}
const inMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString();
const request = (token, minutes, notes) =>
  call('POST', `/organizations/${ORG}/requests`, token, {
    serviceCatalogId: SERVICE,
    idempotencyKey: randomUUID(),
    urgency: 'SCHEDULED',
    scheduledStartTime: inMinutes(minutes),
    expectedDurationMinutes: 60,
    locationAddressText: 'Journey QA house, near Arya Vaidya Sala',
    locationWardNumber: '7',
    locationPostalCode: '676503',
    beneficiaryNotes: notes,
  });

(async () => {
  const t = {};
  const ids = {};
  console.log(`Journey run ${stamp}: beneficiary ${PHONES.beneficiary}, volunteer ${PHONES.volunteer}\n`);
  // Earlier runs' people would take the first offers (an offer goes to at most 5 volunteers),
  // so set them aside. Only the disposable QA database is touched (checked at the top).
  const fixturePhones = Object.values(fixture.people).map((p) => p.phone);
  await db(
    `UPDATE organization_memberships SET status = 'SUSPENDED'
     WHERE status = 'APPROVED' AND user_id IN (
       SELECT id FROM users WHERE phone_e164 ~ '^\\+9190000[0-9]{4}[12]$' AND NOT phone_e164 = ANY($1))`,
    [fixturePhones],
  );

  await step('Staff sign in with the email code', async () => {
    t.coordinator = await staffSignIn(fixture.people.coordinator.phone);
  });

  await step('New people sign in from the Kottakkal app', async () => {
    t.beneficiary = await signIn(PHONES.beneficiary);
    t.volunteer = await signIn(PHONES.volunteer);
    const me = ok(await call('GET', '/auth/me', t.beneficiary), 'me');
    assert.equal(me.memberships.length, 0, 'a new person has no membership yet');
  });

  const NAMES = { beneficiary: `Journey Beneficiary ${stamp.replace(/\d/g, (d) => 'abcdefghij'[d])}`, volunteer: 'Journey Volunteer' };
  await step('Joining asks for a full name', async () => {
    const r = await call('POST', `/organizations/${ORG}/memberships/apply`, t.beneficiary, {
      requestedRole: 'BENEFICIARY',
    });
    assert.equal(r.status, 400, `expected 400, got ${r.status}`);
    return r.data?.message;
  });

  await step('They apply to join with their names', async () => {
    ok(
      await call('POST', `/organizations/${ORG}/memberships/apply`, t.beneficiary, {
        fullName: NAMES.beneficiary,
        requestedRole: 'BENEFICIARY',
        notes: 'Needs help with hospital visits',
      }),
      'beneficiary apply',
    );
    ok(
      await call('POST', `/organizations/${ORG}/memberships/apply`, t.volunteer, {
        fullName: NAMES.volunteer,
        requestedRole: 'VOLUNTEER',
        volunteer: {
          maxTravelRadiusKm: 5,
          availableAtShortNotice: true,
          usualDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
          usualTimes: ['MORNING', 'AFTERNOON', 'EVENING'],
          skillCodes: [],
        },
      }),
      'volunteer apply',
    );
  });

  await step("A phone registers for push under its app's community", async () => {
    const token = `journey-${stamp}`;
    ok(await call('PUT', '/notifications/devices', t.volunteer, { token, platform: 'ANDROID' }), 'register');
    const [device] = await db('SELECT organization_id FROM push_devices WHERE token = $1', [token]);
    assert.equal(device?.organization_id, ORG);
    ok(await call('DELETE', '/notifications/devices', t.volunteer, { token }), 'remove');
  });

  await step('The coordinator sees both applications waiting', async () => {
    const all = list(ok(await call('GET', `/organizations/${ORG}/memberships?limit=100`, t.coordinator), 'list'));
    for (const role of ['beneficiary', 'volunteer']) {
      const m = all.find((x) => (x.user?.phoneE164 ?? x.phoneE164) === PHONES[role]);
      assert.ok(m, `${role} application not in the coordinator's list`);
      ids[role] = m.id;
    }
    return `statuses ${all.filter((x) => [ids.beneficiary, ids.volunteer].includes(x.id)).map((x) => x.status).join(', ')}`;
  });

  await step('The coordinator approves them with their roles', async () => {
    ok(
      await call('POST', `/organizations/${ORG}/memberships/${ids.beneficiary}/approve`, t.coordinator, {
        initialRole: 'BENEFICIARY',
      }),
      'approve beneficiary',
    );
    ok(
      await call('POST', `/organizations/${ORG}/memberships/${ids.volunteer}/approve`, t.coordinator, {
        initialRole: 'VOLUNTEER',
      }),
      'approve volunteer',
    );
  });

  await step('The coordinator records the beneficiary as eligible', async () => {
    ok(
      await call('POST', `/organizations/${ORG}/beneficiaries/eligibility`, t.coordinator, {
        membershipId: ids.beneficiary,
        eligibilityType: 'ONGOING',
        reviewDueAt: new Date(Date.now() + 60 * 86_400_000).toISOString(),
      }),
      'eligibility',
    );
  });

  await step('The approved people see their roles', async () => {
    for (const role of ['beneficiary', 'volunteer']) {
      const me = ok(await call('GET', '/auth/me', t[role]), 'me');
      const m = me.memberships.find((x) => x.organizationId === ORG);
      assert.equal(m?.status, 'APPROVED', `${role} membership is ${m?.status}`);
      assert.ok(m.roles.includes(role.toUpperCase()), `${role} roles are ${m.roles}`);
      ids[`${role}Number`] = m.membershipNumber;
    }
  });

  await step('The volunteer sets where and when they can help', async () => {
    ok(
      await call('PUT', `/organizations/${ORG}/volunteers/${ids.volunteer}/availability`, t.volunteer, {
        isAvailableImmediate: true,
        maxTravelRadiusKm: 5,
        preferredWardNumbers: ['7'],
        residentialAddressText: 'Journey QA volunteer, Kottakkal',
        residentialWardNumber: '7',
        residentialPostalCode: '676503',
        isGpsConsented: false,
      }),
      'availability',
    );
  });

  // Our new volunteer should be the one offered; the fixture volunteer also covers ward 7.
  const volunteers = [];
  await step('Other ward 7 volunteers sign in too', async () => {
    t.fixtureVolunteer = await signIn(fixture.people.volunteer.phone);
    volunteers.push(['new volunteer', () => t.volunteer], ['fixture volunteer', () => t.fixtureVolunteer]);
  });
  async function offerFor(requestId) {
    return waitFor('a volunteer offer', async () => {
      for (const [who, token] of volunteers) {
        const mine = list(ok(await call('GET', `/organizations/${ORG}/assignments/mine`, token()), 'mine'));
        const offer = mine.find(
          (a) => (a.serviceRequestId ?? a.serviceRequest?.id) === requestId && a.status === 'OFFERED',
        );
        if (offer) return { who, token: token(), offer };
      }
      return null;
    });
  }

  await step('The beneficiary asks for help', async () => {
    const r = ok(await request(t.beneficiary, 5, 'Journey main request'), 'create request');
    ids.request = r.id;
    return `${r.requestNumber ?? r.id} ${r.status}`;
  });

  let main;
  await step('Automatic matching offers it to a volunteer', async () => {
    main = await offerFor(ids.request);
    return `offered to the ${main.who}`;
  });

  await step('The volunteer accepts', async () => {
    ok(
      await call('POST', `/organizations/${ORG}/assignments/${main.offer.id}/accept`, main.token, {
        clientOperationId: randomUUID(),
      }),
      'accept',
    );
    const r = ok(await call('GET', `/organizations/${ORG}/requests/${ids.request}`, t.beneficiary), 'get');
    return `request now ${r.status}`;
  });

  await step('The beneficiary sees who is coming', async () => {
    const r = ok(await call('GET', `/organizations/${ORG}/requests/${ids.request}`, t.beneficiary), 'get');
    const a = (r.assignments ?? []).find((x) => x.id === main.offer.id);
    assert.ok(a, 'the accepted assignment is not on the request');
    assert.ok(a.volunteer?.phoneE164, "the volunteer's phone is not shown while the visit is booked");
    if (main.who === 'new volunteer') assert.equal(a.volunteer.fullName, NAMES.volunteer);
    return `${a.volunteer.fullName ?? 'unnamed'} (${a.volunteer.membershipNumber}), phone shown`;
  });

  await step('The volunteer sees who they are helping', async () => {
    const mine = list(ok(await call('GET', `/organizations/${ORG}/assignments/mine`, main.token), 'mine'));
    const a = mine.find((x) => x.id === main.offer.id);
    const who = a?.serviceRequest?.beneficiary;
    assert.equal(who?.fullName, NAMES.beneficiary);
    assert.equal(who?.phoneE164, PHONES.beneficiary);
    return `${who.fullName}, phone shown`;
  });

  await step('The coordinator sees names on the request and can search by name', async () => {
    const m = ok(await call('GET', `/organizations/${ORG}/requests/${ids.request}/matching`, t.coordinator), 'matching');
    assert.equal(m.request.beneficiaryName, NAMES.beneficiary);
    const a = m.assignments.find((x) => x.id === main.offer.id);
    if (main.who === 'new volunteer') assert.equal(a?.fullName, NAMES.volunteer);
    const found = list(
      ok(
        await call('GET', `/organizations/${ORG}/memberships?search=${encodeURIComponent(NAMES.beneficiary)}`, t.coordinator),
        'search',
      ),
    );
    assert.deepEqual(found.map((x) => x.id), [ids.beneficiary]);
    return `${m.request.beneficiaryName}, ${a?.fullName ?? 'unnamed volunteer'}`;
  });

  await step('The volunteer starts the visit', async () => {
    ok(await call('POST', `/organizations/${ORG}/assignments/${main.offer.id}/start`, main.token, {}), 'start');
    await visitLasted(main.offer.id, 60);
  });

  await step('Other volunteers no longer see the filled request', async () => {
    for (const [who, token] of volunteers) {
      if (who === main.who) continue;
      const mine = list(ok(await call('GET', `/organizations/${ORG}/assignments/mine`, token()), 'mine'));
      const stale = mine.find((a) => a.serviceRequestId === ids.request && a.status === 'OFFERED');
      assert.ok(!stale, `the ${who} still has an open offer for it`);
    }
  });

  await step('The volunteer finishes the visit', async () => {
    ok(
      await call('POST', `/organizations/${ORG}/assignments/${main.offer.id}/finish`, main.token, {
        minutes: 60,
        notes: 'Went to the hospital together',
      }),
      'finish',
    );
    const r = ok(await call('GET', `/organizations/${ORG}/requests/${ids.request}`, t.beneficiary), 'get');
    return `request ${r.status}, stage ${r.stage}`;
  });

  let earnedBefore = 0;
  await step('The beneficiary confirms the help', async () => {
    const tx = list(ok(await call('GET', '/wallet/transactions?limit=50', main.token), 'wallet'));
    earnedBefore = tx.length;
    ok(
      await call(
        'POST',
        `/organizations/${ORG}/requests/${ids.request}/assignments/${main.offer.id}/confirm`,
        t.beneficiary,
        { minutes: 60 },
      ),
      'confirm',
    );
    const r = ok(await call('GET', `/organizations/${ORG}/requests/${ids.request}`, t.beneficiary), 'get');
    assert.equal(r.status, 'COMPLETED', `request is ${r.status}`);
  });

  await step('The volunteer is paid in time credits', async () => {
    const tx = await waitFor('the payment', async () => {
      const rows = list(ok(await call('GET', '/wallet/transactions?limit=50', main.token), 'wallet'));
      return rows.length > earnedBefore ? rows : null;
    }, 15);
    const paid = tx.find((x) => x.txType === 'SERVICE_EARNED' || x.tx_type === 'SERVICE_EARNED');
    assert.ok(paid, `no SERVICE_EARNED entry; newest is ${JSON.stringify(tx[0]).slice(0, 120)}`);
    return `${paid.amount} credits`;
  });

  // Each run uses a new made-up Aadhaar number, so earlier runs never collide.
  const aadhaar = `9${stamp}${String(Date.now()).slice(-7)}`.slice(0, 12).padEnd(12, '0');
  await step("A coordinator verifies the beneficiary's ID", async () => {
    const r = ok(
      await call('POST', `/organizations/${ORG}/memberships/${ids.beneficiary}/identity`, t.coordinator, {
        decision: 'VERIFY',
        documentType: 'AADHAAR_CARD',
        documentNumber: aadhaar,
        notes: 'Seen in person',
      }),
      'verify',
    );
    assert.equal(r.documentLast4, aadhaar.slice(-4));
    const me = ok(await call('GET', '/auth/me', t.beneficiary), 'me');
    assert.equal(me.verifiedIdentity?.verificationStatus, 'VERIFIED');
    assert.equal(me.fullName, NAMES.beneficiary);
    return `Aadhaar ending ${r.documentLast4}`;
  });

  await step('The same ID cannot verify a second account', async () => {
    const r = await call('POST', `/organizations/${ORG}/memberships/${ids.volunteer}/identity`, t.coordinator, {
      decision: 'VERIFY',
      documentType: 'AADHAAR_CARD',
      documentNumber: aadhaar,
    });
    assert.equal(r.status, 409, `expected 409, got ${r.status}`);
    const [row] = await db('SELECT document_fingerprint FROM verified_identities v JOIN users u ON u.id = v.user_id WHERE u.phone_e164 = $1', [PHONES.beneficiary]);
    assert.ok(row && !JSON.stringify(row).includes(aadhaar), 'the full number is stored');
    return r.data?.message;
  });

  await step('The volunteer gifts a credit to the beneficiary', async () => {
    if (main.who !== 'new volunteer') return 'skipped: the fixture volunteer was paid instead';
    ok(
      await call('POST', `/organizations/${ORG}/donations`, t.volunteer, {
        amount: 0.5,
        recipientOrganizationId: ORG,
        recipientMembershipNumber: ids.beneficiaryNumber,
        idempotencyKey: randomUUID(),
        note: 'Thank you',
      }),
      'donation',
    );
    const rows = list(ok(await call('GET', '/wallet/transactions?limit=10', t.beneficiary), 'wallet'));
    assert.ok(rows.some((x) => Number(x.amount) === 0.5), 'the gift is not in the beneficiary wallet');
  });

  // ---- side paths ----
  await step('Decline: a declined offer goes to someone else or to the coordinator', async () => {
    const r = ok(await request(t.beneficiary, 90, 'Journey decline'), 'create');
    const first = await offerFor(r.id);
    ok(
      await call('POST', `/organizations/${ORG}/assignments/${first.offer.id}/decline`, first.token, {
        declineReason: 'Not free then',
      }),
      'decline',
    );
    const after = await waitFor('the next step after a decline', async () => {
      const req = ok(await call('GET', `/organizations/${ORG}/requests/${r.id}`, t.coordinator), 'get');
      const offered = (req.assignments ?? []).some((a) => a.status === 'OFFERED' && a.id !== first.offer.id);
      return offered || req.status === 'ESCALATED_TO_COORDINATOR' ? `${req.status}${offered ? ', re-offered' : ''}` : null;
    }, 30);
    ids.declined = r.id;
    return `${first.who} declined; request ${after}`;
  });

  await step('Reschedule: the beneficiary moves a visit', async () => {
    const r = ok(await request(t.beneficiary, 180, 'Journey reschedule'), 'create');
    ok(
      await call('POST', `/organizations/${ORG}/requests/${r.id}/reschedule`, t.beneficiary, {
        newStartTime: inMinutes(24 * 60),
        reason: 'Hospital changed the appointment',
      }),
      'reschedule',
    );
    const req = ok(await call('GET', `/organizations/${ORG}/requests/${r.id}`, t.beneficiary), 'get');
    return `now ${req.status} at ${req.scheduledStartTime}`;
  });

  await step('Cancel: the beneficiary cancels a request', async () => {
    const r = ok(await request(t.beneficiary, 240, 'Journey cancel'), 'create');
    ok(
      await call('POST', `/organizations/${ORG}/requests/${r.id}/cancel`, t.beneficiary, {
        reasonCode: 'NO_LONGER_NEEDED',
        notes: 'Family member will help',
      }),
      'cancel',
    );
    const req = ok(await call('GET', `/organizations/${ORG}/requests/${r.id}`, t.beneficiary), 'get');
    assert.equal(req.status, 'CANCELLED');
  });

  await step('Dispute: the beneficiary disputes, the coordinator decides to pay', async () => {
    const r = ok(await request(t.beneficiary, 3, 'Journey dispute'), 'create');
    const o = await offerFor(r.id);
    ok(await call('POST', `/organizations/${ORG}/assignments/${o.offer.id}/accept`, o.token, { clientOperationId: randomUUID() }), 'accept');
    ok(await call('POST', `/organizations/${ORG}/assignments/${o.offer.id}/start`, o.token, {}), 'start');
    await visitLasted(o.offer.id, 45);
    ok(await call('POST', `/organizations/${ORG}/assignments/${o.offer.id}/finish`, o.token, { minutes: 45 }), 'finish');
    ok(
      await call('POST', `/organizations/${ORG}/requests/${r.id}/assignments/${o.offer.id}/dispute`, t.beneficiary, {
        reason: 'The visit was shorter than agreed',
      }),
      'dispute',
    );
    const review = ok(await call('GET', `/organizations/${ORG}/requests?needsReview=true&limit=50`, t.coordinator), 'review list');
    assert.ok(list(review).some((x) => x.id === r.id), 'the disputed request is not in the coordinator review list');
    ok(
      await call('POST', `/organizations/${ORG}/requests/${r.id}/assignments/${o.offer.id}/resolve`, t.coordinator, {
        decision: 'PAY',
        minutes: 30,
        notes: 'Checked with both; 30 minutes agreed',
      }),
      'resolve',
    );
    const req = ok(await call('GET', `/organizations/${ORG}/requests/${r.id}`, t.coordinator), 'get');
    return `request ${req.status}`;
  });

  await step('Safety: a paused visit stops, stays confidential, and restarts only when allowed', async () => {
    const NOTE = 'Private safety note for staff';
    const r = ok(await request(t.beneficiary, 3, 'Journey safety pause'), 'create');
    const o = await offerFor(r.id);
    const visit = `/organizations/${ORG}/assignments/${o.offer.id}`;
    ok(await call('POST', `${visit}/accept`, o.token, { clientOperationId: randomUUID() }), 'accept');
    const safety = `/organizations/${ORG}/requests/${r.id}`;
    const early = await call('POST', `${safety}/safety-alerts`, t.beneficiary, { action: 'PAUSE' });
    assert.equal(early.status, 409, `an alert before the visit starts should be refused, got ${early.status}`);
    ok(await call('POST', `${visit}/start`, o.token, {}), 'start');
    await visitLasted(o.offer.id, 30);

    const operation = randomUUID();
    const raised = ok(
      await call('POST', `${safety}/safety-alerts`, t.beneficiary, { action: 'PAUSE', notes: NOTE, clientOperationId: operation }),
      'raise',
    );
    const retried = ok(
      await call('POST', `${safety}/safety-alerts`, t.beneficiary, { action: 'PAUSE', notes: NOTE, clientOperationId: operation }),
      'retry',
    );
    assert.equal(retried.id, raised.id, 'a retry raised a second alert');

    const blocked = await call('POST', `${visit}/finish`, o.token, { minutes: 30 });
    assert.equal(blocked.status, 409, `a paused visit should not finish, got ${blocked.status}`);
    const tooSoon = await call('POST', `${safety}/safety-restart`, o.token, { restart: true });
    assert.equal(tooSoon.status, 409, `restart before a coordinator allows it, got ${tooSoon.status}`);
    const payPaused = await call('POST', `${safety}/assignments/${o.offer.id}/resolve`, t.coordinator, {
      decision: 'PAY',
      minutes: 30,
      notes: 'Should be refused',
    });
    assert.equal(payPaused.status, 409, `paying a paused visit, got ${payPaused.status}`);

    // What each person is shown.
    const seen = ok(await call('GET', safety, t.beneficiary), 'member view');
    assert.equal(seen.stage, 'SAFETY_PAUSED');
    const volunteerView = list(ok(await call('GET', `/organizations/${ORG}/assignments/mine`, o.token), 'mine')).find(
      (a) => a.id === o.offer.id,
    );
    assert.equal(volunteerView.safetyPaused, true);
    assert.ok(!JSON.stringify(volunteerView).includes(NOTE), 'the volunteer can read the note');
    assert.ok(!JSON.stringify(volunteerView).includes('BENEFICIARY'), 'the volunteer can see who raised it');
    const denied = await call('GET', `/organizations/${ORG}/safety-alerts`, o.token);
    assert.equal(denied.status, 403, `a member reading alerts, got ${denied.status}`);
    const outsider = await call('POST', `/organizations/${ORG}/safety-alerts/${raised.id}/allow-restart`, t.beneficiary, {
      notes: 'Allowing myself',
    });
    assert.equal(outsider.status, 403, `a member allowing a restart, got ${outsider.status}`);

    const alerts = ok(await call('GET', `/organizations/${ORG}/safety-alerts`, t.coordinator), 'alert list');
    const alert = alerts.find((a) => a.id === raised.id);
    assert.equal(alert.notes, NOTE);
    assert.equal(alert.raisedByRole, 'BENEFICIARY');
    assert.equal(alert.request.beneficiaryName, NAMES.beneficiary);
    assert.ok(alert.visits[0].volunteerPhone, 'staff need the volunteer phone');

    ok(await call('POST', `/organizations/${ORG}/safety-alerts/${raised.id}/acknowledge`, t.coordinator, {}), 'acknowledge');
    ok(
      await call('POST', `/organizations/${ORG}/safety-alerts/${raised.id}/allow-restart`, t.coordinator, { notes: 'Spoke to both' }),
      'allow',
    );
    const notVolunteer = await call('POST', `${safety}/safety-restart`, t.beneficiary, { restart: true });
    assert.equal(notVolunteer.status, 403, `the beneficiary restarting, got ${notVolunteer.status}`);

    // Ten minutes in the pause must not count as time worked.
    await db(`UPDATE volunteer_assignments SET paused_at = now() - interval '10 minutes' WHERE id = $1`, [o.offer.id]);
    await db(`UPDATE volunteer_assignments SET started_at = now() - interval '40 minutes' WHERE id = $1`, [o.offer.id]);
    ok(await call('POST', `${safety}/safety-restart`, o.token, { restart: true }), 'restart');
    const after = ok(await call('GET', safety, t.beneficiary), 'after restart');
    assert.equal(after.stage, null);
    const closed = ok(await call('GET', `/organizations/${ORG}/safety-alerts`, t.coordinator), 'open alerts');
    assert.ok(!closed.some((a) => a.id === raised.id), 'a restarted visit left its alert open');

    const done = ok(await call('POST', `${visit}/finish`, o.token, {}), 'finish');
    assert.ok(done.reportedMinutes >= 30 && done.reportedMinutes <= 32, `paused time was counted: ${done.reportedMinutes}`);
    return `${done.reportedMinutes} minutes counted of 40 on the clock`;
  });

  await step('Safety: ending a visit pays nothing until a coordinator decides', async () => {
    const r = ok(await request(t.beneficiary, 3, 'Journey safety end'), 'create');
    const o = await offerFor(r.id);
    const visit = `/organizations/${ORG}/assignments/${o.offer.id}`;
    ok(await call('POST', `${visit}/accept`, o.token, { clientOperationId: randomUUID() }), 'accept');
    ok(await call('POST', `${visit}/start`, o.token, {}), 'start');
    await visitLasted(o.offer.id, 25);
    const safety = `/organizations/${ORG}/requests/${r.id}`;
    const raised = ok(await call('POST', `${safety}/safety-alerts`, o.token, { action: 'END', notes: 'Leaving now' }), 'raise');

    const member = ok(await call('GET', safety, t.beneficiary), 'member view');
    const seen = member.assignments.find((a) => a.id === o.offer.id);
    assert.equal(seen.status, 'COMPLETED');
    assert.equal(seen.endedEarly, true);
    assert.equal(seen.reviewReason, null, 'members must not see the safety reason');
    assert.ok(!JSON.stringify(member).includes('Leaving now'), 'the beneficiary can read the note');

    const confirm = await call('POST', `${safety}/assignments/${o.offer.id}/confirm`, t.beneficiary, { minutes: 25 });
    assert.equal(confirm.status, 409, `confirming a visit under review, got ${confirm.status}`);
    const dispute = await call('POST', `${safety}/assignments/${o.offer.id}/dispute`, t.beneficiary, { reason: 'Overwriting' });
    assert.equal(dispute.status, 409, `disputing a visit under review, got ${dispute.status}`);

    const staffView = ok(await call('GET', `${safety}/matching`, t.coordinator), 'staff view');
    assert.equal(staffView.assignments.find((a) => a.id === o.offer.id).reviewReason, 'SAFETY_ALERT');
    const review = ok(await call('GET', `/organizations/${ORG}/requests?needsReview=true&limit=50`, t.coordinator), 'review list');
    assert.ok(list(review).some((x) => x.id === r.id), 'the ended visit is not in the review list');

    ok(
      await call('POST', `${safety}/assignments/${o.offer.id}/resolve`, t.coordinator, {
        decision: 'PAY',
        minutes: 20,
        notes: 'Spoke to both; paying the time given',
      }),
      'decide',
    );
    ok(await call('POST', `/organizations/${ORG}/safety-alerts/${raised.id}/close`, t.coordinator, { notes: 'Spoke to both' }), 'close');
    const history = ok(await call('GET', `/organizations/${ORG}/safety-alerts?open=false`, t.coordinator), 'history');
    const alert = history.find((a) => a.id === raised.id);
    assert.equal(alert.status, 'RESOLVED');
    assert.equal(alert.outcome, 'ENDED');
  });

  await step('People are told along the way (push queue)', async () => {
    const { createRequire } = require('node:module');
    const { Client } = createRequire(require.resolve('../apps/api/package.json'))('pg');
    const db = new Client({ connectionString: `postgresql://ktb_interface_qa@127.0.0.1:${state.port}/${state.database}` });
    await db.connect();
    try {
      const tables = (await db.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%notification%'",
      )).rows.map((r) => r.table_name);
      const outbox = tables.find((n) => n.includes('outbox')) ?? tables[0];
      const cols = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name=$1", [outbox])).rows.map((r) => r.column_name);
      const userCol = cols.find((c) => ['user_id', 'recipient_user_id'].includes(c));
      const typeCol = cols.find((c) => ['event_type', 'notification_type', 'type', 'kind'].includes(c));
      const rows = (await db.query(
        `SELECT n.${typeCol} AS type, u.phone_e164 AS phone FROM ${outbox} n JOIN users u ON u.id = n.${userCol}
         WHERE u.phone_e164 = ANY($1)`,
        [[PHONES.beneficiary, PHONES.volunteer]],
      )).rows;
      const summary = {};
      for (const r of rows) summary[`${r.phone === PHONES.beneficiary ? 'beneficiary' : 'volunteer'}:${r.type}`] = (summary[`${r.phone === PHONES.beneficiary ? 'beneficiary' : 'volunteer'}:${r.type}`] ?? 0) + 1;
      assert.ok(rows.length, `nothing queued in ${outbox} for the new people`);
      return Object.entries(summary).map(([k, v]) => `${k}=${v}`).join(' ');
    } finally {
      await db.end();
    }
  });

  const failed = results.filter(([r]) => r === 'FAIL');
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exitCode = failed.length ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
