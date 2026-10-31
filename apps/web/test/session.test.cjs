const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { NextRequest } = require('next/server');
let server,
  session,
  proxy,
  gateway,
  calls = [],
  revoked = new Set();
function load(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const ordinary = loaded.require.bind(loaded);
  loaded.require = (name) => (name === '@/lib/server-api' ? gateway : ordinary(name));
  loaded._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return loaded.exports;
}
function request(method = 'GET', body, cookie = '', origin = 'http://dashboard.test') {
  return new NextRequest('http://dashboard.test/api/session', {
    method,
    headers: { 'content-type': 'application/json', origin, cookie },
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
}
function jar(response) {
  return response.cookies
    .getAll()
    .filter((cookie) => cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}
async function login(phone = 'admin') {
  return session.POST(request('POST', { action: 'verify', phone, code: '654321' }));
}
before(async () => {
  server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    calls.push({ path: req.url, authorization: req.headers.authorization, headers: req.headers });
    const send = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (req.url === '/api/auth/otp/request') return send(200, { success: true, devOtp: '654321' });
    if (req.url === '/api/auth/otp/verify')
      return send(200, {
        accessToken: `access-${body.phone}`,
        refreshToken: `refresh-${body.phone}`,
      });
    if (req.url === '/api/auth/refresh') {
      if (revoked.has(body.refreshToken)) return send(401, { message: 'Session revoked' });
      return send(200, { accessToken: body.refreshToken.replace('refresh-', 'access-') });
    }
    if (req.url === '/api/auth/logout') {
      revoked.add(body.refreshToken);
      return send(200, { success: true });
    }
    if (req.url === '/api/admin/unavailable')
      return send(503, { message: 'Temporary API failure' });
    const actor = req.headers.authorization?.replace('Bearer access-', '');
    if (!['admin', 'coordinator', 'volunteer'].includes(actor))
      return send(401, { message: 'Expired access token' });
    if (req.url === '/api/auth/me')
      return send(200, {
        id: actor,
        status: 'ACTIVE',
        memberships: [
          {
            status: 'APPROVED',
            roles: [
              actor === 'admin'
                ? 'SUPER_ADMIN'
                : actor === 'coordinator'
                  ? 'COORDINATOR'
                  : 'VOLUNTEER',
            ],
          },
        ],
      });
    if (req.url.startsWith('/api/admin/') && actor !== 'admin')
      return send(403, { message: 'Current Super Admin authority required' });
    return send(200, { scope: req.url });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.API_INTERNAL_URL = `http://127.0.0.1:${server.address().port}`;
  gateway = load('lib/server-api.ts');
  session = load('app/api/session/route.ts');
  proxy = load('app/api/backend/[...path]/route.ts');
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});
test('anonymous sessions and forged development headers cannot access the gateway', async () => {
  assert.equal((await session.GET(request())).status, 401);
  const forged = new NextRequest('http://dashboard.test/api/backend/admin/overview', {
    headers: { 'x-user-id': 'admin', 'x-is-super-admin': 'true' },
  });
  assert.equal(
    (await proxy.GET(forged, { params: Promise.resolve({ path: ['admin', 'overview'] }) })).status,
    401,
  );
});
test('sign-in uses HTTP-only cookies and never returns tokens to JavaScript', async () => {
  const response = await login();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.id, 'admin');
  assert.equal(body.accessToken, undefined);
  assert.equal(body.refreshToken, undefined);
  for (const name of ['ktb_admin_access', 'ktb_admin_refresh']) {
    const cookie = response.cookies.get(name);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, 'strict');
  }
  assert.equal((await session.GET(request('GET', undefined, jar(response)))).status, 200);
});
test('ordinary members cannot sign into the administrative dashboard', async () => {
  const response = await login('volunteer');
  assert.equal(response.status, 403);
  assert.equal(jar(response), '');
  assert.equal(revoked.has('refresh-volunteer'), true);
});
test('cross-origin writes and invalid sign-in payloads are rejected', async () => {
  const before = calls.length;
  assert.equal(
    (await session.POST(request('POST', { action: 'verify' }, '', 'https://other.test'))).status,
    403,
  );
  assert.equal(calls.length, before);
  assert.equal((await session.POST(request('POST', '{broken'))).status, 400);
});
test('gateway preserves tenant paths and queries without forwarding impersonation headers', async () => {
  const signed = await login();
  const req = new NextRequest(
    'http://dashboard.test/api/backend/organizations/abc-123/memberships?status=APPLIED&offset=20',
    { headers: { cookie: jar(signed), 'x-user-id': 'forged' } },
  );
  const response = await proxy.GET(req, {
    params: Promise.resolve({ path: ['organizations', 'abc-123', 'memberships'] }),
  });
  assert.equal(response.status, 200);
  assert.equal(
    (await response.json()).scope,
    '/api/organizations/abc-123/memberships?status=APPLIED&offset=20',
  );
  assert.equal(calls.at(-1).headers['x-user-id'], undefined);
});
test('expired access is refreshed and only the access cookie is renewed', async () => {
  const response = await session.GET(
    request('GET', undefined, 'ktb_admin_access=expired; ktb_admin_refresh=refresh-admin'),
  );
  assert.equal(response.status, 200);
  assert.equal(response.cookies.get('ktb_admin_access').value, 'access-admin');
  assert.equal(response.cookies.get('ktb_admin_refresh'), undefined);
});
test('coordinators remain subject to backend authorization', async () => {
  const signed = await login('coordinator');
  const response = await proxy.GET(request('GET', undefined, jar(signed)), {
    params: Promise.resolve({ path: ['admin', 'overview'] }),
  });
  assert.equal(response.status, 403);
  assert.match((await response.json()).message, /Super Admin/);
});
test('the gateway is not an arbitrary proxy', async () => {
  assert.equal(
    (await proxy.GET(request(), { params: Promise.resolve({ path: ['auth', 'otp', 'verify'] }) }))
      .status,
    404,
  );
  assert.equal(
    (await proxy.GET(request(), { params: Promise.resolve({ path: ['admin', '..'] }) })).status,
    400,
  );
});

test('catalogue gateway permits explicit configuration and skill routes while excluding other writes', async () => {
  const signed = await login();
  for (const [method, path] of [
    ['GET', ['catalogue', 'global']],
    ['PATCH', ['catalogue', 'global', 'abc-123']],
    ['POST', ['organizations', 'abc-123', 'catalogue', 'configure']],
  ]) {
    const result = await proxy[method](
      request(method, method === 'GET' ? undefined : {}, jar(signed)),
      { params: Promise.resolve({ path }) },
    );
    assert.equal(result.status, 200);
  }
  for (const path of [
    ['catalogue', 'global'],
    ['organizations', 'abc-123', 'catalogue', 'proposals'],
  ]) {
    const result = await proxy.POST(request('POST', {}, jar(signed)), {
      params: Promise.resolve({ path }),
    });
    assert.equal(result.status, 404);
  }
});

test('coordinator request routes and read-only catalogue are allowed without exposing volunteer actions', async () => {
  const signed = await login('coordinator');
  const prefix = ['organizations', 'abc-123'];
  for (const suffix of [
    ['requests'],
    ['requests', 'req-123', 'matching'],
    ['requests', 'req-123', 'dispatch-volunteers'],
    ['catalogue'],
  ]) {
    const response = await proxy.GET(request('GET', undefined, jar(signed)), {
      params: Promise.resolve({ path: [...prefix, ...suffix] }),
    });
    assert.equal(response.status, 200);
  }
  for (const suffix of [['catalogue'], ['assignments', 'offer-123', 'accept']]) {
    const response = await proxy.POST(request('POST', {}, jar(signed)), {
      params: Promise.resolve({ path: [...prefix, ...suffix] }),
    });
    assert.equal(response.status, 404);
  }
});
test('logout revokes refresh and clears both cookies; a late access cookie alone cannot reopen a session', async () => {
  const signed = await login();
  const response = await session.DELETE(request('DELETE', undefined, jar(signed)));
  assert.equal(response.status, 200);
  assert.equal(response.cookies.get('ktb_admin_access').maxAge, 0);
  assert.equal(response.cookies.get('ktb_admin_refresh').maxAge, 0);
  assert.equal(revoked.has('refresh-admin'), true);
  assert.equal(
    (await session.GET(request('GET', undefined, 'ktb_admin_access=access-admin'))).status,
    401,
  );
  const denied = await session.GET(request('GET', undefined, 'ktb_admin_refresh=refresh-admin'));
  assert.equal(denied.status, 401);
});

test('same-origin writes work when Next normalizes its internal hostname', async () => {
  const req = new NextRequest('http://localhost:3000/api/session', {
    method: 'POST',
    headers: {
      host: '127.0.0.1:3000',
      origin: 'http://127.0.0.1:3000',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action: 'request-code', phone: 'admin' }),
  });
  assert.equal((await session.POST(req)).status, 200);
});

test('upstream failures are returned without successful placeholder data', async () => {
  const signed = await login();
  const response = await proxy.GET(request('GET', undefined, jar(signed)), {
    params: Promise.resolve({ path: ['admin', 'unavailable'] }),
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).message, 'Temporary API failure');
});
test('production cookies are Secure and development codes are suppressed', async () => {
  const original = process.env.NODE_ENV,
    previousGateway = gateway,
    previousSession = session;
  try {
    process.env.NODE_ENV = 'production';
    gateway = load('lib/server-api.ts');
    session = load('app/api/session/route.ts');
    const challenge = await session.POST(
      request('POST', { action: 'request-code', phone: 'admin' }),
    );
    assert.equal((await challenge.json()).devOtp, undefined);
    const signed = await login();
    assert.equal(signed.status, 200);
    assert.equal(signed.cookies.get('ktb_admin_access').secure, true);
    assert.equal(signed.cookies.get('ktb_admin_refresh').secure, true);
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
    gateway = previousGateway;
    session = previousSession;
  }
});
