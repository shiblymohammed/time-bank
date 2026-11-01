# Flutter API integration — 1 November 2026

Integrated `origin/main` through `21b6100` and the newer backend feature branch
`origin/codex/permission-hardening` through `6a48e58` into the existing integration
branch. The nested Flutter repository's `origin/develop` was already current at
`84e4fd3`. The repositories require separate reviews.

## Connected Flutter workflows

- OTP request/verify, profile, token refresh, logout and active organization selection.
- Membership role choice and volunteer questionnaire, current skill-code discovery,
  application updates and supporting document storage references.
- Organization catalogue and service details, beneficiary and authorized caregiver
  requests, duration/urgency/location, pagination, cancellation and rescheduling.
- Volunteer availability, skills, zones, offers, changed-time confirmation,
  acceptance/decline/withdrawal, starting and finishing service.
- Beneficiary/caregiver confirmation of finished help, universal credit balance and
  paginated history, held credits, donations to verified members and community pools.

## Integration fixes

Empty optional form fields are omitted so strict backend validation accepts them.
Caregiver labels use the membership number returned by the privacy-limited API.
Started and closed requests hide cancellation and rescheduling. Expired offers
hide acceptance. Assignment history uses its own offered time; changed schedules
are identified before accepting. Start actions respect the one-hour early limit.
Confirmation excludes the member's own volunteer assignment.

Create-request and donation forms keep an operation key through failed attempts.
Donation retries preserve their original payload to prevent a second transfer.
When a write succeeds but reloading fails, the app reports that the write was
saved. A delayed rejection of an old access token reuses the refreshed token
without refreshing twice. Numeric answers, minutes, duration and credit amounts
are validated before submission.

The merge also retains the reusable CI entry point and pnpm version, registers
the web hooks lint plugin, fixes the newly pulled landing package's ESLint command
and unsafe indexed reads, and extends schema/route checks to the new APIs and all
nine migrations. Membership security tests use the new role hierarchy and retain
self-escalation checks. Development impersonation uses `AUTH_ALLOW_DEV_HEADERS`;
the obsolete `ALLOW_DEV_AUTH_BYPASS` example setting was removed.

## Verification

All checks below passed locally:

| Check | Result |
| --- | --- |
| Flutter analysis | No issues |
| Flutter tests | 42 passed |
| Flutter debug APK | Built successfully |
| API TypeScript and ESLint | Passed |
| API unit/security/router tests | 458 passed, 35 suites |
| PostgreSQL transaction/concurrency tests | 53 passed |
| API health HTTP tests | 2 passed |
| Web TypeScript and tests | Passed; 20 tests |
| Web and landing ESLint | Passed with existing warnings |
| Landing TypeScript | Passed |
| Real Dart client against running API | 16 checks passed |

PostgreSQL 18 ran in an isolated temporary cluster on loopback port 15449.
Tests applied the actual migrations to dedicated disposable databases. The real
Dart client signed in fictional users using mock SMS and performed application,
availability, skills/zones, catalogue, caregiver recipient discovery, request
creation, dispatch, start/finish/confirmation, credit payment/history, donation
replay, caregiver reschedule/cancellation/listing and logout.

Run the reproducible client check from the Flutter repository with a fresh
`scripts/interface-qa-fixture.cjs` fixture and its matching running local API:

```bash
dart run tool/live_api_smoke.dart http://127.0.0.1:3001 /absolute/path/to/fixture.json
```

This test writes records and requires a fresh disposable QA database. It refuses
remote API hosts. It is not suitable for a real organization.

## Remaining limits

The production SMS provider is still unimplemented in the backend, so real OTP
delivery needs a configured gateway implementation. This was tested with local
mock SMS. File upload, merchant redemption, emergency alerts, community pool
spending and offline synchronization are not provided by these API updates.
Tokens remain in memory. Administrative management stays in the web dashboard.
No production migration or deployment was performed, and the APK was not tested
on a physical device. These checks establish the tested behavior; they do not
prove the absence of every possible bug.
