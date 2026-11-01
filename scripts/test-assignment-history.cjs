// Creates only fictional data in the disposable interface QA database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const state = require('../node_modules/.cache/interface-qa/state.json');
const fixture = require('../node_modules/.cache/interface-qa/fixture.json');
if (!/^ktb_interface_qa_[a-z0-9_]+$/.test(state.database))
  throw Error('Disposable QA database required');
const base = 'http://127.0.0.1:3001/api';
async function call(path, token, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${data.message || ''}`);
  return data;
}
async function login(phone) {
  const challenge = await call('/auth/otp/request', null, 'POST', { phone });
  return (await call('/auth/otp/verify', null, 'POST', { phone, code: challenge.devOtp }))
    .accessToken;
}
(async () => {
  const coordinator = await login(fixture.people.coordinator.phone);
  const volunteer = await login(fixture.people.volunteer.phone);
  const prefix = `/organizations/${fixture.org}`;
  const times = [
    '2031-01-01T04:30:00.000Z',
    '2031-01-02T04:30:00.000Z',
    '2031-01-03T04:30:00.000Z',
  ];
  const request = await call(`${prefix}/requests`, coordinator, 'POST', {
    serviceCatalogId: fixture.catalogue,
    beneficiaryMembershipId: fixture.people.beneficiary.membership,
    creationChannel: 'COORDINATOR_ON_BEHALF',
    urgency: 'SCHEDULED',
    scheduledStartTime: times[0],
    expectedDurationMinutes: 60,
    locationAddressText: 'Fictional assignment history QA hall',
    locationWardNumber: '1',
    locationPostalCode: '676503',
    beneficiaryNotes: 'QA_HISTORY_DATES',
    idempotencyKey: 'QA_HISTORY_DATES',
  });
  let assignments = (await call(`${prefix}/assignments/mine`, volunteer)).filter(
    (a) => a.serviceRequestId === request.id,
  );
  assert.equal(assignments.length, 1);
  await call(`${prefix}/assignments/${assignments[0].id}/accept`, volunteer, 'POST', {});
  for (const time of times.slice(1))
    await call(`${prefix}/requests/${request.id}/reschedule`, coordinator, 'POST', {
      newStartTime: time,
      reason: 'Fictional historical schedule regression',
    });
  assignments = (await call(`${prefix}/assignments/mine`, volunteer)).filter(
    (a) => a.serviceRequestId === request.id,
  );
  assert.deepEqual(assignments.map((a) => a.scheduledStartTime).sort(), times);
  assert.equal(new Set(assignments.map((a) => a.id)).size, 3);
  assert.equal(assignments.filter((a) => a.status === 'CANCELLED').length, 2);
  assert.equal(assignments.filter((a) => a.status === 'OFFERED').length, 1);
  assert.ok(assignments.every((a) => a.serviceRequest.scheduledStartTime === times[2]));
  const staff = await call(`${prefix}/requests/${request.id}/matching`, coordinator);
  assert.deepEqual(staff.assignments.map((a) => a.scheduledStartTime).sort(), times);
  assert.equal(staff.reschedules.length, 2);
  const report = {
    requestId: request.id,
    requestNumber: request.requestNumber,
    checks: 8,
    assignmentSchedules: assignments.map((a) => ({
      status: a.status,
      scheduledStartTime: a.scheduledStartTime,
    })),
  };
  fs.writeFileSync(
    'node_modules/.cache/interface-qa/assignment-history-verification.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
