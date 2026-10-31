# Coordinator request and matching dashboard

Implemented and locally verified on 2026-10-31. Nothing was deployed.

## Available workflow

The Requests & matching section uses the selected organization and current staff permissions.
Coordinators, municipality administrators and super administrators can:

- Filter and page service requests by status, urgency and ward.
- Search approved beneficiary memberships and create a request on their behalf, with an enabled
  service, manually entered address, duration and India start time. Each open creation form keeps
  an idempotency key across retries.
- Review staffing, assignments, matching round records and reschedule history.
- Search eligible local volunteers by phone or membership number. Results exclude inactive or
  restricted accounts, missing volunteer authority, missing verified skills, and overlapping
  accepted/in-progress commitments, including commitments through another organization.
- Dispatch an original request after explicitly confirming availability. Rescheduled requests
  return a confirmation offer; the volunteer must accept the changed time.
- Reschedule or cancel eligible requests with a reason, check progression, expand matching tiers,
  and escalate after the final tier. Started and terminal requests have no edit controls.

The backend rechecks skills at dispatch and retains the booking locks and conflict checks.
Matching snapshots use a consistent database transaction and contain selected staff-facing fields.
The dashboard gateway permits request routes and catalogue reads, while volunteer acceptance stays
in the member app. All displayed dashboard dates explicitly use Asia/Kolkata; invalid calendar
dates are rejected before conversion to UTC.

Progression is manual. This change does not add a background matching scheduler or new
catalogue, eligibility, caregiver or zone management screens. Round records show their stored
statuses; staffing totals are calculated from current assignment statuses.

## Verification

| Check | Result |
| --- | --- |
| Existing API unit/security tests | 327 passed |
| Dashboard session, gateway, date and status-feedback tests | 16 passed |
| Real PostgreSQL booking, reconfirmation and candidate-search tests | 35 passed |
| Saved browser workflow records and audit assertions | 12 passed |
| API build and lint | Passed |
| Dashboard production build, lint and type checks | Passed |

Browser tests used the disposable `ktb_interface_qa_*` database launched by
`scripts/start-interface-qa.ps1`, fictional coordinator +919000000101, beneficiary +919000000102
and volunteer +919000000103. No production data or existing PostgreSQL service data was changed.

Observed sequence:

1. Sign into the coordinator dashboard. Create QA Household Help for QA-BENEFICIARY at
   2030-01-01 10:00 IST, 60 minutes, address `Fictional QA community centre`, ward `1`, PIN `676503`,
   notes `Local request workflow QA`.
2. Review the real request and automatic offer. Dispatch QA-VOLUNTEER with the availability
   checkbox. Observe one accepted volunteer and a fully matched request.
3. Sign into the Flutter browser build as the separate volunteer account and open Volunteer.
4. Reschedule through the dashboard to 2030-01-01 12:00 IST with reason `Fictional QA time change`.
   Observe the old assignment cancelled, zero accepted volunteers and a fresh offer.
5. Dispatch again from the dashboard. Observe confirmation-offer feedback, with no action that
   accepts on behalf of the volunteer. Run Check progression, then Expand search; observe tier 2
   and 7 km.
6. Refresh the volunteer app. Accept the offer, review both old and new times, and select Confirm
   new time. Refresh the coordinator dashboard and observe one accepted volunteer at noon.
7. Cancel from the dashboard using reason code `QA_COMPLETE` and notes
   `Fictional local QA workflow complete`. Observe no remaining active commitments in either UI.
8. Filter by a different ward or matching-active status and observe no result. Restore ward 1,
   cancelled status and scheduled urgency to find the request.
9. Run `node scripts/verify-request-dashboard-ui.cjs` before stopping the disposable services.
   The verifier opens a read-only transaction and checks the actual persisted records and audits.

Screenshots:

- [Volunteer confirmation offer](qa-evidence/volunteer-request-reconfirmation-2026-10-31.png)
- [Coordinator staffing after confirmation](qa-evidence/coordinator-request-confirmed-2026-10-31.png)
- [Final cancelled request](qa-evidence/coordinator-request-cancelled-2026-10-31.png)

The member UI test used the existing temporary browser build of the Flutter source. This is
not native Android verification: the earlier unavailable Android build dependencies remain a
separate limitation. Historical cancelled cards in the member app still show the latest request
schedule, as documented in the earlier interface QA; the new coordinator view preserves offer
and acceptance timestamps and shows reschedule history separately.

Stop the temporary services with `scripts/stop-interface-qa.ps1` after verification. Evidence and
test scripts are retained; the disposable database is removed by the cleanup script.

Cleanup completed after this run: temporary API, dashboard, Flutter browser server and database
were stopped and the test cluster removed. The existing PostgreSQL 18 service remained running.
The final production dashboard build passed after the display and accessible-label cleanup.

Follow-up: historical member assignment dates were fixed, the Android build environment and
memory limits were repaired, and both native integration flows passed. See
[Assignment history and native QA](ASSIGNMENT_HISTORY_QA.md) for the final result and the
recorded connection interruption during the earlier native attempt.
