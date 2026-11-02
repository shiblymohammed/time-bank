# Full application audit — 2 November 2026

Reviewed the current backend, web dashboard, landing page, separate Flutter Android/iOS repository, database migrations, CI and deployment configuration. This report supersedes the remaining-issue list in the earlier audit. Findings marked fixed have source changes and regression evidence; deployment and real-device validation remain separate.

## Confirmed issues fixed

| Severity | Before | Change and evidence |
| --- | --- | --- |
| Critical when exposed publicly | Every non-production API returned the server OTP in the response, while mock SMS automatically succeeded. A public development server could therefore defeat proof of phone ownership through the legacy endpoint even with Firebase configured. | Both legacy OTP issuance and verification now require `AUTH_ALLOW_MOCK_OTP=true`, `SMS_PROVIDER=local-mock` and an explicit development/test environment. Defaults and production fail closed. SMS logs no longer contain the phone/code. Unit regressions cover issuance, verification, production and provider settings. Firebase exchange is unaffected. |
| High | A matching failure left a booking saved; an audit failure left the booking and matching saved while the caller received an error. | Request creation, initial matching and creation audit now commit or roll back together. PostgreSQL failure injection proves zero leftover bookings, rounds or assignments. |
| High | Concurrent retries with one key could return a conflict/database error. Concurrent requests could both pass the final monthly quota slot. | Creation is serialized per community inside the transaction. Twelve concurrent same-key requests against a ten-connection pool all return one booking. Two concurrent final-slot requests create only one booking. Authorization, eligibility and matching use the transaction's connection so waiting callers cannot starve the lock holder of a connection. |
| Medium | Request numbers used a five-digit random value, causing collisions; long but valid organization codes exceeded the database field length. | A bounded organization prefix and cryptographic identifier fit the field. Real PostgreSQL regressions cover maximum code length and repeated `Math.random` values. |
| Medium | Direct API callers could create already-past scheduled bookings; oversized retry keys/landmarks could become database errors. | Backend time validation and field limits reject these inputs. Immediate requests allow one minute of transport delay; idempotent replay precedes time checks. PostgreSQL covers past scheduled requests. |
| High | A Flutter session change after the profile response but before its next community request could restore the previous account's profile. | The whole profile load checks the session generation across both requests. Both logout and account-switch regressions failed before the fix and pass afterward. Failed authentication also clears pending sign-in recovery state. |
| Medium | Dashboard logout kept both browser cookies when upstream session revocation returned an error. | Trusted logout clears cookies on success or upstream error while preserving the error status. The page clears its displayed account and reports uncertain revocation. Regression tests prove failure cleanup and preserve cross-origin rejection. |
| Medium | A duplicate `JwtService` import prevented the real PostgreSQL suite from compiling. | Removed the duplicate; the expanded suite now runs and passes. |
| Dependency security | Production dependency audit reported 33 advisory findings, including 14 high. | Compatible overrides for body-parser, multer, qs, lodash, postcss and js-yaml reduce the result to six moderate findings, zero high/critical. Lockfile and build checks cover the patched dependency graph. |

No database migration is required for these fixes. Request numbers retain `REQ-...` but have a longer random suffix; they are identifiers, not a sequential counter. Per-community creation serialization favors correctness over maximum throughput; load-test this boundary before a high-volume launch.

## Remaining issues and release work, in priority order

### 1. Public deployment needs the security fix and production configuration

The supplied HTTPS tunnel's `/api/health/live` still returned `environment=development` during this audit (2 November 2026). This is a live observation; the legacy-OTP disclosure above was established from source rather than attempting to sign in as anyone on the live server. There was no real-phone OTP request or production database mutation.

Deploy this backend change, keep `AUTH_ALLOW_MOCK_OTP=false` and `AUTH_ALLOW_DEV_HEADERS=false`, use a production runtime and verify the legacy endpoints return 503. Confirm the actual deployed commit: the public health response reports only `0.0.1`, not a Git SHA. No remote deployment was performed here. Quick Tunnel hostnames can change after restart, requiring the configured mobile URL/build to change too.

For **private disposable QA only**, use `NODE_ENV=development`, `SMS_PROVIDER=local-mock`, `AUTH_ALLOW_MOCK_OTP=true` and `API_HOST=127.0.0.1`. The QA PowerShell launcher sets and restores these variables. Do not tunnel that mock-enabled QA server. Development Compose defaults mock OTP off and forwards explicit settings when needed.

### 2. Production dashboard sign-in is still a blocker

The dashboard session route still calls `/auth/otp/request` and `/auth/otp/verify`; it has not been migrated to Firebase web authentication. `SmsService` has no real production gateway. The newly protected legacy path therefore intentionally does not offer production login. Implement Firebase web token exchange or a real server SMS gateway before launching the dashboard. Enabling mock OTP on a public API is not a solution.

Evidence: `apps/web/src/app/api/session/route.ts`, `apps/api/src/auth/sms/sms.service.ts`.

### 3. Automatic matching progression and delivery are incomplete

Initial candidate matching is transactional, but no recurring worker invokes offer-expiry/round progression. Coordinators must use progression/dispatch actions; otherwise an unmatched request can sit without advancing. Offers are persisted for discovery by the app; a production push/SMS notification delivery worker is not wired into this flow. Replacement matching after withdrawal also needs explicit operational handling.

Evidence: `MatchingService.evaluateRoundProgression`, the matching controller's progression endpoint, and the absence of a scheduler/job module.

### 4. Public organization discovery returns an administrative view

The unauthenticated organization-list controller calls `findAll(true)`. This returns inactive organizations and app-build metadata even though the method comment promises public active summaries. Flutter filters active organizations locally, but that does not protect the API response. Separate active public summaries from an authenticated Super Admin listing; ensure the dashboard can still restore suspended organizations. This is a confirmed API data-minimization issue, not a demonstrated secret-key leak.

Evidence: `apps/api/src/organizations/organizations.controller.ts:56`, `OrganizationsService.findAll`.

### 5. Request replay and calendar boundaries need stricter policy

A repeated request idempotency key returns its existing booking without comparing the new request body. Reusing a key after changing a service/time can therefore replay an older booking instead of rejecting the mismatch. Preserve the original payload or a canonical hash and return 409 on mismatched reuse. Current same-payload concurrency is fixed; changed-payload rejection is not implemented.

Monthly quota uses server-local `setDate(1)`/`setHours(0)` rather than a fixed India calendar boundary. Deploying to a UTC host shifts the quota reset by 5.5 hours relative to India. Fix the business time zone explicitly and test the month boundary before enforcing quotas across differently configured hosts.

Evidence: `RequestsService.createRequestInTransaction` replay branch; `BeneficiariesService.checkEligibilityAndQuota` month calculation. These are source findings, not live reproduction against a user's records.

### 6. Some post-commit recovery and session limitations remain

Account provisioning, session creation and login audit are still separate operations. A later audit failure can leave a session saved while sign-in returns an error. Other administrative mutations also save before their audit, so the request-creation transaction fix is not a universal transaction/outbox implementation. Recovery should use atomic audit/session writes or an outbox where external delivery is involved.

Flutter sessions are memory-only and require sign-in after restart. A mutation timeout can mean the server committed; request/donation keys protect retries from the same form but reopening a form creates a new key. Logout revokes refresh sessions; already-issued stateless access JWTs are not bound to a revocation record and can last until expiry. If the browser cannot reach even its own logout route, cookie cleanup/revocation cannot be confirmed. These limits require an explicit product/session policy rather than claiming universal immediate revocation.

There is also no general API/IP throttle on Firebase token exchange or the API surface; the legacy per-phone cooldown is not a general abuse control. Add a deployment/API rate limit and session-creation limits before a public launch. No traffic-flood test was run against the live service.

### 7. Six moderate dependency advisories remain

See [machine-readable dependency findings](DEPENDENCY_AUDIT_2026-11-02.json). Remaining installed packages are `@nestjs/core`, `file-type` (two advisories), `uuid`, `minimatch`, and `glob`. Patched versions cross their current declared major versions; migrate/test them together rather than force incompatible overrides.

The [NestJS advisory](https://github.com/advisories/GHSA-36xv-jgw5-4q75) requires user-influenced SSE message fields. No SSE controller was found. No binary upload/file-type validation endpoint or application use of the vulnerable UUID buffer APIs was found either; minimatch/glob appear through tooling. Those observations limit demonstrated reachability; they do not erase the dependency findings or constitute an exploit assessment of every transitive call path.

### 8. Real mobile authentication and deferred features are not end-to-end verified

The iOS macOS CI run for `c8520be` completed successfully: plist validation, tests, unsigned simulator build, packaging and artifact upload. [Verified iOS build](https://github.com/MohammedAzharKK/time_bank_flutter/actions/runs/41440510484). This proves native compilation of that setup, not successful SMS login. The later Flutter session fix is covered locally by tests and analysis.

Real Firebase SMS delivery, Android app verification, iOS reCAPTCHA callback and a signed Firebase token exchange against the public API still need a controlled device test. Firebase quota/billing readiness is unverified. iOS signing/APNs credentials remain deliberately unset at the user's request; Android CI/release signing fingerprints need their own Firebase registration. No private signing keys were created or published.

Offline synchronization, binary document upload, emergency alerts and merchant redemption remain feature gaps. New voluntary assistance-funding controls are available through backend/dashboard routes; a corresponding Flutter funding form is not implemented. These are not passing mocked features.

## Validation

- API unit/security/router tests: **479 passed**, 36 suites.
- Real PostgreSQL workflow/concurrency tests: **90 passed**, including rollback, twelve-way retry, quota, request-number and backdated-booking regressions plus role, completion, ledger, fraud-review and donation checks.
- HTTP/database health E2E tests: **2 passed**.
- Dashboard tests: **26 passed**, including failed-logout and cross-origin regressions.
- Flutter tests: **71 passed**, analysis clean; debug APK build passed.
- Workspace type checks, API build/lint, web build and landing build passed. Web lint reports five pre-existing unused-disable warnings and zero errors.
- iOS native simulator build passed in GitHub Actions for the setup commit noted above.
- Dependency audit: **0 critical, 0 high, 6 moderate, 0 low**. The audit command remains nonzero because moderate advisories remain.
- Docker is unavailable locally; container image builds were not exercised here. No full production load test, real SMS/device journey or deployment was performed.

Database checks used only the disposable loopback PostgreSQL 18 fixture `ktb_matching_test_bug_audit`, with current migrations. No configured development/production database was truncated. Read-only live checking was limited to API liveness. A broad source/test audit cannot establish that every possible defect has been eliminated.
