# Safety alerts

Part 1 of Milestone 7 (FR-SAFE-01, FR-SAFE-02, BR-10, D#70 to D#74).

## What happens

1. During a visit, the volunteer, the beneficiary or an authorized caregiver presses **Safety alert**, adds a note if
   they want, and chooses to pause or end the visit. The app also offers a call to 112.
2. Coordinators and Municipality Admins get a push, except any who are on the visit themselves. The panel's **Safety
   alerts** screen shows who raised it, the note and both phone numbers, and refreshes every 30 seconds.
3. **Paused visit:** it stays `IN_PROGRESS` with `paused_at` set. It cannot be finished, paid, reminded or closed
   automatically. A coordinator can **Allow restart**, after which the volunteer chooses to restart. Either person can
   end it instead, at any time.
4. **Ended visit:** it becomes `COMPLETED` under review with the reason `SAFETY_ALERT`. No credits move until a
   coordinator uses Pay for visit or Not delivered in Requests & matching. The coordinator then closes the alert.

An alert covers the whole request. If a request ever has several volunteers, one press pauses or ends all of them, and
one volunteer restarts all of them. Milestone 5 needs to revisit this.

## Time and credits

- Paused time is left out of the time worked (`paused_seconds`), for the Finish default, the review check and any
  recorded minutes.
- A visit ended by a coordinator is recorded as requested by whoever raised the alert, so that the same coordinator can
  decide its credits.

## Confidentiality

- Both people get the same messages, which never say who raised the alert or why. Push text is generic because it shows
  on locked screens.
- Members see `safetyPaused`, `restartAllowed` and `endedEarly`, and `SAFETY_PAUSED` as the request stage. The
  `SAFETY_ALERT` review reason is hidden from them.
- The note is stored only on `safety_alerts` and stays out of `audit_events`. Staff notes do go into the audit trail.
- Staff who are on the visit cannot see or handle its alerts, and another coordinator, Admin or Super Admin must.

## API

| Call                                                         | Who                                 |
| ------------------------------------------------------------ | ----------------------------------- |
| `POST /organizations/:id/requests/:requestId/safety-alerts`  | Someone on the visit                |
| `POST /organizations/:id/requests/:requestId/safety-restart` | `restart: true` volunteer; `false` either person |
| `GET /organizations/:id/safety-alerts?open=false`            | Staff; closed alerts are left out unless `open=false` |
| `POST /organizations/:id/safety-alerts/:alertId/acknowledge` | Staff                               |
| `POST /organizations/:id/safety-alerts/:alertId/allow-restart` | Staff                             |
| `POST /organizations/:id/safety-alerts/:alertId/end-visit`   | Staff                               |
| `POST /organizations/:id/safety-alerts/:alertId/close`       | Staff, once the visit has ended     |

A `clientOperationId` on a new alert makes a retry find the alert already raised.

## Limits

- An alert can be raised only once a visit has started. A problem before Start or after Finish goes to the coordinator
  by phone, until complaints (Milestone 7, part 2) are built.
- An app that cannot reach the server says "Not sent yet" and offers a retry and a call to 112. It does not keep the
  alert to send later: the offline queue is Milestone 8.
- Staff are reached only by push and by the panel's list. If nobody responds, nothing escalates further, so the pilot
  still needs a named person with a phone that is answered.
