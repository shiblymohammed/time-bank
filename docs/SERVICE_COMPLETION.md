# Service start, finish and confirmation

A volunteer records that they started and finished an accepted assignment. Someone other than that volunteer then
confirms the help was given. Migration `1729118400006-ServiceCompletion` adds the columns to `volunteer_assignments`:
`started_at`, `finished_at`, `reported_minutes`, `completion_notes`, `confirmed_at`, `confirmed_by_user_id` and
`confirmed_minutes`. Database checks keep the order (start, then finish, then confirm). They also limit reported minutes
to 1–720 and keep confirmed minutes at or below the reported minutes.

| Endpoint (under `/api/organizations/:id`)                    | Who                                                             | Rule                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST assignments/:assignmentId/start`                       | The assigned volunteer                                          | Assignment `ACCEPTED`; request `PARTIALLY_ACCEPTED`, `FULLY_MATCHED` or `IN_PROGRESS`; no earlier than 60 minutes before the scheduled start. Sets the assignment and request to `IN_PROGRESS`.                                                |
| `POST assignments/:assignmentId/finish`                      | The assigned volunteer                                          | Assignment `IN_PROGRESS`. Optional `minutes` (default: whole minutes since start) and `notes`. Minutes may not exceed the longer of the elapsed time and the expected duration, which allows a late Start. Sets the assignment to `COMPLETED`. |
| `POST requests/:requestId/assignments/:assignmentId/confirm` | Beneficiary, authorized caregiver, coordinator or administrator | Assignment finished and not yet confirmed. Optional `minutes`, at most the reported minutes. The volunteer can never confirm their own service, even with a coordinator role.                                                                  |

The request becomes `COMPLETED` once no assignment is still accepted, in progress, or finished but unconfirmed, so a
team request waits for every helper. Each step writes an audit event: `SERVICE_STARTED`, `SERVICE_FINISHED` or
`SERVICE_CONFIRMED`. The confirmation event records the confirmer's role and both minute values. A started request can
no longer be cancelled or rescheduled, and the volunteer can no longer withdraw.

Confirmation pays the volunteer's time credits for the confirmed minutes in the same transaction; see `TIME_CREDITS.md`.

## Visits nobody finishes

A volunteer may forget to tap Finish, or their phone may die. The matching job, which runs every 30 seconds, looks for
visits still in progress past their expected end, not counting time paused by a safety alert. Paused visits are left to
the safety alert.

- **30 minutes past the expected end:** one push to the volunteer, "Still helping?". The app's visit card also says the
  visit is running long.
- **2 hours past the expected end:** one push to the community's coordinators and administrators. The visit joins their
  **Needs review** list, and the panel shows "Running long" with the start time and expected length. The audit log
  records `LONG_VISIT_ALERTED`.

The coordinator calls the volunteer, then uses **Pay for visit** (entering the minutes) or **Not delivered**, the same
decision used for disputes (`POST requests/:requestId/assignments/:assignmentId/resolve`). If the volunteer finishes
first, the visit leaves the list by itself. Each message is sent once per visit, recorded in `long_visit_reminded_at`
and `long_visit_alerted_at` (migration `1729118400026-LongVisits`).

This also covers a finish saved offline that is over 12 hours old: the server refuses it and the volunteer is told to
call their coordinator, who already has the visit on their list. See [offline use](OFFLINE.md).

## Checks

- `scripts/test-matching-concurrency.ps1`: the PostgreSQL suite covers the full lifecycle and its time and minute
  limits. It also checks that only the assigned volunteer can finish, that self-confirmation is refused for a volunteer
  who is also a coordinator, that team requests stay open until every helper is confirmed, and that withdrawal and
  cancellation are refused after the start.
- On 31 October 2026, an HTTP walk-through against the disposable interface QA API passed all 15 of its checks. It
  created a request, dispatched it, started and finished it, had the volunteer's confirmation refused, and had the
  caregiver confirm it.
