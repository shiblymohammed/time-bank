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
  firebaseConfig,
  gateway,
  calls = [],
  revoked = new Set(),
  failLogout = false;
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
    if (req.url === '/api/auth/firebase') {
      if (!body.idToken.startsWith('verified-'))
        return send(401, { message: 'Firebase phone verification failed. Request a new code.' });
      const actor = body.idToken.replace('verified-', '');
      return send(200, { accessToken: `access-${actor}`, refreshToken: `refresh-${actor}` });
    }
    if (req.url === '/api/auth/refresh') {
      if (revoked.has(body.refreshToken)) return send(401, { message: 'Session revoked' });
      return send(200, { accessToken: body.refreshToken.replace('refresh-', 'access-') });
    }
    if (req.url === '/api/auth/logout') {
      if (failLogout) return send(503, { message: 'Logout service unavailable' });
      revoked.add(body.refreshToken);
      return send(200, { success: true });
    }
    if (req.url === '/api/admin/unavailable')
      return send(503, { message: 'Temporary API failure' });
    const actor = req.headers.authorization?.replace('Bearer access-', '');
    if (!['admin', 'coordinator', 'volunteer', 'merchant'].includes(actor))
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
                  : actor === 'merchant'
                    ? 'MERCHANT'
                    : 'VOLUNTEER',
            ],
          },
        ],
      });
    if (req.url.startsWith('/api/admin/') && actor !== 'admin')
      return send(403, { message: 'Current Super Admin authority required' });
    if (req.url.startsWith('/api/admin/reports/download')) {
      const format = new URL(req.url, 'http://stub.test').searchParams.get('format');
      if (format === 'denied') return send(403, { message: 'Report access denied' });
      const types = {
        pdf: 'application/pdf',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        csv: 'text/csv; charset=utf-8',
      };
      res.writeHead(200, {
        'content-type': types[format] ?? 'text/html',
        'content-disposition': `attachment; filename="report.${format}"`,
      });
      return res.end(Buffer.from(`QA report bytes: ${format}`));
    }
    return send(200, { scope: req.url });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.API_INTERNAL_URL = `http://127.0.0.1:${server.address().port}`;
  gateway = load('lib/server-api.ts');
  session = load('app/api/session/route.ts');
  proxy = load('app/api/backend/[...path]/route.ts');
  firebaseConfig = load('app/api/firebase-config/route.ts');
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
test('a verified Firebase token opens a staff session with HTTP-only cookies', async () => {
  const response = await session.POST(
    request('POST', { action: 'firebase', idToken: 'verified-admin' }),
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.id, 'admin');
  assert.equal(body.accessToken, undefined);
  assert.equal(response.cookies.get('ktb_admin_refresh').httpOnly, true);
});
test('Firebase sign-in rejects forged tokens and revokes non-staff sessions', async () => {
  assert.equal(
    (await session.POST(request('POST', { action: 'firebase', idToken: 'forged' }))).status,
    401,
  );
  assert.equal((await session.POST(request('POST', { action: 'firebase' }))).status, 400);
  const denied = await session.POST(
    request('POST', { action: 'firebase', idToken: 'verified-volunteer' }),
  );
  assert.equal(denied.status, 403);
  assert.equal(denied.cookies.get('ktb_admin_refresh'), undefined);
  assert.equal(revoked.has('refresh-volunteer'), true);
  revoked.delete('refresh-volunteer');
});
test('merchants enter their dashboard without staff verification or staff powers', async () => {
  const start = calls.length;
  const response = await login('merchant');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).memberships[0].roles[0], 'MERCHANT');
  assert.equal(
    calls.slice(start).some((r) => r.path.startsWith('/api/auth/staff-code')),
    false,
  );
  const denied = await proxy.GET(
    new NextRequest('http://dashboard.test/api/backend/admin/overview', {
      headers: { cookie: jar(response) },
    }),
    { params: Promise.resolve({ path: ['admin', 'overview'] }) },
  );
  assert.equal(denied.status, 403);
  assert.equal((await session.GET(request('GET', undefined, jar(response)))).status, 200);
});
test('Firebase sign-in also requires a same-origin request', async () => {
  const response = await session.POST(
    request(
      'POST',
      { action: 'firebase', idToken: 'verified-admin' },
      '',
      'http://attacker.example',
    ),
  );
  assert.equal(response.status, 403);
});
test('the web config is offered only when fully configured', async () => {
  const keys = {
    FIREBASE_WEB_API_KEY: 'key',
    FIREBASE_WEB_AUTH_DOMAIN: 'time-bank.firebaseapp.com',
    FIREBASE_PROJECT_ID: 'time-bank',
    FIREBASE_WEB_APP_ID: 'app',
  };
  for (const name of Object.keys(keys)) delete process.env[name];
  assert.deepEqual(await firebaseConfig.GET().json(), {});
  Object.assign(process.env, keys);
  assert.deepEqual(await firebaseConfig.GET().json(), {
    apiKey: 'key',
    authDomain: 'time-bank.firebaseapp.com',
    projectId: 'time-bank',
    appId: 'app',
  });
  delete process.env.FIREBASE_WEB_APP_ID;
  assert.deepEqual(await firebaseConfig.GET().json(), {});
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

test('service operation routes are allowed per method while other writes stay excluded', async () => {
  const signed = await login();
  const org = ['organizations', 'abc-123'];
  for (const [method, path] of [
    ['GET', ['catalogue', 'global']],
    ['POST', ['catalogue', 'global']],
    ['PATCH', ['catalogue', 'global', 'abc-123']],
    ['GET', ['catalogue', 'categories']],
    ['PATCH', ['catalogue', 'categories', 'abc-123']],
    ['PATCH', ['catalogue', 'proposals', 'abc-123', 'review']],
    ['POST', [...org, 'catalogue', 'configure']],
    ['POST', [...org, 'catalogue', 'proposals']],
    ['GET', [...org, 'beneficiaries', 'def-456', 'eligibility']],
    ['PATCH', [...org, 'caregivers', 'def-456', 'review']],
    ['PUT', [...org, 'zones', 'def-456']],
    ['DELETE', [...org, 'zones', 'def-456', 'volunteers', 'fed-654']],
    ['PUT', [...org, 'volunteers', 'def-456', 'availability']],
    ['POST', [...org, 'volunteers', 'skills', 'verify']],
  ]) {
    const result = await proxy[method](
      request(method, method === 'GET' ? undefined : {}, jar(signed)),
      { params: Promise.resolve({ path }) },
    );
    assert.equal(result.status, 200, `${method} ${path.join('/')}`);
  }
  for (const [method, path] of [
    ['DELETE', ['catalogue', 'global', 'abc-123']],
    ['POST', ['catalogue', 'proposals']],
    ['POST', [...org, 'caregivers', 'def-456', 'review']],
    ['POST', [...org, 'volunteers', 'def-456', 'availability']],
    ['GET', [...org, 'caregivers', 'mine']],
    ['POST', [...org, 'assignments', 'def-456', 'accept']],
  ]) {
    const result = await proxy[method](
      request(method, method === 'GET' ? undefined : {}, jar(signed)),
      { params: Promise.resolve({ path }) },
    );
    assert.equal(result.status, 404, `${method} ${path.join('/')}`);
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

test('credit dashboard routes are allowlisted by method without exposing ledger writes or donations', async () => {
  const signed = await login();
  const org = ['organizations', 'abc-123'];
  for (const [method, path] of [
    ['GET', ['donation-pools']],
    ['POST', [...org, 'donation-pools']],
    ['GET', [...org, 'donation-pools', 'def-456', 'transactions']],
    ['GET', [...org, 'credit-reviews']],
    ['POST', [...org, 'credit-reviews']],
    ['GET', [...org, 'credit-reviews', 'def-456', 'transfers']],
    ['POST', [...org, 'credit-reviews', 'def-456', 'investigation']],
    ['POST', [...org, 'credit-reviews', 'def-456', 'resolution']],
    ['GET', [...org, 'wallets', 'def-456', 'transactions']],
    ['POST', [...org, 'wallets', 'def-456', 'status']],
    ['POST', [...org, 'wallets', 'def-456', 'release-frozen']],
  ]) {
    const result = await proxy[method](
      request(method, method === 'GET' ? undefined : {}, jar(signed)),
      { params: Promise.resolve({ path }) },
    );
    assert.equal(result.status, 200, `${method} ${path.join('/')}`);
  }
  for (const [method, path] of [
    ['POST', ['donation-pools']],
    ['POST', [...org, 'wallets', 'def-456', 'transactions']],
    ['DELETE', [...org, 'credit-reviews', 'def-456']],
    ['POST', [...org, 'donations']],
    ['POST', [...org, 'ledger']],
  ]) {
    const result = await proxy[method](request(method, {}, jar(signed)), {
      params: Promise.resolve({ path }),
    });
    assert.equal(result.status, 404, `${method} ${path.join('/')}`);
  }
});
test('logout clears browser cookies even when upstream revocation fails', async () => {
  const signed = await login();
  failLogout = true;
  try {
    const response = await session.DELETE(request('DELETE', undefined, jar(signed)));
    assert.equal(response.status, 503);
    assert.equal(response.cookies.get('ktb_admin_access')?.maxAge, 0);
    assert.equal(response.cookies.get('ktb_admin_refresh')?.maxAge, 0);
  } finally {
    failLogout = false;
  }
});
test('rejected cross-origin logout does not alter session cookies', async () => {
  const signed = await login();
  const response = await session.DELETE(
    request('DELETE', undefined, jar(signed), 'https://foreign.test'),
  );
  assert.equal(response.status, 403);
  assert.equal(response.cookies.getAll().length, 0);
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
test('report downloads preserve file bytes and metadata, including after session refresh', async () => {
  const signed = await login();
  // The stub reuses token strings; this sign-in represents a new session after the logout test.
  revoked.delete('refresh-admin');
  for (const format of ['pdf', 'xlsx', 'csv']) {
    const cookie =
      format === 'pdf' ? 'ktb_admin_access=expired; ktb_admin_refresh=refresh-admin' : jar(signed);
    const response = await proxy.GET(
      new NextRequest(`http://dashboard.test/api/backend/admin/reports/download?format=${format}`, {
        headers: { cookie },
      }),
      {
        params: Promise.resolve({ path: ['admin', 'reports', 'download'] }),
      },
    );
    assert.equal(response.status, 200);
    assert.equal(await response.text(), `QA report bytes: ${format}`);
    assert.match(response.headers.get('content-disposition'), new RegExp(`report\\.${format}`));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    if (format === 'pdf')
      assert.equal(response.cookies.get('ktb_admin_access').value, 'access-admin');
  }
});

test('report downloads reject anonymous users, backend denials and unexpected file types', async () => {
  const signed = await login();
  for (const [format, cookie, status] of [
    ['pdf', '', 401],
    ['denied', jar(signed), 403],
    ['unexpected', jar(signed), 502],
  ]) {
    const response = await proxy.GET(
      new NextRequest(`http://dashboard.test/api/backend/admin/reports/download?format=${format}`, {
        headers: { cookie },
      }),
      {
        params: Promise.resolve({ path: ['admin', 'reports', 'download'] }),
      },
    );
    assert.equal(response.status, status);
    assert.equal(response.headers.get('content-disposition'), null);
  }
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
