# Volunteer booking concurrency

Offer acceptance and coordinator dispatch now reserve a volunteer using their global user identity. Memberships in
different organizations share that reservation boundary.

Both operations run at PostgreSQL `READ COMMITTED` isolation. They lock the user row before the request row, then check
the latest accepted and in-progress assignments across all of that person's memberships. Intervals are half-open: a job
ending at 11:00 does not conflict with one starting at 11:00.

Acceptance reloads the offer after obtaining the locks, so a concurrent retry cannot increment staffing or
matching-round counters twice. Coordinator retries likewise return the existing acceptance. The request lock still
protects the final available position when different people accept at the same time.

Booking also rechecks active account status, account restrictions, approved membership, and the volunteer role. Terminal
or started requests do not accept new bookings; coordinators can still resolve escalated requests. Expiry and
slot-filled responses commit their offer-state changes before returning a conflict. Successful booking, request changes,
round counters, and their audit event share one transaction.

## Real PostgreSQL verification

The integration suite applies all five migrations to a disposable database. It uses the real matching service, audit
service, TypeORM repositories, and independent database connections. A blocker transaction holds a row until the
database reports both booking operations waiting; the race tests do not depend on a timing-only sleep.

The scenarios cover overlapping offers, the same human in multiple organizations, acceptance versus manual dispatch,
simultaneous manual dispatch, duplicate retries, final-slot contention, back-to-back jobs, different volunteers,
in-progress work, cancelled requests, revoked roles, suspension, historical assignments, expiry, and rollback after the
audit row has already been inserted.

Local verification used PostgreSQL 18. The added GitHub Actions job targets PostgreSQL 17, matching the existing
container stack; that remote job has not been run locally.

## Run on Windows with installed PostgreSQL binaries

From the repository root:

```powershell
.\scripts\test-matching-concurrency.ps1 -PostgresBin 'C:\Program Files\PostgreSQL\18\bin'
```

The runner builds shared types, creates a new cluster under `node_modules/.cache`, chooses a separate loopback port,
creates a dedicated test database, runs the suite, then stops its server and removes only that run's generated data
directory. Diagnostic logs remain in the ignored cache. The installed PostgreSQL service is not used.

For a separately provisioned disposable database:

```powershell
$env:MATCHING_TEST_DATABASE_URL = 'postgresql://test_user:password@localhost:5432/ktb_matching_test_local'
pnpm --filter @ktb/shared-types build
pnpm --filter @ktb/api test:matching:integration
```

The suite refuses the normal `DATABASE_URL` and requires an explicit database name starting with `ktb_matching_test_`.
It resets fixture tables between tests, so that connection must point to disposable test data. Normal unit tests remain
database-free.

## Rescheduling and confirmation

Changing a request time now locks the request and updates its schedule, history, matching rounds, offers, and audit in
one transaction. Started and terminal requests cannot move. The new time must be in the future; submitting the same time
is a no-op.

All existing OFFERED and ACCEPTED assignments become CANCELLED history. Previously accepted volunteers receive new
OFFERED assignment IDs, linked to the reschedule record. Pending reconfirmations are replaced again if the time changes
twice. Staffing and accepted-round counters restart at zero, and remaining places reopen to matching. Pending offers
reserve no volunteer time; accepting one checks current cross-organization availability again.

Requests store the latest reschedule ID. Acceptance checks that ID before handling retries, so an old accepted offer or
stale screen cannot consent to a changed time. Coordinator dispatch after a reschedule returns an OFFERED assignment and
requires the volunteer to accept it. The assignments/mine response includes a restricted reschedule summary with
previousStartTime and newStartTime. The mobile screen displays those times and requires explicit confirmation; a
conflict refreshes the stale list.

Matching, radius expansion, round progression, cancellation, and withdrawal share the request-lock boundary so they
cannot save an old schedule over a reschedule. Global volunteer booking uses FOR NO KEY UPDATE on the user row: bookings
serialize while foreign-key references remain compatible, including when the rescheduler is also the volunteer.

The migration also widens cancellation notice hours to NUMERIC(10,2), allowing cancellations more than 999.99 hours
ahead. Reverting the migration requires those values to fit the previous NUMERIC(5,2) range; rollback deliberately fails
rather than truncating history.

Real-database coverage includes reschedule/accept races, a rescheduler who is also the volunteer, stale matching,
cancellation races, changed-time overlap, multi-volunteer team counters, repeated reschedules, unchanged retries,
past-time rejection, coordinator reconfirmation, and late-failure rollback.

## Remaining workflow work

Automatic expiry/progression scheduling, replacement matching after withdrawal, manual skill validation, and the
complete Android-to-server journey remain separate work. The migration must be applied before deploying the updated API;
apply it and exercise the flow in staging before production.
