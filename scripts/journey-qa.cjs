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
    // This one test person asks for far more help in a run than the usual monthly limit allows.
    await db('UPDATE beneficiary_eligibilities SET monthly_request_quota = 100 WHERE membership_id = $1', [ids.beneficiary]);
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

  // ---- teams and handovers (Milestone 5) ----
  const mine = async (token) => list(ok(await call('GET', `/organizations/${ORG}/assignments/mine`, token), 'mine'));
  const offerOf = (token, requestId) =>
    waitFor('an offer for this volunteer', async () =>
      (await mine(token)).find((a) => a.serviceRequestId === requestId && a.status === 'OFFERED'),
    );
  const accept = (id, token) =>
    call('POST', `/organizations/${ORG}/assignments/${id}/accept`, token, { clientOperationId: randomUUID() });
  const act = (id, action, token, body = {}) =>
    call('POST', `/organizations/${ORG}/assignments/${id}/${action}`, token, body);
  const statusOf = async (id) => (await db('SELECT status FROM volunteer_assignments WHERE id = $1', [id]))[0].status;
  const earned = async (token) =>
    list(ok(await call('GET', '/wallet/transactions?limit=50', token), 'wallet')).filter(
      (x) => (x.txType ?? x.tx_type) === 'SERVICE_EARNED',
    ).length;
  // The QA service is for one volunteer; each step sets the team size it is testing.
  async function teamRequest(minimum, preferred, notes) {
    const r = ok(await request(t.beneficiary, 3, notes), 'create');
    await db('UPDATE service_requests SET min_volunteers = $1, preferred_volunteers = $2 WHERE id = $3', [minimum, preferred, r.id]);
    return { id: r.id, path: `/organizations/${ORG}/requests/${r.id}` };
  }

  await step('Team: offers stay open until the preferred team is booked; timers and credits are separate', async () => {
    const r = await teamRequest(1, 2, 'Journey team filling');
    const a = await offerOf(t.volunteer, r.id);
    const b = await offerOf(t.fixtureVolunteer, r.id);
    ok(await accept(a.id, t.volunteer), 'first accepts');
    let req = ok(await call('GET', r.path, t.beneficiary), 'get');
    assert.equal(req.status, 'FULLY_MATCHED');
    assert.equal(await statusOf(b.id), 'OFFERED', 'the second offer closed at the minimum');
    ok(await accept(b.id, t.fixtureVolunteer), 'second accepts');

    // Teammates can reach each other while the visit is booked.
    const view = (await mine(t.volunteer)).find((x) => x.id === a.id);
    assert.equal(view.team.teammates.length, 1);
    assert.ok(view.team.teammates[0].phoneE164, 'a booked teammate has no phone number');

    ok(await act(a.id, 'start', t.volunteer), 'first starts');
    await visitLasted(a.id, 40);
    ok(await act(b.id, 'start', t.fixtureVolunteer), 'second starts later');
    await visitLasted(b.id, 25);
    const [before1, before2] = [await earned(t.volunteer), await earned(t.fixtureVolunteer)];
    const one = ok(await act(a.id, 'finish', t.volunteer), 'first finishes');
    const two = ok(await act(b.id, 'finish', t.fixtureVolunteer), 'second finishes');
    assert.ok(one.reportedMinutes >= 40 && two.reportedMinutes < 30, `timers ${one.reportedMinutes}, ${two.reportedMinutes}`);
    ok(await call('POST', `${r.path}/assignments/${a.id}/confirm`, t.beneficiary, {}), 'confirm first');
    req = ok(await call('GET', r.path, t.beneficiary), 'get');
    assert.notEqual(req.status, 'COMPLETED', 'the request closed with one volunteer unconfirmed');
    ok(await call('POST', `${r.path}/assignments/${b.id}/confirm`, t.beneficiary, {}), 'confirm second');
    req = ok(await call('GET', r.path, t.beneficiary), 'get');
    assert.equal(req.status, 'COMPLETED');
    assert.equal(await earned(t.volunteer), before1 + 1, 'the first volunteer was not paid');
    assert.equal(await earned(t.fixtureVolunteer), before2 + 1, 'the second volunteer was not paid');
    return `${one.reportedMinutes} and ${two.reportedMinutes} minutes, each paid`;
  });

  await step('Team: nobody starts until the minimum has arrived; leaving alerts straight away', async () => {
    const r = await teamRequest(2, 2, 'Journey team start');
    const a = await offerOf(t.volunteer, r.id);
    const b = await offerOf(t.fixtureVolunteer, r.id);
    ok(await accept(a.id, t.volunteer), 'first accepts');
    assert.equal(ok(await call('GET', r.path, t.beneficiary), 'get').status, 'PARTIALLY_ACCEPTED');
    ok(await accept(b.id, t.fixtureVolunteer), 'second accepts');

    const arrived = ok(await act(a.id, 'start', t.volunteer), 'first arrives');
    assert.equal(arrived.status, 'ACCEPTED', 'one arrival started the timer');
    assert.ok(arrived.arrivedAt, 'the arrival was not recorded');
    assert.equal(arrived.startedAt ?? null, null);
    const waiting = (await mine(t.volunteer)).find((x) => x.id === a.id);
    assert.equal(waiting.team.waitingForTeam, true);
    assert.equal(waiting.team.stillNeeded, 1);

    // The grace period passing does not make someone on site a no-show.
    await db(`UPDATE volunteer_assignments SET accepted_at = now() - interval '2 hours' WHERE id = $1`, [a.id]);
    await db(`UPDATE service_requests SET scheduled_start_time = now() - interval '45 minutes' WHERE id = $1`, [r.id]);
    await db(`UPDATE volunteer_assignments SET accepted_at = now() WHERE id = $1`, [b.id]);
    await sleep(6_000);
    assert.equal(await statusOf(a.id), 'ACCEPTED', 'someone on site was marked as a no-show');

    ok(await act(b.id, 'start', t.fixtureVolunteer), 'second arrives');
    const [first, second] = await Promise.all([a.id, b.id].map(async (id) => (await db('SELECT status, started_at FROM volunteer_assignments WHERE id = $1', [id]))[0]));
    assert.equal(first.status, 'IN_PROGRESS');
    assert.equal(second.status, 'IN_PROGRESS');
    assert.equal(first.started_at.getTime(), second.started_at.getTime(), 'timers did not start together');

    await visitLasted(a.id, 30);
    const alone = await act(b.id, 'hand-over', t.fixtureVolunteer, { reason: 'Must go', acknowledgeNoCredits: true });
    assert.equal(alone.status, 409, `handing over with a teammate still there, got ${alone.status}`);
    const left = ok(await act(a.id, 'leave', t.volunteer, { reason: 'Family emergency' }), 'leave');
    assert.equal(left.status, 'COMPLETED');
    assert.ok(left.reportedMinutes >= 30, `leaver's time ${left.reportedMinutes}`);
    const snapshot = ok(await call('GET', `${r.path}/matching`, t.coordinator), 'snapshot');
    assert.ok(snapshot.request.belowMinimumAlertedAt, 'the coordinator was not alerted straight away');
    assert.equal(snapshot.assignments.find((x) => x.id === a.id).leavingReason, 'Family emergency');
    await db(
      `UPDATE global_service_definitions SET is_hazardous_physical = true WHERE id =
        (SELECT global_service_id FROM organization_service_catalog WHERE id = $1)`,
      [SERVICE],
    );
    const onSite = (await mine(t.fixtureVolunteer)).find((x) => x.id === b.id);
    await db(
      `UPDATE global_service_definitions SET is_hazardous_physical = false WHERE id =
        (SELECT global_service_id FROM organization_service_catalog WHERE id = $1)`,
      [SERVICE],
    );
    assert.equal(onSite.team.stopHazardousWork, true, 'no instruction to stop hazardous work');
    assert.equal(onSite.team.short, true);
    assert.equal(onSite.team.canHandOver, true);
    assert.equal(await statusOf(b.id), 'IN_PROGRESS', 'the timer of the person still there stopped');

    ok(await act(b.id, 'finish', t.fixtureVolunteer), 'last one finishes');
    assert.equal(ok(await call('GET', `${r.path}/matching`, t.coordinator), 'snapshot').request.belowMinimumAt, null);
    ok(await call('POST', `${r.path}/assignments/${a.id}/confirm`, t.beneficiary, {}), 'confirm leaver');
    ok(await call('POST', `${r.path}/assignments/${b.id}/confirm`, t.beneficiary, {}), 'confirm other');
    assert.equal(ok(await call('GET', r.path, t.beneficiary), 'get').status, 'COMPLETED');
  });

  await step('Team: a teammate finishing waits before the team counts as short', async () => {
    const r = await teamRequest(2, 2, 'Journey team finish wait');
    const a = await offerOf(t.volunteer, r.id);
    const b = await offerOf(t.fixtureVolunteer, r.id);
    ok(await accept(a.id, t.volunteer), 'first accepts');
    ok(await accept(b.id, t.fixtureVolunteer), 'second accepts');
    ok(await act(a.id, 'start', t.volunteer), 'first arrives');
    ok(await act(b.id, 'start', t.fixtureVolunteer), 'second arrives');
    ok(await act(a.id, 'finish', t.volunteer), 'first finishes');
    let snapshot = ok(await call('GET', `${r.path}/matching`, t.coordinator), 'snapshot');
    assert.ok(snapshot.request.belowMinimumAt, 'being short was not noted');
    assert.equal(snapshot.request.belowMinimumAlertedAt, null, 'alerted before the wait');
    await db(`UPDATE service_requests SET below_minimum_at = now() - interval '11 minutes' WHERE id = $1`, [r.id]);
    snapshot = await waitFor('the alert after the wait', async () => {
      const s = ok(await call('GET', `${r.path}/matching`, t.coordinator), 'snapshot');
      return s.request.belowMinimumAlertedAt ? s : null;
    }, 70);

    // A coordinator can bring in someone new, but must not reset someone already working.
    const before = (await db('SELECT started_at FROM volunteer_assignments WHERE id = $1', [b.id]))[0].started_at;
    const [{ id: secondMember }] = await db('SELECT volunteer_membership_id AS id FROM volunteer_assignments WHERE id = $1', [b.id]);
    ok(await call('POST', `${r.path}/dispatch`, t.coordinator, { volunteerMembershipId: secondMember, dispatchNotes: 'Journey check' }), 'dispatch');
    const after = (await db('SELECT status, started_at FROM volunteer_assignments WHERE id = $1', [b.id]))[0];
    assert.equal(after.status, 'IN_PROGRESS', 'dispatching someone already working changed their visit');
    assert.equal(after.started_at.getTime(), before.getTime(), 'dispatching someone already working reset their timer');

    // The coordinator closes the last visit themselves. The search must not outlive it.
    ok(await call('POST', `${r.path}/assignments/${b.id}/resolve`, t.coordinator, { decision: 'PAY', minutes: 1, notes: 'Closing this visit for the volunteer' }), 'decide');
    assert.equal(ok(await call('GET', `${r.path}/matching`, t.coordinator), 'snapshot').request.belowMinimumAt, null);
    ok(await call('POST', `${r.path}/assignments/${a.id}/confirm`, t.beneficiary, {}), 'confirm');
    assert.equal(ok(await call('GET', r.path, t.beneficiary), 'get').status, 'COMPLETED');
  });

  await step('Handover: the finishing volunteer alone earns, and the first is warned', async () => {
    const r = await teamRequest(1, 1, 'Journey handover');
    const a = await offerOf(t.volunteer, r.id);
    ok(await accept(a.id, t.volunteer), 'accept');
    ok(await act(a.id, 'start', t.volunteer), 'start');
    await visitLasted(a.id, 20);
    const leave = await act(a.id, 'leave', t.volunteer, { reason: 'Only one here' });
    assert.equal(leave.status, 409, `leaving alone should point to handover, got ${leave.status}`);
    const unwarned = await act(a.id, 'hand-over', t.volunteer, { reason: 'Unwell now', acknowledgeNoCredits: false });
    assert.equal(unwarned.status, 400, `a handover without the warning, got ${unwarned.status}`);
    const before = await earned(t.volunteer);
    const gone = ok(await act(a.id, 'hand-over', t.volunteer, { reason: 'Unwell now', acknowledgeNoCredits: true }), 'hand over');
    assert.equal(gone.status, 'REPLACED');
    assert.equal(ok(await call('GET', r.path, t.beneficiary), 'get').stage, 'AWAITING_REPLACEMENT');
    const cannotConfirm = await call('POST', `${r.path}/assignments/${a.id}/confirm`, t.beneficiary, {});
    assert.equal(cannotConfirm.status, 409, `confirming a handed-over visit, got ${cannotConfirm.status}`);

    const b = await offerOf(t.fixtureVolunteer, r.id);
    assert.ok(!(await mine(t.volunteer)).some((x) => x.serviceRequestId === r.id && x.status === 'OFFERED'), 'the first volunteer was asked again');
    ok(await accept(b.id, t.fixtureVolunteer), 'replacement accepts');
    const [link] = await db('SELECT replaced_by_assignment_id AS id FROM volunteer_assignments WHERE id = $1', [a.id]);
    assert.equal(link.id, b.id, 'the handover is not linked to the replacement');
    ok(await act(b.id, 'start', t.fixtureVolunteer), 'replacement starts');
    assert.equal(ok(await call('GET', `${r.path}/matching`, t.coordinator), 'snapshot').request.belowMinimumAt, null);
    await visitLasted(b.id, 30);
    const paidBefore = await earned(t.fixtureVolunteer);
    ok(await act(b.id, 'finish', t.fixtureVolunteer), 'replacement finishes');
    ok(await call('POST', `${r.path}/assignments/${b.id}/confirm`, t.beneficiary, {}), 'confirm');
    assert.equal(ok(await call('GET', r.path, t.beneficiary), 'get').status, 'COMPLETED');
    assert.equal(await earned(t.volunteer), before, 'the volunteer who handed over was paid');
    assert.equal(await earned(t.fixtureVolunteer), paidBefore + 1, 'the volunteer who finished was not paid');
  });

  await step('Handover: nobody takes it, a coordinator is told and can stop the search', async () => {
    const r = await teamRequest(1, 1, 'Journey handover unfilled');
    const a = await offerOf(t.volunteer, r.id);
    ok(await accept(a.id, t.volunteer), 'accept');
    ok(await act(a.id, 'start', t.volunteer), 'start');
    ok(await act(a.id, 'hand-over', t.volunteer, { reason: 'Unwell now', acknowledgeNoCredits: true }), 'hand over');
    const b = await offerOf(t.fixtureVolunteer, r.id);
    ok(await act(b.id, 'decline', t.fixtureVolunteer, { declineReason: 'Not free' }), 'decline');
    // Volunteers left by earlier runs hold offers too. Those offers run out rather than being declined.
    await db(`UPDATE volunteer_assignments SET offer_expires_at = now() - interval '1 second' WHERE service_request_id = $1 AND status = 'OFFERED'`, [r.id]);
    await waitFor('the coordinator to be told', async () => {
      const s = ok(await call('GET', `${r.path}/matching`, t.coordinator), 'snapshot');
      return s.request.replacementEscalatedAt;
    }, 70);
    const member = await call('POST', `${r.path}/stop-replacement`, t.beneficiary, { notes: 'Not allowed' });
    assert.equal(member.status, 403, `a member stopping the search, got ${member.status}`);
    ok(await call('POST', `${r.path}/stop-replacement`, t.coordinator, { notes: 'Spoke to the family' }), 'stop');
    assert.equal(ok(await call('GET', r.path, t.beneficiary), 'get').status, 'CANCELLED');
  });

  await step('Invitation: by exact number only; every refusal reads the same', async () => {
    const r = await teamRequest(1, 1, 'Journey invitation');
    const a = await offerOf(t.volunteer, r.id);
    ok(await accept(a.id, t.volunteer), 'accept');
    const full = await act(a.id, 'invite', t.volunteer, { memberNumberOrPhone: fixture.people.volunteer.phone });
    assert.equal(full.status, 409, `inviting to a full visit, got ${full.status}`);
    await db('UPDATE service_requests SET preferred_volunteers = 2 WHERE id = $1', [r.id]);
    const strangers = [
      await act(a.id, 'invite', t.volunteer, { memberNumberOrPhone: '+919999999999' }),
      await act(a.id, 'invite', t.volunteer, { memberNumberOrPhone: PHONES.beneficiary }),
      await act(a.id, 'invite', t.volunteer, { memberNumberOrPhone: fixture.people.coordinator.phone }),
    ];
    for (const refused of strangers) assert.equal(refused.status, 409);
    assert.equal(new Set(strangers.map((x) => x.data.message)).size, 1, 'refusals differ, which reveals who is a member');
    const sent = ok(await act(a.id, 'invite', t.volunteer, { memberNumberOrPhone: fixture.people.volunteer.phone }), 'invite');
    assert.ok(!JSON.stringify(sent).includes('fullName'), 'the response describes the member');
    const invited = await offerOf(t.fixtureVolunteer, r.id);
    assert.equal(invited.invitedByName, NAMES.volunteer);
    ok(await accept(invited.id, t.fixtureVolunteer), 'accept the invitation');
    for (const [id, token] of [[a.id, t.volunteer], [invited.id, t.fixtureVolunteer]]) {
      ok(await act(id, 'withdraw', token, { withdrawalReason: 'Journey finished with this one' }), 'withdraw');
    }
    ok(await call('POST', `${r.path}/cancel`, t.beneficiary, { reasonCode: 'NO_LONGER_NEEDED', notes: 'Journey finished' }), 'cancel');
  });

  await step('Safety on a team: each restarts or leaves for themselves', async () => {
    const r = await teamRequest(2, 2, 'Journey team safety');
    const a = await offerOf(t.volunteer, r.id);
    const b = await offerOf(t.fixtureVolunteer, r.id);
    ok(await accept(a.id, t.volunteer), 'first accepts');
    ok(await accept(b.id, t.fixtureVolunteer), 'second accepts');
    ok(await act(a.id, 'start', t.volunteer), 'first arrives');
    ok(await act(b.id, 'start', t.fixtureVolunteer), 'second arrives');
    const raised = ok(await call('POST', `${r.path}/safety-alerts`, t.beneficiary, { action: 'PAUSE' }), 'raise');
    const paused = await db(`SELECT count(*)::int AS n FROM volunteer_assignments WHERE service_request_id = $1 AND paused_at IS NOT NULL`, [r.id]);
    assert.equal(paused[0].n, 2, 'the alert did not pause everyone');
    ok(await call('POST', `/organizations/${ORG}/safety-alerts/${raised.id}/allow-restart`, t.coordinator, { notes: 'Spoke to all' }), 'allow');
    ok(await call('POST', `${r.path}/safety-restart`, t.volunteer, { restart: true }), 'first restarts');
    let open = ok(await call('GET', `/organizations/${ORG}/safety-alerts`, t.coordinator), 'alerts');
    assert.ok(open.some((x) => x.id === raised.id), 'the alert closed with someone still paused');
    ok(await call('POST', `${r.path}/safety-restart`, t.fixtureVolunteer, { restart: false }), 'second leaves');
    assert.equal(await statusOf(a.id), 'IN_PROGRESS', 'one volunteer leaving ended the other visit');
    assert.equal(await statusOf(b.id), 'COMPLETED');
    open = ok(await call('GET', `/organizations/${ORG}/safety-alerts`, t.coordinator), 'alerts');
    assert.ok(!open.some((x) => x.id === raised.id), 'the alert stayed open');
    ok(await act(a.id, 'finish', t.volunteer), 'first finishes');
    ok(await call('POST', `${r.path}/assignments/${a.id}/confirm`, t.beneficiary, {}), 'confirm');
    ok(await call('POST', `${r.path}/assignments/${b.id}/resolve`, t.coordinator, { decision: 'PAY', minutes: 1, notes: 'Time given before leaving' }), 'decide');
    assert.equal(ok(await call('GET', r.path, t.beneficiary), 'get').status, 'COMPLETED');
  });

  const COMPLAINTS = `/organizations/${ORG}/complaints`;
  const WORDS = `Journey complaint words ${stamp}`;

  await step('Complaint: a coordinator handles it, and a member sees only the outcome', async () => {
    t.admin = await staffSignIn(fixture.people.admin.phone);
    const r = await teamRequest(1, 1, 'Journey complaint visit');
    ok(await call('POST', `${r.path}/cancel`, t.beneficiary, { reasonCode: 'NO_LONGER_NEEDED', notes: 'Journey finished' }), 'cancel');

    const stranger = await call('POST', COMPLAINTS, t.volunteer, { subject: 'SERVICE_OR_MEMBER', description: WORDS, serviceRequestId: r.id });
    assert.equal(stranger.status, 404, `linking someone else's visit, got ${stranger.status}`);
    const made = ok(await call('POST', COMPLAINTS, t.beneficiary, { subject: 'SERVICE_OR_MEMBER', description: WORDS, serviceRequestId: r.id }), 'raise');
    assert.equal(made.level, undefined, 'the member was told who holds it');
    const one = `${COMPLAINTS}/${made.id}`;

    const summaries = ok(await call('GET', COMPLAINTS, t.coordinator), 'list');
    const row = summaries.find((x) => x.id === made.id);
    assert.ok(row, 'the coordinator cannot see it');
    assert.ok(!JSON.stringify(summaries).includes(WORDS), 'a list contains the words');
    const asked = await call('GET', COMPLAINTS, t.beneficiary);
    assert.equal(asked.status, 403, `a member listing complaints, got ${asked.status}`);
    const read = await call('GET', one, t.volunteer);
    assert.equal(read.status, 404, `another member reading it, got ${read.status}`);

    const detail = ok(await call('GET', one, t.coordinator), 'detail');
    assert.equal(detail.description, WORDS);
    assert.equal(detail.visit.id, r.id);
    assert.equal(detail.raisedByName, NAMES.beneficiary);
    ok(await call('POST', `${one}/take`, t.coordinator, {}), 'take');
    ok(await call('POST', `${one}/notes`, t.coordinator, { notes: 'Staff only: rang the family' }), 'note');
    ok(await call('POST', `${one}/decide`, t.coordinator, { outcome: 'UPHELD', notes: 'Staff only: reason', memberMessage: 'We have spoken to those involved.' }), 'decide');
    const again = await call('POST', `${one}/notes`, t.coordinator, { notes: 'Too late' });
    assert.equal(again.status, 409, `a note after closing, got ${again.status}`);

    const mine = ok(await call('GET', `${COMPLAINTS}/mine`, t.beneficiary), 'mine').find((x) => x.id === made.id);
    assert.equal(mine.status, 'CLOSED');
    assert.equal(mine.memberMessage, 'We have spoken to those involved.');
    assert.ok(!JSON.stringify(mine).includes('Staff only'), 'the member sees staff notes');
    return made.reference;
  });

  await step('Complaint about a coordinator: coordinators cannot reach it; it goes up with its history', async () => {
    const made = ok(await call('POST', COMPLAINTS, t.beneficiary, { subject: 'COORDINATOR', description: WORDS }), 'raise');
    const one = `${COMPLAINTS}/${made.id}`;
    const summaries = ok(await call('GET', COMPLAINTS, t.coordinator), 'list');
    assert.ok(!summaries.some((x) => x.id === made.id), 'a coordinator can see a complaint about coordinators');
    for (const [method, path, body] of [['GET', one], ['POST', `${one}/take`, {}], ['POST', `${one}/decide`, { outcome: 'NOT_UPHELD', notes: 'Burying it', memberMessage: 'Nothing to see' }]]) {
      const refused = await call(method, path, t.coordinator, body);
      assert.equal(refused.status, 404, `${method} ${path} as a coordinator, got ${refused.status}`);
    }
    const everywhere = ok(await call('GET', '/admin/complaints', t.admin), 'central list');
    assert.ok(everywhere.some((x) => x.id === made.id), 'the Super Admin cannot see it');
    const refused = await call('GET', '/admin/complaints', t.coordinator);
    assert.equal(refused.status, 403, `the central list as a coordinator, got ${refused.status}`);
    ok(await call('GET', one, t.admin), 'read a level below');

    ok(await call('POST', `${one}/pass-up`, t.admin, { notes: 'No administrator is free' }), 'pass up');
    const up = ok(await call('GET', one, t.admin), 'detail');
    assert.equal(up.level, 'SUPER_ADMIN');
    assert.deepEqual(up.events.map((e) => e.type), ['RAISED', 'PASSED_UP']);
    const top = await call('POST', `${one}/pass-up`, t.admin, { notes: 'Further still' });
    assert.equal(top.status, 409, `passing up from the top, got ${top.status}`);
    ok(await call('POST', `${one}/decide`, t.admin, { outcome: 'NOT_UPHELD', notes: 'Checked the records', memberMessage: 'We looked into this.' }), 'decide');

    const trail = await db(`SELECT event_type, payload::text AS payload FROM audit_events WHERE target_id = $1`, [made.id]);
    assert.ok(trail.some((x) => x.event_type === 'COMPLAINT_READ_CENTRALLY'), 'reading below their level left no trace');
    assert.ok(!JSON.stringify(trail).includes(WORDS), 'the audit trail contains the words');
    await assert.rejects(
      db(`UPDATE complaint_events SET notes = 'changed' WHERE complaint_id = $1`, [made.id]),
      /append-only/,
    );
    const pushes = await db(`SELECT title, body, data::text AS data FROM notification_outbox WHERE type LIKE 'COMPLAINT%' AND created_at > now() - interval '5 minutes'`);
    assert.ok(pushes.length > 0, 'nobody was told');
    assert.ok(!JSON.stringify(pushes).includes(WORDS), 'a push contains the words');
  });

  // ─── Suspensions, bans, reinstatement and appeals ─────────────────────────
  const CASES = `/organizations/${ORG}/restriction-cases`;
  const APPEALS = `/organizations/${ORG}/appeals`;
  const REASON = `Journey restriction reason ${stamp}`;
  const TOLD = `Journey restriction message ${stamp}`;
  const GROUNDS = `Journey appeal grounds ${stamp}`;
  // A phone can only ask for a code once a minute, so age its last one rather than wait.
  const signInAgain = async (phone, body = {}) => {
    await db(`UPDATE otp_challenges SET created_at = now() - interval '2 minutes' WHERE created_at > now() - interval '2 minutes'`);
    const challenge = ok(await call('POST', '/auth/otp/request', null, { phone }), 'otp');
    return ok(await call('POST', '/auth/otp/verify', null, {
      phone, code: challenge.devOtp ?? '123456', ...body,
    }), 'verify');
  };
  const staffInCommunity = async (phone, role) => {
    const { accessToken: token } = await signInAgain(phone);
    const [user] = await db(
      `UPDATE users SET email = $2 WHERE phone_e164 = $1 RETURNING id`,
      [phone, `journey${phone.slice(-10)}@example.test`],
    );
    const [member] = await db(
      `INSERT INTO organization_memberships (organization_id, user_id, status, membership_number, approved_at)
       VALUES ($1, $2, 'APPROVED', $3, now())
       ON CONFLICT (organization_id, user_id) DO UPDATE SET status = 'APPROVED' RETURNING id`,
      [ORG, user.id, `JRN-${phone.slice(-6)}`],
    );
    await db(
      `INSERT INTO membership_role_grants (membership_id, role, status, granted_by)
       SELECT $1::uuid, $2::varchar, 'ACTIVE', $3::uuid WHERE NOT EXISTS (
         SELECT 1 FROM membership_role_grants WHERE membership_id = $1::uuid AND role = $2::varchar AND status = 'ACTIVE')`,
      [member.id, role, user.id],
    );
    ok(await call('POST', '/auth/staff-code/request', token), 'staff code request');
    ok(await call('POST', '/auth/staff-code/verify', token, { code: '123456' }), 'staff code verify');
    return { token, userId: user.id, membershipId: member.id };
  };

  await step('Suspension: a coordinator recommends, a real Municipality Admin decides, and access ends', async () => {
    t.municipalityAdmin = (await staffInCommunity('+919000000107', 'MUNICIPALITY_ADMIN')).token;
    const visit = ok(await request(t.beneficiary, 180, 'Journey restriction visit'), 'request');
    t.suspensionVisit = visit.id;

    const asked = await call('POST', CASES, t.volunteer, {
      member: PHONES.beneficiary, restrictionType: 'TEMPORARY_SUSPENSION', reason: REASON,
    });
    assert.equal(asked.status, 403, `a member recommending, got ${asked.status}`);
    const made = ok(await call('POST', CASES, t.coordinator, {
      member: PHONES.beneficiary, restrictionType: 'TEMPORARY_SUSPENSION', reason: REASON,
    }), 'recommend');
    t.suspension = made.id;
    assert.equal(made.status, 'RECOMMENDED');
    ok(await call('GET', `/organizations/${ORG}/requests/${visit.id}`, t.beneficiary), 'nothing happens yet');

    const decision = { scope: 'PLATFORM', notes: 'Looked into it', memberMessage: TOLD };
    const byCoordinator = await call('POST', `${CASES}/${made.id}/approve`, t.coordinator, decision);
    assert.equal(byCoordinator.status, 403, `a coordinator approving, got ${byCoordinator.status}`);
    ok(await call('POST', `${CASES}/${made.id}/approve`, t.municipalityAdmin, decision), 'approve');

    const [person] = await db('SELECT status FROM users WHERE phone_e164 = $1', [PHONES.beneficiary]);
    assert.equal(person.status, 'SUSPENDED');
    const [cancelled] = await db(
      `SELECT r.status, c.canceller_role, c.reason_code FROM service_requests r
       JOIN request_cancellations c ON c.service_request_id = r.id WHERE r.id = $1`,
      [visit.id],
    );
    assert.equal(cancelled.status, 'CANCELLED', 'their visit was left standing');
    assert.equal(cancelled.reason_code, 'ACCOUNT_UNAVAILABLE');
    const refused = await call('GET', `/organizations/${ORG}/requests/${visit.id}`, t.beneficiary);
    assert.equal(refused.status, 403, `still reaching the community, got ${refused.status}`);
    return made.reference;
  });

  await step('A suspended person signs in to a session that can only read and appeal', async () => {
    const session = await signInAgain(PHONES.beneficiary, { organizationCode: ORG_CODE });
    assert.equal(session.accountRestricted, true);
    assert.deepEqual(session.roles, []);
    t.limited = session;

    const me = ok(await call('GET', '/auth/me', session.accessToken), 'me');
    assert.equal(me.status, 'SUSPENDED');
    ok(await call('GET', '/v1/organizations', session.accessToken), 'community list');
    for (const [method, path] of [
      ['GET', `/organizations/${ORG}/complaints/mine`],
      ['GET', `/organizations/${ORG}/requests`],
      ['POST', `/organizations/${ORG}/complaints`],
      ['POST', '/auth/staff-code/request'],
    ]) {
      const blocked = await call(method, path, session.accessToken, method === 'POST' ? {} : undefined);
      assert.equal(blocked.status, 403, `${method} ${path} gave ${blocked.status}`);
    }

    const view = ok(await call('GET', '/me/restriction', session.accessToken), 'my restriction');
    assert.equal(view.restricted, true);
    const [item] = view.items;
    assert.equal(item.memberMessage, TOLD);
    assert.equal(item.canAppeal, true);
    assert.ok(!JSON.stringify(view).includes(REASON), 'the person can read the staff reason');
  });

  await step('An appeal goes to a Super Admin, and overturning it restores access at once', async () => {
    const one = `/me/restriction/${t.suspension}/appeal`;
    const short = await call('POST', one, t.limited.accessToken, { grounds: 'short' });
    assert.equal(short.status, 400);
    const stranger = await call('POST', one, t.volunteer, { grounds: GROUNDS });
    assert.equal(stranger.status, 404, `someone else appealing, got ${stranger.status}`);
    const filed = ok(await call('POST', one, t.limited.accessToken, { grounds: GROUNDS }), 'appeal');
    const again = await call('POST', one, t.limited.accessToken, { grounds: GROUNDS });
    assert.equal(again.status, 409, `a second appeal, got ${again.status}`);

    const local = await call('GET', `${APPEALS}/${filed.id}`, t.municipalityAdmin);
    assert.equal(local.status, 404, `a local administrator reading it, got ${local.status}`);
    const seen = ok(await call('GET', `/admin/appeals/${filed.id}`, t.admin), 'central detail');
    assert.equal(seen.grounds, GROUNDS);
    assert.equal(seen.restriction.reason, REASON);
    ok(await call('POST', `/admin/appeals/${filed.id}/decide`, t.admin, {
      outcome: 'OVERTURNED', notes: 'It was wrong', memberMessage: 'We got this wrong. You are back.',
    }), 'decide');

    const [person] = await db('SELECT status FROM users WHERE phone_e164 = $1', [PHONES.beneficiary]);
    assert.equal(person.status, 'ACTIVE');
    const [row] = await db(
      `SELECT g.status FROM restriction_cases c JOIN global_account_restrictions g ON g.id = c.restriction_id WHERE c.id = $1`,
      [t.suspension],
    );
    assert.equal(row.status, 'OVERTURNED_ON_APPEAL');

    // The same sign-in gets a full token on its next refresh, with no new code.
    const renewed = ok(await call('POST', '/auth/refresh', null, { refreshToken: t.limited.refreshToken }), 'refresh');
    ok(await call('GET', `/organizations/${ORG}/complaints/mine`, renewed.accessToken), 'back in');
    t.beneficiary = renewed.accessToken;

    const trail = await db(
      `SELECT payload::text AS payload FROM audit_events
       WHERE target_id = $1::uuid OR target_id = $2::uuid`,
      [t.suspension, filed.id],
    );
    assert.ok(trail.length > 0, 'nothing on the audit trail');
    const words = JSON.stringify(trail);
    for (const secret of [REASON, TOLD, GROUNDS]) {
      assert.ok(!words.includes(secret), 'the audit trail holds the words');
    }
    const pushes = await db(
      `SELECT title, body FROM notification_outbox
       WHERE (type LIKE 'RESTRICTION%' OR type LIKE 'APPEAL%') AND created_at > now() - interval '5 minutes'`,
    );
    assert.ok(pushes.length > 0, 'nobody was told');
    const pushed = JSON.stringify(pushes);
    for (const secret of [REASON, TOLD, GROUNDS]) {
      assert.ok(!pushed.includes(secret), 'a push holds the words');
    }
  });

  await step('A community suspension leaves the account and wallet alone, and returns only on approval', async () => {
    const made = ok(await call('POST', CASES, t.coordinator, {
      member: PHONES.volunteer, restrictionType: 'TEMPORARY_SUSPENSION', reason: REASON,
    }), 'recommend');
    const reviewOn = new Date(Date.now() - 1000).toISOString();
    const past = await call('POST', `${CASES}/${made.id}/approve`, t.municipalityAdmin, {
      scope: 'COMMUNITY', notes: 'Looked into it', memberMessage: TOLD, reviewOn,
    });
    assert.equal(past.status, 400, `a review date in the past, got ${past.status}`);
    ok(await call('POST', `${CASES}/${made.id}/approve`, t.municipalityAdmin, {
      scope: 'COMMUNITY', notes: 'Looked into it', memberMessage: TOLD,
      reviewOn: inMinutes(60 * 24),
    }), 'approve');
    const [row] = await db(
      `SELECT u.status AS account, m.status AS membership FROM users u
       JOIN organization_memberships m ON m.user_id = u.id AND m.organization_id = $2
       WHERE u.phone_e164 = $1`,
      [PHONES.volunteer, ORG],
    );
    assert.deepEqual([row.account, row.membership], ['ACTIVE', 'SUSPENDED']);
    const refused = await call('GET', `/organizations/${ORG}/complaints/mine`, t.volunteer);
    assert.equal(refused.status, 403);

    const view = ok(await call('GET', '/me/restriction', t.volunteer), 'my restriction');
    assert.equal(view.restricted, false);
    assert.equal(view.items[0].scope, 'COMMUNITY');

    // A date passing changes nothing.
    await db(`UPDATE restriction_cases SET review_on = now() - interval '1 minute' WHERE id = $1`, [made.id]);
    const one = `${CASES}/${made.id}`;
    const early = await call('POST', `${one}/reinstate`, t.municipalityAdmin, { notes: 'Back now' });
    assert.equal(early.status, 409, `reinstating with no recommendation, got ${early.status}`);
    ok(await call('POST', `${one}/recommend-reinstatement`, t.coordinator, { notes: 'They have put it right' }), 'recommend back');
    const byCoordinator = await call('POST', `${one}/reinstate`, t.coordinator, { notes: 'Back now' });
    assert.equal(byCoordinator.status, 403);
    ok(await call('POST', `${one}/reinstate`, t.municipalityAdmin, { notes: 'Back now' }), 'reinstate');
    ok(await call('GET', `/organizations/${ORG}/complaints/mine`, t.volunteer), 'back in');
  });

  await step('Credits earned while suspended come back with access', async () => {
    const [volunteer] = await db('SELECT id FROM users WHERE phone_e164 = $1', [PHONES.volunteer]);
    const [before] = await db('SELECT id, balance_credits, frozen_credits FROM universal_time_wallets WHERE user_id = $1', [volunteer.id]);
    const made = ok(await call('POST', CASES, t.coordinator, {
      member: PHONES.volunteer, restrictionType: 'TEMPORARY_SUSPENSION', reason: REASON,
    }), 'recommend');
    ok(await call('POST', `${CASES}/${made.id}/approve`, t.municipalityAdmin, {
      scope: 'PLATFORM', notes: 'Looked into it', memberMessage: TOLD,
    }), 'approve');

    // A visit under way finished while they were suspended, so its credits were held.
    const [assignment] = await db(
      `SELECT a.id, a.service_request_id FROM volunteer_assignments a
       JOIN organization_memberships m ON m.id = a.volunteer_membership_id
       WHERE m.user_id = $1 AND NOT EXISTS (
         SELECT 1 FROM time_credit_ledger l WHERE l.volunteer_assignment_id = a.id AND l.tx_type = 'SERVICE_EARNED')
       LIMIT 1`,
      [volunteer.id],
    );
    assert.ok(assignment, 'no assignment to attach held credits to');
    await db(`UPDATE universal_time_wallets SET frozen_credits = frozen_credits + 1.5 WHERE id = $1`, [before.id]);
    await db(
      `INSERT INTO time_credit_ledger (wallet_id, amount, balance_after, held, frozen_delta, tx_type,
         originating_org_id, service_request_id, volunteer_assignment_id, minutes)
       VALUES ($1, 1.5, $2, true, 1.5, 'SERVICE_EARNED', $3, $4, $5, 90)`,
      [before.id, before.balance_credits, ORG, assignment.service_request_id, assignment.id],
    );

    const one = `${CASES}/${made.id}`;
    ok(await call('POST', `${one}/recommend-reinstatement`, t.coordinator, { notes: 'They have put it right' }), 'recommend back');
    ok(await call('POST', `${one}/reinstate`, t.municipalityAdmin, { notes: 'Back now' }), 'reinstate');
    const [after] = await db('SELECT balance_credits, frozen_credits FROM universal_time_wallets WHERE id = $1', [before.id]);
    assert.equal(Number(after.balance_credits), Number(before.balance_credits) + 1.5);
    assert.equal(Number(after.frozen_credits), Number(before.frozen_credits));
  });

  await step('A ban: every community is locked, and a failed appeal changes nothing (AT-09)', async () => {
    const banned = `+9190001${stamp}9`;
    await db(`INSERT INTO users (phone_e164, status) VALUES ($1, 'ACTIVE')`, [banned]);
    const byCoordinator = await call('POST', '/admin/restrictions', t.coordinator, {
      member: banned, restrictionType: 'PERMANENT_BAN', reasonCode: 'JOURNEY',
    });
    assert.equal(byCoordinator.status, 403);
    ok(await call('POST', '/admin/restrictions', t.admin, {
      member: banned, restrictionType: 'PERMANENT_BAN', reasonCode: 'JOURNEY',
      notes: REASON, memberMessage: TOLD,
    }), 'ban');

    const session = await signInAgain(banned);
    assert.equal(session.accountRestricted, true);
    const view = ok(await call('GET', '/me/restriction', session.accessToken), 'my restriction');
    assert.equal(view.items[0].memberMessage, TOLD);

    const filed = ok(await call('POST', `/me/restriction/${view.items[0].id}/appeal`, session.accessToken, { grounds: GROUNDS }), 'appeal');
    const sameAdmin = await call('POST', `/admin/appeals/${filed.id}/decide`, t.admin, {
      outcome: 'STANDS', notes: 'It stands', memberMessage: 'It stands.',
    });
    assert.equal(sameAdmin.status, 403, `whoever decided hearing it, got ${sameAdmin.status}`);

    const second = await staffInCommunity(`+9190002${stamp}9`, 'SUPER_ADMIN');
    try {
      ok(await call('POST', `/admin/appeals/${filed.id}/decide`, second.token, {
        outcome: 'STANDS', notes: 'It stands', memberMessage: 'We looked again and it stands.',
      }), 'decide');
    } finally {
      await db(
        `UPDATE membership_role_grants SET status = 'REVOKED', revoked_at = now(), revoked_by = $2
         WHERE membership_id = $1 AND role = 'SUPER_ADMIN'`,
        [second.membershipId, second.userId],
      );
    }
    const [person] = await db('SELECT status FROM users WHERE phone_e164 = $1', [banned]);
    assert.equal(person.status, 'PERMANENTLY_BANNED');
    const after = ok(await call('GET', '/me/restriction', session.accessToken), 'my restriction');
    assert.equal(after.items[0].appeal.outcome, 'STANDS');
    assert.equal(after.items[0].canAppeal, false);
  });

  await step('A member challenges a complaint outcome, and it leaves the hands of whoever decided', async () => {
    const made = ok(await call('POST', COMPLAINTS, t.beneficiary, {
      subject: 'SERVICE_OR_MEMBER', description: WORDS,
    }), 'raise');
    const one = `${COMPLAINTS}/${made.id}`;
    ok(await call('POST', `${one}/decide`, t.coordinator, {
      outcome: 'NOT_UPHELD', notes: 'Nothing found', memberMessage: 'We found nothing wrong.',
    }), 'decide');
    const mine = () => call('GET', `${COMPLAINTS}/mine`, t.beneficiary);
    const closed = ok(await mine(), 'mine').find((x) => x.id === made.id);
    assert.equal(closed.canAppeal, true);

    const stranger = await call('POST', `${one}/appeal`, t.volunteer, { grounds: GROUNDS });
    assert.equal(stranger.status, 404);
    const filed = ok(await call('POST', `${one}/appeal`, t.beneficiary, { grounds: GROUNDS }), 'appeal');
    const gone = await call('GET', one, t.coordinator);
    assert.equal(gone.status, 404, `the deciding coordinator can still read it, got ${gone.status}`);
    const byCoordinator = await call('GET', `${APPEALS}/${filed.id}`, t.coordinator);
    assert.equal(byCoordinator.status, 404);

    const seen = ok(await call('GET', `${APPEALS}/${filed.id}`, t.municipalityAdmin), 'detail');
    assert.equal(seen.complaint.description, WORDS);
    ok(await call('POST', `${APPEALS}/${filed.id}/decide`, t.municipalityAdmin, {
      outcome: 'OVERTURNED', notes: 'It was wrong', memberMessage: 'We looked again and you were right.',
    }), 'decide appeal');
    const after = ok(await mine(), 'mine').find((x) => x.id === made.id);
    assert.equal(after.outcome, 'UPHELD');
    assert.equal(after.memberMessage, 'We looked again and you were right.');
    assert.equal(after.appealOutcome, 'OVERTURNED');
    assert.equal(after.canAppeal, true, 'one more level remains above an administrator');
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
