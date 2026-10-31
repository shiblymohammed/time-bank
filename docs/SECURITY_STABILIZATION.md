# Permission and live API stabilization — 30 October 2026

This pass reconciles the existing role-hierarchy implementation, authorization changes, and test updates from the
working tree. It completes the permission fixes identified in the project review. Further matching and delivery work
remains before release.

## Existing changes reviewed

- Retained `RoleHierarchyService` and its module registration, service integrations, and hierarchy tests.
- Updated test fixtures to match current service dependencies and asynchronous guard checks. Role-management success
  cases use an administrator rather than a coordinator.
- Completed the unfinished authorization changes, including checks before membership approval is persisted and support
  for global administrators without local membership.
- Reviewed mobile commit `1f8f795` from 28 October in the separate Flutter repository. The default entry point now uses
  live APIs; demo mode is explicit. Its API client uses bearer authentication, tenant headers, request timeouts, shared
  refresh, and cancellation of retries after logout. The mobile CI artifact still explicitly builds demo mode.

## Enforced boundaries

- Local membership workflows reject global roles. Coordinators may approve lower operational roles; municipality
  administrators may manage coordinators and operational roles. Municipality administrator grants require global
  administrator authority.
- Approval and role grants reject self-escalation before changing records. Revocation also enforces the role hierarchy;
  removing one's own operational role is still allowed.
- Global administrative routes reload account status, active restrictions, and current global role grants. JWT role
  claims cannot override those checks. Administrators cannot resolve restrictions on their own accounts.
- Matching expansion and progression look up requests using both the request ID and the authorized organization ID.
- Volunteer availability, GPS, skills, and zone records require ownership or staff authority. Target memberships must
  belong to the specified organization.
- Beneficiary eligibility and caregiver lists require beneficiary ownership, staff authority, or an approved caregiver
  relationship. A caregiver sees only their own relationship. These reads no longer load related user entities or
  document storage details.
- Caregiver authorization submissions require a participating beneficiary/caregiver or staff member. Supporting
  documents must be local and belong to the relationship; non-staff submitters may use only their own documents.
- Coordinator request creation and cross-organization matching options require staff authority. An idempotency key
  cannot expose another creator's request to an ordinary member.
- Development identity headers require `AUTH_ALLOW_DEV_HEADERS=true` and a development or test environment. The default
  is disabled. Production rejects this bypass even when the flag is true, and header-supplied global admin claims are
  ignored. Development identities still require current database permissions.

## Live mobile compatibility and matching

- Added `GET /api/organizations/:id/assignments/mine` and `GET /api/organizations/:id/caregivers/mine`, which the new
  mobile client expected but this backend did not provide. Both derive membership from the authenticated user and
  require current volunteer or caregiver authority. Responses include only the caller's local assignments or approved
  request-capable care relationships.
- Assignment summaries omit beneficiary notes and related identities. Recipient summaries omit document storage details
  and user profiles. Mobile recipient labels now use membership numbers, with a widget regression test for this response
  shape.
- Initial matching reloads missing catalogue relations from the saved request, scoped to the organization. It fails
  closed if policy data is unavailable, enforcing coordinator-only services and verified-skill requirements on the
  creation path.
- Repeating an already accepted coordinator assignment returns it without incrementing capacity or changing staffing
  status. A two-person request cannot become fully matched by assigning the same person twice.

## Verification

- API tests: **325 passed across 28 suites**, including 43 combined guard/service permission and member-discovery
  regressions, seven development-header isolation checks, and four additional matching regressions.
- **API lint, API compilation, web TypeScript checks, and Flutter analysis passed.**
- **All 36 Flutter tests passed**, including the new caregiver recipient widget check.
- **19 PostgreSQL concurrency integration tests passed** against a freshly initialized native PostgreSQL 18 instance.
  See [booking concurrency](MATCHING_CONCURRENCY.md) for the locking rules, scenarios, CI job, and reusable local
  runner.

The regression suite exercises signed tokens, actual controller guard metadata, real authentication/authorization
guards, and actual services. Persistence is replaced with in-memory repositories. Tests cover the reported bypasses and
legitimate coordinator, administrator, beneficiary, volunteer, and caregiver actions.

Booking concurrency is now verified against real PostgreSQL. Full HTTP and Android integration remain separate
verification. Existing database role grants and assignments also require review before release; the code cannot infer
whether previously issued privileges or offers were legitimate. The mobile tests use controlled HTTP responses rather
than a live server.

The shell currently resolves pnpm 11 while the repository requires pnpm 12. Verification uses the already installed
project tools through Node, without installing dependencies or changing the lockfile. Use the required pnpm version for
the normal repository commands.

## Next implementation priorities

1. Finish manual skill validation and cross-organization offer routing. Acceptance and coordinator dispatch now check
   schedule conflicts across all of the user's memberships, with current role, account, restriction, and request-state
   checks.
2. Finish expiry/progression scheduling and replacement matching. Reschedule reconfirmation is now atomic and covered by
   real PostgreSQL races; see MATCHING_CONCURRENCY.md.
3. Repair clean database initialization, CI, production images/configuration, migrations, and health checks; validate a
   fresh installation against PostgreSQL.
4. Complete real OTP delivery and rotate refresh tokens in both the backend and mobile client.
5. Validate the implemented member journey against PostgreSQL on an Android device. The web administration dashboard now
   uses real privileged APIs for its existing sections; see LIVE_ADMIN_DASHBOARD.md. Add the remaining coordinator
   service-workflow screens separately.
