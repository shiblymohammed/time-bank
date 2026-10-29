const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/lib/api.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let client;
let calls;
let handler;
beforeEach(() => {
  calls = [];
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    Headers,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return handler(url, options);
    },
  });
  client = exports;
});
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
test('uses proxy paths, bearer auth and organization context', async () => {
  client.setApiSession({ accessToken: 'token', refreshToken: 'refresh' });
  handler = () => response({ memberships: [], total: 0 });
  await client.allMemberships('org-123');
  assert.equal(calls[0].url, '/backend/api/organizations/org-123/memberships?limit=100&offset=0');
  assert.equal(calls[0].options.headers.get('Authorization'), 'Bearer token');
  assert.equal(calls[0].options.headers.get('x-organization-id'), 'org-123');
});
test('fetches every membership page', async () => {
  handler = (url) =>
    response({
      memberships: url.includes('offset=0') ? Array(100).fill({ id: 'first' }) : [{ id: 'last' }],
      total: 101,
    });
  const records = await client.allMemberships('org');
  assert.equal(records.length, 101);
  assert.match(calls[1].url, /offset=100/);
});
test('refreshes once for concurrent expired requests and retries with new token', async () => {
  client.setApiSession({ accessToken: 'old', refreshToken: 'refresh' });
  handler = (url, options) =>
    url.endsWith('/auth/refresh')
      ? response({ accessToken: 'new' })
      : options.headers.get('Authorization') === 'Bearer old'
        ? response({ message: 'Expired' }, 401)
        : response({ ok: true });
  await Promise.all([client.api('/api/admin/overview'), client.api('/api/admin/restrictions')]);
  assert.equal(calls.filter((c) => c.url.endsWith('/auth/refresh')).length, 1);
  assert.equal(
    calls.filter((c) => c.options.headers.get('Authorization') === 'Bearer new').length,
    2,
  );
});
test('surfaces DTO validation messages without reporting success', async () => {
  handler = () => response({ message: ['reason required', 'invalid user'] }, 400);
  await assert.rejects(client.api('/api/admin/restrictions', { method: 'POST', body: '{}' }), {
    message: 'reason required; invalid user',
    status: 400,
  });
});
test('does not retry failed refresh or forbidden responses', async () => {
  client.setApiSession({ accessToken: 'old', refreshToken: 'invalid' });
  handler = () => response({ message: 'Unauthorized' }, 401);
  await assert.rejects(client.api('/api/admin/overview'), { status: 401 });
  assert.equal(calls.length, 2);
  calls = [];
  handler = () => response({ message: 'Forbidden' }, 403);
  await assert.rejects(client.api('/api/admin/overview'), { status: 403 });
  assert.equal(calls.length, 1);
});

test('refreshes an expired profile request', async () => {
  client.setApiSession({ accessToken: 'old', refreshToken: 'refresh' });
  handler = (url, options) =>
    url.endsWith('/refresh')
      ? response({ accessToken: 'new' })
      : options.headers.get('Authorization') === 'Bearer old'
        ? response({}, 401)
        : response({ id: 'user' });
  assert.equal((await client.api('/api/auth/me')).id, 'user');
  assert.equal(calls.length, 3);
});
test('does not retry a write after the user signs out during refresh', async () => {
  let resolveRefresh;
  let started;
  const refreshStarted = new Promise((resolve) => {
    started = resolve;
  });
  client.setApiSession({ accessToken: 'old', refreshToken: 'refresh' });
  handler = (url) =>
    url.endsWith('/refresh')
      ? (started(),
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }))
      : response({}, 401);
  const pending = assert.rejects(
    client.api('/api/organizations/org/requests', { method: 'POST', body: '{}' }),
    { status: 401 },
  );
  await refreshStarted;
  client.setApiSession(null);
  resolveRefresh(response({ accessToken: 'new' }));
  await pending;
  assert.equal(calls.length, 2);
});

test('rejects an invalid successful response and malformed refresh token response', async () => {
  handler = () => new Response('<html>proxy error</html>', { status: 200 });
  await assert.rejects(client.api('/api/admin/overview'), { status: 502 });
  calls = [];
  client.setApiSession({ accessToken: 'old', refreshToken: 'refresh' });
  handler = (url) => (url.endsWith('/refresh') ? response({}) : response({}, 401));
  await assert.rejects(client.api('/api/admin/overview'), { status: 401 });
  assert.equal(calls.length, 2);
});

test('a new sign-in does not inherit a pending refresh from the previous session', async () => {
  let resolveOld, started;
  const oldStarted = new Promise((resolve) => {
    started = resolve;
  });
  client.setApiSession({ accessToken: 'old', refreshToken: 'old-refresh' });
  handler = (url, options) => {
    if (url.endsWith('/refresh')) {
      if (JSON.parse(options.body).refreshToken === 'old-refresh') {
        started();
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      }
      return response({ accessToken: 'new-refreshed' });
    }
    return options.headers.get('Authorization') === 'Bearer new-refreshed'
      ? response({ ok: true })
      : response({}, 401);
  };
  const old = assert.rejects(client.api('/api/auth/me'), { status: 401 });
  await oldStarted;
  client.setApiSession({ accessToken: 'new', refreshToken: 'new-refresh' });
  assert.equal((await client.api('/api/auth/me')).ok, true);
  resolveOld(response({ accessToken: 'old-refreshed' }));
  await old;
});
