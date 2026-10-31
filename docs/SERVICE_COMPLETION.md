# Service start, finish and confirmation

A volunteer records that they started and finished an accepted assignment.
Someone other than that volunteer then confirms the help was given. Migration
`1729118400006-ServiceCompletion` adds the columns to `volunteer_assignments`:
`started_at`, `finished_at`, `reported_minutes`, `completion_notes`,
`confirmed_at`, `confirmed_by_user_id` and `confirmed_minutes`. Database checks
keep the order (start, then finish, then confirm). They also limit reported
minutes to 1–720 and keep confirmed minutes at or below the reported minutes.

| Endpoint (under `/api/organizations/:id`) | Who | Rule |
|---|---|---|
| `POST assignments/:assignmentId/start` | The assigned volunteer | Assignment `ACCEPTED`; request `PARTIALLY_ACCEPTED`, `FULLY_MATCHED` or `IN_PROGRESS`; no earlier than 60 minutes before the scheduled start. Sets the assignment and request to `IN_PROGRESS`. |
| `POST assignments/:assignmentId/finish` | The assigned volunteer | Assignment `IN_PROGRESS`. Optional `minutes` (default: whole minutes since start) and `notes`. Minutes may not exceed the longer of the elapsed time and the expected duration, which allows a late Start. Sets the assignment to `COMPLETED`. |
| `POST requests/:requestId/assignments/:assignmentId/confirm` | Beneficiary, authorized caregiver, coordinator or administrator | Assignment finished and not yet confirmed. Optional `minutes`, at most the reported minutes. The volunteer can never confirm their own service, even with a coordinator role. |

The request becomes `COMPLETED` once no assignment is still accepted, in
progress, or finished but unconfirmed, so a team request waits for every
helper. Each step writes an audit event: `SERVICE_STARTED`, `SERVICE_FINISHED`
or `SERVICE_CONFIRMED`. The confirmation event records the confirmer's role and
both minute values. A started request can no longer be cancelled or
rescheduled, and the volunteer can no longer withdraw.

Time credits are not yet paid on confirmation. The confirmed minutes are stored
so that a later ledger can pay each assignment exactly once.

## Checks

- `scripts/test-matching-concurrency.ps1`: the PostgreSQL suite covers the full
  lifecycle and its time and minute limits. It also checks that only the
  assigned volunteer can finish, that self-confirmation is refused for a
  volunteer who is also a coordinator, that team requests stay open until every
  helper is confirmed, and that withdrawal and cancellation are refused after
  the start.
- On 31 October 2026, an HTTP walk-through against the disposable interface QA
  API passed all 15 of its checks. It created a request, dispatched it, started
  and finished it, had the volunteer's confirmation refused, and had the
  caregiver confirm it.
