# Live administration dashboard

The existing Next.js administration sections now use the real API. Sample metrics, records, administrative identity,
local-only approvals, and preview impersonation headers have been removed.

## Available workflows

- Mobile OTP sign-in, current-role access checks, session restoration on reload, refresh, and logout.
- Central platform metrics from `/api/admin/overview`.
- Organization creation, lifecycle status updates, and branding changes with saved colors/display names.
- Tenant-scoped membership lists with status filtering and server pagination. Central administrators select an
  organization before reviewing memberships.
- Membership approval with an explicit initial role; rejection with a reason; persisted membership numbers.
- Supporting-document reference discovery and review. This does not add a binary file-storage/upload service.
- Organization role grant and revocation with the backend's current authority checks.
- Central global restriction listing, filtering, imposition, and resolution with required notes/reasons.
- Real audit records, organization/event-type filters, and server pagination.

Central administrators see all administration sections. Municipality administrators and coordinators see their permitted
organizations and membership tools; privileged controls are hidden according to current approved roles. API
authorization remains authoritative for every operation. Overview metrics and account restrictions are explicitly
platform-wide; their scope selector is locked to prevent implying local scope.

Requests for memberships and audit rows carry the selected organization ID to the API. Changing scope clears the
previous records and cancels obsolete reads. Actions wait for server success, display backend errors, and reload
persisted data. Duplicate role grants leave the dialog open with the actual error. Modal forms prevent interaction with
the background dashboard while a decision is being entered.

## Session gateway

Browser requests go through same-origin Next.js routes:

- `/api/session` handles sign-in, current profile, and logout.
- `/api/backend/...` forwards an allowlisted set of administrative/membership/organization paths.

Access and refresh tokens are HTTP-only, SameSite Strict cookies. Production cookies are Secure. Refresh tokens are
browser-session cookies; the backend still enforces session expiry/revocation. Tokens are not returned in
browser-readable JSON or stored in local/session storage. Refresh replaces only the access cookie; a late access
response cannot recreate a signed-out session without the refresh cookie. Arbitrary backend paths and browser-supplied
impersonation headers are not forwarded.

Writes require a matching Origin. The check handles Next.js normalizing an internal localhost URL while preserving the
incoming Host. Configure `DASHBOARD_ORIGIN` explicitly when deploying behind a TLS reverse proxy. Responses and upstream
calls use `no-store`; backend failures produce errors without sample-data fallback.

## Configuration

```dotenv
API_INTERNAL_URL=http://127.0.0.1:3001
# Production example behind a TLS reverse proxy:
# DASHBOARD_ORIGIN=https://admin.example.org
```

`API_INTERNAL_URL` is server-side and must point to the intended NestJS service. The gateway falls back to the existing
`NEXT_PUBLIC_API_URL` setting, then the local development API. In containers, configure the service hostname, for
example `http://api:3001`. Production use requires HTTPS for Secure cookies and a working OTP provider. The existing SMS
adapter and real delivery were not changed or verified by this work.

## Backend changes required for these workflows

Organization creation no longer requires a tenant context before the tenant exists. It retains authentication and
current global Super Admin authorization. Its audit write now shares the organization transaction, avoiding a
separate-connection foreign-key wait against the uncommitted organization.

`GET /api/organizations/:id/memberships/:membershipId/documents` was added for staff review. Authentication,
organization access, and staff-role guards protect it; the service validates membership ownership in the specified
organization before reading documents.

## Verification — 31 October 2026

- 327 API unit/security tests passed, including current Super Admin provisioning and staff/tenant document-list
  boundaries.
- 12 web session/gateway tests passed: authentication, rejected ordinary-member login, HTTP-only cookies, Secure
  production cookies, hidden production development codes, refresh, logout, late access-cookie handling, CSRF checks,
  normalized hostnames, proxy scope, and upstream failures.
- 14 additional HTTP checks passed against the actual running Next.js gateway and PostgreSQL-backed API. These covered
  real OTP sessions, profile reload, current-role authorization, tenant denial, document tenant ownership, refresh, and
  logout/revocation.
- 10 post-UI database assertions passed. They verified organization status/branding, independent approval/rejection in
  two organizations, document review, active initial role, revoked test role, resolved restriction, restored account,
  and all corresponding audit event types.
- Browser workflows passed: sign-in, session restoration on reload, organization creation/branding/status persistence,
  tenant switching, document review, approval/rejection, duplicate-role error, role grant/revocation, restriction
  imposition/resolution, audit filtering/pagination, coordinator-only navigation, denied volunteer login, and logout.
- Production web build/type checks/lint, API build, and standalone API lint passed.

All browser mutations used six fictional identities in a separately initialized `ktb_interface_qa_*` PostgreSQL 18
database. The role-revocation and restriction checks were specifically approved for the fictional account after
automatic approval review requested clarification. No real account privileges or existing database data were changed.
The temporary services were stopped and their disposable PostgreSQL cluster removed after verification; the existing
PostgreSQL service remains running.

## Evidence and reproduction

- [Persisted organization and branding after reload](qa-evidence/admin-live-organizations.png)
- [Memberships change with tenant scope](qa-evidence/admin-live-tenant-scope.png)
- [Coordinator menu and organization scope](qa-evidence/admin-live-coordinator.png)
- [Ordinary member denied administration](qa-evidence/admin-live-access-denied.png)
- [Resolved fictional-account restriction](qa-evidence/admin-live-restrictions.png)
- [Real administrative audit events](qa-evidence/admin-live-audit-final.png)

Use the existing disposable launcher, then exercise the browser flows:

```powershell
Push-Location apps/api
node node_modules/@nestjs/cli/bin/nest.js build
Pop-Location
.\scripts\start-interface-qa.ps1
node scripts/test-dashboard-session.cjs
# After the documented UI mutations:
node scripts/verify-dashboard-ui.cjs
.\scripts\stop-interface-qa.ps1
```

The launcher pins the gateway to the local test API even if deployment environment variables are present. Fixture IDs
are in ignored `node_modules/.cache/interface-qa/fixture.json`. For normal web checks, run the installed Next.js build
and the package's `test` script (`node --test test/*.test.cjs`) inside `apps/web`.

## Merged service operations — 31 October 2026

`main` gained a parallel dashboard integration (PR #1) that kept bearer tokens in browser JavaScript and forwarded any
path through a Next.js rewrite. The merge keeps this branch's cookie session gateway and moves PR #1's extra screens
onto it:

- **Service operations** tab: central categories and global services (create, activate/deactivate, details), local
  proposals and central review, beneficiary eligibility and caregiver authorization review, operational zones,
  volunteer zone assignment, availability and skill verification, and the signed-in profile.
- **Settings & app builds** on organization rows (super admin): edit name/district/status, register app builds, and
  appoint organization roles.

PR #1's request workspace and local catalogue form were dropped in favour of the existing, tested Requests & matching
and Service catalogue sections. Central-only controls are hidden from local staff, and the API rejects them regardless.
The `/backend` rewrite and the `API_URL` setting were removed; the gateway reads `API_INTERNAL_URL`. Each new route
is allowlisted by method in the gateway.

On the API side, this branch's authorization changes cover PR #1's. One existing bug was fixed while testing:
`GET /organizations/:id/catalogue/proposals` was shadowed by the UUID-validated `:catalogId` route and always returned
400.

### Verification

- API: 344 unit/security tests; type check and lint pass. 36 real-PostgreSQL booking/concurrency tests pass.
- Dashboard: 20 tests, including per-method gateway allowlist checks; production build, lint and type check pass.
- Browser run against a disposable `ktb_interface_qa_*` database, as the fictional super admin and coordinator. Every
  ported action above saved and reloaded correctly, and read-only database queries confirmed it. The coordinator saw
  only local controls; direct central writes returned 403 with readable messages.

Open question: appointing a role from Settings & app builds approves the target membership if it is not approved, even
from APPLIED, SUSPENDED or REJECTED, and assigns no membership number. This predates the merge.

## Remaining scope

Coordinator requests and matching were connected and tested in the next implementation; see
[Coordinator request dashboard](COORDINATOR_REQUESTS.md). Local catalogue settings and central skill rules followed;
see [Service catalogue dashboard](SERVICE_CATALOGUE_DASHBOARD.md). Eligibility, caregiver authorization and zone
screens arrived with the merge above. Historical member-assignment dates and native Android dependency availability
remain as reported in the earlier interface QA. Nothing has been deployed or published.
