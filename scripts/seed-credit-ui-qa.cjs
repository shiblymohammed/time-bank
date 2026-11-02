// Fictional, isolated fixtures for the Time credits browser walkthrough.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../node_modules/.cache/credit-ui-qa');
const state = require(path.join(root, 'state.json'));
const fixture = require(path.join(root, 'fixture.json'));
if (!/^ktb_interface_qa_[a-z0-9_]+$/.test(state.database) || state.apiPort !== 3101)
  throw Error('Dedicated credit UI QA session required');
const origin = `http://127.0.0.1:${state.apiPort}`;
async function call(resource, token, body) {
  const response = await fetch(origin + '/api' + resource, {
    method: body ? 'POST' : 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  assert.ok(response.ok, `${resource}: ${response.status} ${JSON.stringify(result)}`);
  return result;
}
async function login(person) {
  const challenge = await call('/auth/otp/request', null, { phone: person.phone });
  return (await call('/auth/otp/verify', null, { phone: person.phone, code: challenge.devOtp }))
    .accessToken;
}
(async () => {
  const coord = await login(fixture.people.coordinator);
  const volunteer = await login(fixture.people.volunteer);
  const admin = await login(fixture.people.admin);
  const base = `/organizations/${fixture.org}`;
  const requests = [];
  for (let i = 0; i < 3; i++) {
    const request = await call(`${base}/requests`, coord, {
      serviceCatalogId: fixture.catalogue,
      beneficiaryMembershipId: fixture.people.beneficiary.membership,
      creationChannel: 'COORDINATOR_ON_BEHALF',
      urgency: 'IMMEDIATE',
      scheduledStartTime: new Date(Date.now() + 15 * 60000).toISOString(),
      expectedDurationMinutes: 60,
      locationAddressText: 'Fictional credit UI QA community centre',
      locationWardNumber: '1',
      locationPostalCode: '676503',
      beneficiaryNotes: 'Fictional M4 dashboard verification',
      idempotencyKey: randomUUID(),
    });
    const assignment = await call(`${base}/requests/${request.id}/dispatch`, coord, {
      volunteerMembershipId: fixture.people.volunteer.membership,
    });
    await call(`${base}/assignments/${assignment.id}/start`, volunteer, {});
    await call(`${base}/assignments/${assignment.id}/finish`, volunteer, {
      minutes: 60,
      notes: 'Fictional QA service completion',
    });
    if (i === 2)
      await call(`${base}/wallets/${fixture.people.volunteer.user}/status`, admin, {
        status: 'FROZEN',
        reason: 'Fictional QA held earnings',
        idempotencyKey: randomUUID(),
      });
    await call(`${base}/requests/${request.id}/assignments/${assignment.id}/confirm`, coord, {
      minutes: 60,
    });
    requests.push(request.id);
  }
  await call(`${base}/wallets/${fixture.people.volunteer.user}/status`, admin, {
    status: 'ACTIVE',
    reason: 'Fictional QA reinstatement',
    idempotencyKey: randomUUID(),
  });
  const pool = await call(`${base}/donation-pools`, admin, {
    name: 'QA Credit UI Pool',
    description: 'Fictional credits for the dashboard walkthrough',
  });
  await call(`${base}/donations`, volunteer, {
    amount: 0.5,
    poolId: pool.id,
    idempotencyKey: randomUUID(),
  });
  fs.writeFileSync(
    path.join(root, 'credit-fixture.json'),
    JSON.stringify({ requests, pool: pool.id }, null, 2),
  );
  console.log(
    'Three independently confirmed services, a funded local pool, and frozen earnings are ready for browser QA.',
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
