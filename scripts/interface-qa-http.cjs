const assert = require('node:assert/strict');
const fs = require('node:fs');
const fixture = require('../node_modules/.cache/interface-qa/fixture.json');
const origin = 'http://127.0.0.1:3001';
async function call(path, token, method = 'GET', data) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
async function login(phone) {
  const challenge = await call('/api/auth/otp/request', null, 'POST', { phone });
  assert.equal(challenge.status, 200);
  const session = await call('/api/auth/otp/verify', null, 'POST', {
    phone,
    code: challenge.body.devOtp,
  });
  assert.equal(session.status, 200);
  return session.body.accessToken;
}
(async () => {
  const admin = await login(fixture.people.admin.phone);
  const volunteer = await login(fixture.people.volunteer.phone);
  const care = await login(fixture.people.caregiver.phone);
  const overview = await call('/api/admin/overview', admin);
  assert.equal(overview.status, 200);
  assert.equal(overview.body.totalUsers, 6);
  assert.equal((await call('/api/admin/overview', volunteer)).status, 403);
  assert.equal((await call('/api/admin/overview')).status, 401);
  assert.equal((await call('/api/v1/admin/overview', admin)).status, 404);
  const recipients = await call(`/api/organizations/${fixture.org}/caregivers/mine`, care);
  assert.equal(recipients.status, 200);
  assert.equal(recipients.body.length, 1);
  assert.equal(recipients.body[0].beneficiaryMembership.membershipNumber, 'QA-BENEFICIARY');
  assert.equal(recipients.body[0].beneficiaryMembership.user, undefined);
  const foreign = await call(`/api/organizations/${fixture.orgB}/assignments/mine`, volunteer);
  assert.equal(foreign.status, 403);
  const result = {
    checks: 7,
    overview: overview.body,
    adminAccess: '200 admin, 403 volunteer, 401 anonymous',
    dashboardRoute: '/api/v1/admin/overview returns 404',
    caregiverRecipient: 'membership number only',
    foreignTenant: '403',
  };
  fs.writeFileSync(
    require('node:path').resolve(
      __dirname,
      '../node_modules/.cache/interface-qa/http-results.json',
    ),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
