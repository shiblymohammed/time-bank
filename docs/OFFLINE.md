# Offline use (Milestone 8)

Volunteers often lose signal inside houses and hospitals. The app now keeps working for the things a volunteer does
during a visit, and sends them when the signal comes back. Everything that moves credits or coins still needs a
connection (FR-OFF-04, BR-08).

## What works with no signal

| On the phone                | With no signal                                                                 |
| --------------------------- | ------------------------------------------------------------------------------ |
| Opening the app             | Opens on what the phone last saw, with "Offline: showing what you had at …"    |
| My visits                   | Shown as last seen, with unsent changes already applied                        |
| Start helping               | Saved on the phone; counts from the tap                                        |
| Finish helping, leave early | Saved on the phone; the visit ends at the tap                                  |
| Safety alert (pause or end) | Saved on the phone and sent by itself; never shown as sent until it is (AT-22) |
| Everything else             | Needs a connection, as before                                                  |

Accepting or declining offers, hand-over, asking for help, confirming help, gifts, the wallet and merchant codes all
stay online. Coordinators work in the web panel, which is always online, so offline registration by coordinators (the
first half of FR-OFF-01) is **not built, by decision of the project owner** on 9 November 2026.

## How sending works

- Each change gets an operation ID and the time it was tapped, and is kept encrypted on the phone (Android Keystore /
  iOS Keychain), like the sign-in token (D#47).
- The app sends waiting changes oldest first: straight away, every 30 seconds while it is open, when it comes back to
  the front, and after any other server call succeeds. It does not send while closed; a background service can come
  later if field tests need it.
- If the network or the server is down, sending stops and tries again later, so a later change never overtakes an
  earlier one.
- If the server refuses a change (for example, the visit was paused by a safety alert in the meantime), the change is
  marked **Not accepted** with the server's reason. Nothing is changed, and the volunteer is asked to tell their
  coordinator.
- "Waiting to send" (from the banner on any page) lists each change with its state: waiting, sent or not accepted
  (FR-OFF-02, D#99). Sent changes stay listed for a day.
- Signing out with changes waiting asks first, because signing out deletes them.
- When the server ends the session (signed out elsewhere, restricted, or the account
  [moved to a new number](PHONE_RECOVERY.md)), the app deletes what it last saw but keeps waiting changes for the same
  person's next sign-in.

## What the server checks

- **Once only (FR-OFF-03).** The server records each operation ID in `visit_operations`, per volunteer. The same ID sent
  again returns the current state and changes nothing. The same ID with different details is refused.
- **Times from the phone.** A time in the future (a phone clock running ahead) counts as now. A time more than 12 hours
  old is refused, and the volunteer is asked to tell their coordinator. A start never counts from before the offer was
  accepted, a team member's late start never counts from before the team started, and a finish never counts from before
  the start.
- **Marked for staff.** A change that arrives more than 2 minutes after the tap is recorded offline: the panel shows
  "Recorded offline" with the time it reached the server (`start_received_at`, `finish_received_at`), and the audit log
  says `recordedOffline`. A safety alert sent late shows when it was tapped (`raised_on_phone_at`) and when it arrived.
- **Late safety alerts.** An alert tapped during a visit that has since finished still reaches the coordinator, linked
  to the visits that were under way at the tap.

## Safety alerts with no signal

The alert screen says plainly: _Your coordinator has NOT been told yet. The alert is saved on this phone and will be
sent by itself as soon as there is signal._ It offers 112 and, if the community's app was built with
`--dart-define=COORDINATOR_PHONE=+91…`, a button to call the coordinator. A phone call needs no mobile data.

SMS and WhatsApp alerts (the rest of FR-OFF-05) are not built yet.

## Request keys

Fixed with this milestone: reusing a request's idempotency key with different details is now refused
(`409 This request key was already used for a different request`) instead of returning the earlier request.

## Known limits

- A visit whose finish never arrives reaches the coordinator's review list two hours after its expected end. See
  [visits nobody finishes](SERVICE_COMPLETION.md#visits-nobody-finishes).
- A finish saved before a safety pause that reached the server first is refused, since the visit is paused. It shows as
  Not accepted and the coordinator sorts it out.
- Data shown offline is only what the phone saw last; offers made meanwhile appear once there is signal.
- The airplane-mode test on a real phone is the last step before calling M8 done.

## Tests

- API: `visit-operations.spec.ts` (times, once-only, request details) and the database suite's `offline visits (M8)`.
- App: `test/offline_test.dart` (saving, order, retry, refusal, opening offline, alert wording, sign-out warning).
- Journey: `scripts/journey-qa.cjs`, steps "Offline: a finish tapped with no signal…" and "A request key reused…".
