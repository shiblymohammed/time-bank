# Interface QA — 31 October 2026

The live member interface passed the browser-based flows below against the actual NestJS API and a separate PostgreSQL
18 database. The web admin dashboard did not pass live operational testing: it remains a local-state prototype. Native
Android testing was blocked before app installation by unavailable build dependencies.

## Environment and scope

- Six fictional identities: beneficiary, volunteer, caregiver, applicant, coordinator, super admin; two fictional
  organizations.
- All five database migrations applied to a fresh, disposable cluster. Existing PostgreSQL service/data were not used.
- Real HTTP requests, JWT sign-in, current database permissions, matching, transactions, and audit persistence; no
  mocked API responses in the browser flows.
- Development OTPs used the local mock SMS provider. This does not verify external SMS delivery.
- Member interface: a temporary Flutter web target built from a copy of the current `lib` and assets, pointed at the
  local API. The original project platforms and dependencies were preserved.
- Web admin: the existing Next.js dashboard, tested in the browser as implemented.
- Screenshots below use the browser's actual 1280×720 viewport. A requested viewport override did not take effect; these
  are not phone-width or native-device evidence.

## Member interface results

| Feature                                          | Result and observed evidence                                                                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OTP sign-in and roles                            | Pass: separate beneficiary, volunteer, applicant, and caregiver sessions used server-generated codes. Volunteer navigation appeared only for the volunteer.                                                  |
| Catalogue and manual request creation            | Pass: beneficiary opened the live catalogue/details and created a request with manually entered address, ward, postal code, and start time. The request appeared in the request list.                        |
| Matching and acceptance                          | Pass: a new offer appeared in the independent volunteer session. Acceptance changed the beneficiary's request to FULLY_MATCHED after refresh.                                                                |
| Rescheduling an accepted request                 | Pass: changing the time returned the request to MATCHING_ACTIVE, cancelled the old commitment, and created a fresh offer.                                                                                    |
| Explicit reconfirmation                          | Pass: the dialog displayed previous/new times. Going back left the offer pending. Confirming the current offer created an accepted booking.                                                                  |
| Stale-screen acceptance                          | Pass: the beneficiary changed the time again while the volunteer's confirmation dialog was open. Confirming that stale dialog displayed the server conflict and refreshed the offer list to the newest time. |
| Withdrawal                                       | Pass: a confirmed booking became WITHDRAWN and no longer had a withdrawal action.                                                                                                                            |
| Availability                                     | Pass: travel radius 3.5 and wards 1,2 survived save and reopening; database values verified as numeric and JSON array.                                                                                       |
| Cancellation                                     | Pass: the beneficiary cancelled the future rescheduled request with a reason/notes; the list and database showed CANCELLED.                                                                                  |
| Pending applicant gating                         | Pass: applicant saw APPLIED/approval required, no enabled service catalogue, and no volunteer navigation.                                                                                                    |
| Document reference submission                    | Pass: applicant submitted a fictional storage reference. Database contained one ADDRESS_PROOF record with PENDING review. Binary file upload remains unavailable.                                            |
| Caregiver recipient discovery and proxy creation | Pass: only the authorized membership number was shown, with no recipient phone/user details. A proxy request was saved with CAREGIVER_PROXY and generated an offer.                                          |
| Offer decline                                    | Pass: volunteer declined the caregiver-generated offer; UI and database showed DECLINED.                                                                                                                     |
| Logout                                           | Pass: logout returned to sign-in. Two completed UI logout actions corresponded to revoked authentication sessions in the database.                                                                           |

The final database contained two requests, two reschedule-history records, two cancelled old assignments, one withdrawn
assignment, one declined assignment, and no accepted assignments. This confirms that successful UI messages reflected
persisted state.

## Admin dashboard findings

| Priority | Finding                                                 | Browser reproduction                                                                                                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1       | Operational actions have no live persistence            | Created `QA_BROWSER` municipality and approved a sample membership. Both appeared to succeed, then disappeared/reverted on reload. The real database retained exactly the two seeded organizations and the applicant remained pending. Restriction resolution similarly changed only the preview page. |
| P1       | Dashboard has no real admin sign-in/session integration | Dashboard opens as a sample “Super Admin.” Its only fetch targets `/api/v1/admin/overview` with obsolete preview headers. That URL returns 404; the real endpoint is `/api/admin/overview` and requires a JWT.                                                                                         |
| P1       | Tenant selector does not scope the tables               | Selecting Kozhikode changed the selection, but Kottakkal memberships remained visible. The selected value is not used to filter/query membership data.                                                                                                                                                 |
| P2       | Audit explorer shows static records                     | Municipality creation, membership approval, and restriction resolution did not appear in the displayed audit trail. The explorer retained its three sample rows.                                                                                                                                       |
| P2       | New request/matching controls are absent                | There are no live dashboard interfaces for request rescheduling, offer/booking management, catalogue policy, eligibility, caregiver authorization, or operational zones. These features cannot be validated through this admin UI yet.                                                                 |

The dashboard displayed 142 users, 3 organizations, and 8 pending memberships while the actual fixture database reported
6 users, 2 organizations, and 1 pending membership. Backend protection was verified separately: correct admin JWT → 200,
ordinary volunteer → 403, anonymous → 401; cross-organization volunteer access → 403. These frontend gaps do not
establish an API authorization bypass.

## Member display finding

**P2: historical assignment cards show the request's latest time.** After two reschedules, cancelled cards displayed the
newest scheduled date instead of the time of their original offer/commitment. Status remained CANCELLED and stale
acceptance was correctly rejected, but the history can mislead users. Preserve/expose the schedule associated with each
assignment and use that date for historical cards.

## Native Android blocker

The installed `Medium_Phone` Android emulator booted successfully. The normal test run failed before installing the app:
Gradle 9.1.0 could not be downloaded. A temporary switch to cached Gradle 9.2.0 also stalled on missing Android/Kotlin
build dependencies and was stopped. The original Gradle wrapper was restored, and the emulator was stopped. Native UI,
keyboard behavior, device networking, and installation are therefore **not marked as passed**.

`integration_test/live_api_test.dart` was added for the volunteer flow and pending-applicant flow. It is prepared for
rerunning against the disposable fixture once native dependencies are available; it has not passed on an emulator in
this run.

## Evidence

- [Saved beneficiary request](qa-evidence/member-request-created.png)
- [Changed-time confirmation](qa-evidence/member-reconfirm-time.png)
- [Stale offer rejected and list refreshed](qa-evidence/member-stale-offer.png)
- [Cancelled request](qa-evidence/member-cancelled.png)
- [Pending applicant gate](qa-evidence/member-pending-access.png)
- [Caregiver membership-number recipient](qa-evidence/member-caregiver-recipient.png)
- [Caregiver request list](qa-evidence/member-caregiver-requests.png)
- [Admin preview creation](qa-evidence/admin-created-preview.png)
- [Admin approval reverted after reload](qa-evidence/admin-after-reload.png)
- [Static admin audit explorer](qa-evidence/admin-audit-preview.png)

## Reproduce

With the existing local dependencies and a built API:

```powershell
Push-Location apps/api
node node_modules/@nestjs/cli/bin/nest.js build
Pop-Location
.\scripts\start-interface-qa.ps1
node scripts/interface-qa-http.cjs
```

The launcher uses installed PostgreSQL 18 binaries and requires ports 3000, 3001, and 15449 to be free. It writes
fixture IDs and logs under ignored `node_modules/.cache/interface-qa`. Only the new test database is seeded. For
Android, supply API_URL=http://10.0.2.2:3001 and QA_ORG, QA_CATALOGUE, QA_BENEFICIARY from fixture.json to the
integration test. The browser fallback used an untracked temporary web target, not a permanent platform change.

After testing:

```powershell
.\scripts\stop-interface-qa.ps1
```

Before new product features, connect the dashboard's real authentication and administrative APIs, implement actual
tenant scoping, fix historical dates, and rerun both native Android and dashboard end-to-end checks.

## Follow-up: connected dashboard

The subsequent implementation replaces the prototype's existing administration sections with real authentication,
organization/branding writes, membership and document review, role management, restrictions, and scoped audit records.
Those workflows were re-tested against a disposable database. See [Live admin dashboard](LIVE_ADMIN_DASHBOARD.md) for
the updated results; the prototype findings above remain the historical baseline. Native Android dependency availability
and historical member-assignment dates remain separate issues.
