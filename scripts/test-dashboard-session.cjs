// Requires scripts/start-interface-qa.ps1. Only fictional local QA identities are used.
const assert = require('node:assert/strict');
const fixture = require('../node_modules/.cache/interface-qa/fixture.json');
const state = require('../node_modules/.cache/interface-qa/state.json');
if (!/^ktb_interface_qa_[a-z0-9_]+$/.test(state.database))
  throw Error('Disposable interface QA database required');
const base = 'http://127.0.0.1:3000';
const checks = [];
function check(name, value) {
  assert.ok(value, name);
  checks.push(name);
}
async function call(path, cookie = '', method = 'GET', body, origin = base, headers = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { origin, 'content-type': 'application/json', cookie, ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  return {
    response,
    data,
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; '),
  };
}
async function login(phone) {
  const challenge = await call('/api/session', '', 'POST', { action: 'request-code', phone });
  assert.equal(challenge.response.status, 200);
  const signed = await call('/api/session', '', 'POST', {
    action: 'verify',
    phone,
    code: challenge.data.devOtp,
  });
  assert.equal(signed.response.status, 200);
  return signed;
}
(async () => {
  check(
    'anonymous dashboard requests require sign-in',
    (await call('/api/backend/admin/overview')).response.status === 401,
  );
  const signed = await login(fixture.people.admin.phone);
  check(
    'sign-in response contains no browser-readable tokens',
    !signed.data.accessToken && !signed.data.refreshToken,
  );
  check(
    'session cookies are HTTP-only and SameSite Strict',
    signed.response.headers
      .getSetCookie()
      .every((value) => /HttpOnly/i.test(value) && /SameSite=Strict/i.test(value)),
  );
  check(
    'session survives profile reload',
    (await call('/api/session', signed.cookie)).response.status === 200,
  );
  const overview = await call('/api/backend/admin/overview', signed.cookie);
  check(
    'overview uses real database users',
    overview.response.status === 200 && overview.data.totalUsers === 6,
  );
  check(
    'forged preview headers do not authenticate',
    (
      await call('/api/backend/admin/overview', '', 'GET', undefined, base, {
        'x-user-id': fixture.people.admin.user,
        'x-is-super-admin': 'true',
      })
    ).response.status === 401,
  );
  check(
    'cross-origin sign-in writes are rejected',
    (
      await call(
        '/api/session',
        '',
        'POST',
        { action: 'request-code', phone: fixture.people.admin.phone },
        'https://other.test',
      )
    ).response.status === 403,
  );
  const refreshed = await call(
    '/api/session',
    signed.cookie.split('; ').find((value) => value.startsWith('ktb_admin_refresh=')),
  );
  check(
    'refresh-only session obtains new access',
    refreshed.response.status === 200 &&
      refreshed.response.headers
        .getSetCookie()
        .some((value) => value.startsWith('ktb_admin_access=')),
  );
  const coordinator = await login(fixture.people.coordinator.phone);
  check(
    'coordinator is denied central administration',
    (await call('/api/backend/admin/overview', coordinator.cookie)).response.status === 403,
  );
  check(
    'coordinator can list own tenant memberships',
    (await call(`/api/backend/organizations/${fixture.org}/memberships`, coordinator.cookie))
      .response.status === 200,
  );
  check(
    'coordinator cannot read another tenant',
    (await call(`/api/backend/organizations/${fixture.orgB}/memberships`, coordinator.cookie))
      .response.status === 403,
  );
  check(
    'document lookup rejects a mismatched tenant',
    (
      await call(
        `/api/backend/organizations/${fixture.orgB}/memberships/${fixture.people.applicant.membership}/documents`,
        signed.cookie,
      )
    ).response.status === 404,
  );
  const ended = await call('/api/session', coordinator.cookie, 'DELETE');
  check(
    'logout clears both browser cookies',
    ended.response.status === 200 &&
      ended.response.headers.getSetCookie().length === 2 &&
      ended.response.headers.getSetCookie().every((value) => /Max-Age=0/i.test(value)),
  );
  check(
    'revoked refresh cannot restore a logged-out session',
    (
      await call(
        '/api/session',
        coordinator.cookie.split('; ').find((value) => value.startsWith('ktb_admin_refresh=')),
      )
    ).response.status === 401,
  );
  await call('/api/session', signed.cookie, 'DELETE');
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
