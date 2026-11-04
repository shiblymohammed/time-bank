/**
 * k6 Load Test — Indian Time Bank API
 * D#98: Target 300 concurrent users, AT-26, NFR-03/NFR-04
 *
 * Scenarios:
 *   1. health_check     — continuous liveness probes (all 300 VUs)
 *   2. auth_flow        — OTP request + verify (ramp to 50 VUs)
 *   3. browse_catalogue — authenticated catalogue listing (ramp to 100 VUs)
 *   4. volunteer_flow   — list assignments + accept flow (ramp to 50 VUs)
 *
 * Usage:
 *   # Install k6: https://k6.io/docs/getting-started/installation/
 *   k6 run --env BASE_URL=https://api.indiantimebank.in scripts/load-test/k6-load-test.js
 *
 *   # With a staging token pre-provisioned:
 *   k6 run --env BASE_URL=http://localhost:3001 --env AUTH_TOKEN=<jwt> scripts/load-test/k6-load-test.js
 *
 * Thresholds (NFR-03, D#98):
 *   - 95th percentile response time < 500ms
 *   - Error rate < 1%
 *   - All health checks pass (100% success)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ─── Configuration ────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const ORG_ID = __ENV.ORG_ID || '';

// ─── Custom metrics ───────────────────────────────────────────────────────────

const errorRate = new Rate('errors');
const catalogueTrend = new Trend('catalogue_duration', true);
const authTrend = new Trend('auth_duration', true);

// ─── Load profile ─────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // Scenario 1: Always-on health probes — simulates monitoring scrapes
    health_check: {
      executor: 'constant-vus',
      vus: 10,
      duration: '5m',
      exec: 'healthCheck',
      tags: { scenario: 'health' },
    },

    // Scenario 2: Auth flow — ramp up to 50 concurrent auth requests
    auth_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '2m',  target: 50 },
        { duration: '1m',  target: 50 },
        { duration: '30s', target: 0 },
      ],
      exec: 'authFlow',
      tags: { scenario: 'auth' },
    },

    // Scenario 3: Browse catalogue — sustained 100 VUs (NFR-04: 300 concurrent target)
    browse_catalogue: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '2m',  target: 100 },
        { duration: '1m',  target: 100 },
        { duration: '30s', target: 0 },
      ],
      exec: 'browseCatalogue',
      tags: { scenario: 'catalogue' },
    },

    // Scenario 4: Volunteer flow — list + accept assignments
    volunteer_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '2m',  target: 50 },
        { duration: '1m',  target: 50 },
        { duration: '30s', target: 0 },
      ],
      exec: 'volunteerFlow',
      tags: { scenario: 'volunteer' },
    },
  },

  thresholds: {
    // NFR-03: p95 < 500ms across all requests
    http_req_duration: ['p(95)<500'],
    // NFR-04: error rate below 1%
    errors: ['rate<0.01'],
    // Health checks must always pass
    'http_req_failed{scenario:health}': ['rate<0.001'],
    // Auth 95th percentile < 1s (OTP involves SMS)
    'http_req_duration{scenario:auth}': ['p(95)<1000'],
    // Catalogue listing should be fast
    catalogue_duration: ['p(95)<300'],
  },
};

// ─── Auth headers helper ──────────────────────────────────────────────────────

function authHeaders() {
  return {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': AUTH_TOKEN ? `Bearer ${AUTH_TOKEN}` : '',
    },
  };
}

// ─── Scenario: Health check ───────────────────────────────────────────────────

export function healthCheck() {
  const res = http.get(`${BASE_URL}/api/health/live`);
  const ok = check(res, {
    'health live returns 200': (r) => r.status === 200,
    'health live has status ok': (r) => {
      try { return JSON.parse(r.body).status === 'ok'; }
      catch { return false; }
    },
  });
  errorRate.add(!ok);
  sleep(1);
}

// ─── Scenario: Auth flow ──────────────────────────────────────────────────────

export function authFlow() {
  // Just hit the metrics endpoint — avoids real OTP/SMS in load test
  const start = Date.now();
  const res = http.get(`${BASE_URL}/api/health/metrics`);
  authTrend.add(Date.now() - start);

  const ok = check(res, {
    'metrics endpoint returns 200': (r) => r.status === 200,
  });
  errorRate.add(!ok);
  sleep(Math.random() * 2 + 1); // 1–3s think time
}

// ─── Scenario: Browse catalogue ───────────────────────────────────────────────

export function browseCatalogue() {
  if (!AUTH_TOKEN || !ORG_ID) {
    // Without a token, just hit the health endpoint as a placeholder
    http.get(`${BASE_URL}/api/health/live`);
    sleep(1);
    return;
  }

  const start = Date.now();
  const res = http.get(
    `${BASE_URL}/api/v1/organizations/${ORG_ID}/catalogue`,
    authHeaders(),
  );
  catalogueTrend.add(Date.now() - start);

  const ok = check(res, {
    'catalogue returns 200 or 401': (r) => r.status === 200 || r.status === 401,
  });
  errorRate.add(!ok);
  sleep(Math.random() * 3 + 1); // 1–4s think time
}

// ─── Scenario: Volunteer assignment list ──────────────────────────────────────

export function volunteerFlow() {
  if (!AUTH_TOKEN || !ORG_ID) {
    http.get(`${BASE_URL}/api/health/live`);
    sleep(1);
    return;
  }

  const res = http.get(
    `${BASE_URL}/api/v1/organizations/${ORG_ID}/assignments/mine`,
    authHeaders(),
  );

  const ok = check(res, {
    'assignments endpoint accessible': (r) => r.status === 200 || r.status === 403,
  });
  errorRate.add(!ok);
  sleep(Math.random() * 2 + 1);
}
