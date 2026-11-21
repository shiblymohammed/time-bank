# Time credits on confirmation

Confirming a finished service pays the volunteer in universal time credits, in the same transaction as the confirmation.
If the payment fails, the confirmation is rolled back too, so no confirmed service is left unpaid. Migration
`1729118400007-TimeCreditLedger` adds the append-only `time_credit_ledger` table (FR-TIME-04, ITB-009).

## Amount (FR-TIME-02)

`credits = confirmed minutes / 60 × base_credit_rate_hourly × credit_multiplier`, rounded to hundredths. Both rates come
from the central service definition, and the calculation uses whole hundredths so the result matches `NUMERIC(10,2)`
exactly. When `allow_partial_hours` is false, only whole hours count. A result of zero (under an hour of such a service)
posts nothing.

Examples at the default rates: 20 minutes pay 0.33 credits, 40 minutes 0.67, and 90 minutes 1.5. With a multiplier of
1.5, 90 minutes pay 2.25.

## Ledger rules

- Each row records the wallet, the amount, the spendable balance after it, the type (`SERVICE_EARNED`), the originating
  organization, the request, the assignment and the minutes.
- `uq_ledger_assignment_payment` pays each assignment at most once for each type.
- A trigger rejects every `UPDATE` and `DELETE`. Check constraints keep amounts non-zero, earnings positive and balances
  non-negative.
- A volunteer with no wallet yet (an account older than automatic wallet creation) gets one at the first payment.
- If the wallet is not `ACTIVE`, or the account is not active, the credits go to `frozen_credits` and the row is marked
  `held`. The spendable balance is unchanged, and the history is kept (FR-TIME-05).
- Each payment writes an audit event, `TIME_CREDITS_EARNED` or `TIME_CREDITS_HELD`. The `SERVICE_CONFIRMED` event and
  the confirm response carry `creditsEarned` and `creditsHeld`.

## Community events

Migration `1729118400042-CommunityEventCredits` lets a community event pay credits for attendance.

- Staff choose **Members earn time credits for attending** when publishing (`earnsCredits: true`). Other events pay
  nothing. A credit-earning event needs a check-in location (`latitude`, `longitude`) and a range
  (`checkInRadiusMeters`, 50–1000, default 200), added by migration `1729118400043-CommunityEventCheckIn`.
- Members sign up as before. Signing up alone earns nothing.
- **Venue QR code.** Every event gets a secret check-in code (`checkin_token`, 64 hex characters, migration
  `1729118400045-CommunityEventQrCheckIn`). Staff open **Show check-in QR** on the dashboard event card, which calls
  `GET .../events/:eventId/check-in-qr` (staff only, `no-store`). It returns the QR as an SVG; its text is
  `ktb-event:<eventId>:<secret>`. The secret is never part of a member-facing or staff list response. The dashboard
  opens the QR as soon as a credit event is published, and the organiser shows or prints it at the venue. The QR route
  stops working once the event has ended or been cancelled.
- **Check-in.** While the event is running (from its start until its end, never earlier or later), a member taps
  **Scan QR to check in** (or **Scan QR to join** if they have not signed up) and scans the venue QR. The app then reads
  the phone's position and sends it with the scanned secret to `POST .../events/:eventId/check-in`
  (`{ latitude, longitude, accuracyMeters, code }`). The server accepts the check-in only if the secret matches this
  event (compared in constant time) and the measured distance is within the range, plus the phone's reported accuracy up
  to 100 m. A member who had not signed up joins on the spot if the event is not full, in the same locked step, so a
  walk-in and a sign-up cannot both take the last place. The check-in time, position and distance are stored, and the
  audit entry records that it was a QR check-in. A second check-in is harmless and changes nothing.- **Event ended.** After the end time, the card shows "Event ended", check-in closes, and members who checked in see
  that their coordinator will approve their time.
- **Approval.** In the dashboard, staff open **Review and approve attendance**. Each person's limit runs from their
  check-in (or the start, if they checked in on time) until the event ended. Staff approve one person at a time
  (`POST .../attendees/:membershipId/confirm` with `{ minutes }`, up to that limit), or everyone who checked in at once
  (`POST .../attendees/confirm-all`, with an optional `maxMinutes` cap that never raises anyone above their own limit).
  Members who did not check in cannot be paid; `chk_event_confirmed_after_checkin` enforces this for new rows.
- Events published before check-in existed (no location) keep the original manual confirmation, up to the event
  length.
- **Event images.** Staff may attach one cover image when publishing any event (migration
  `1729118400044-CommunityEventPhotos`). The publish request is JSON as before, or `multipart/form-data` with the
  same fields plus a `file` part. Only staff reach image processing; the server accepts JPEG, PNG and WebP up to
  5 MB (not animated), re-encodes it to a JPEG no larger than 1440 px, and drops all embedded metadata, including
  location. The event and its image are saved in one transaction, so a failed publish leaves neither. An image
  cannot be changed after publishing. A retried publish with the same id must carry the same details and the same
  image, otherwise it is refused (409). Event lists report `photo_version` (null when there is no image), and
  approved members of the event's community fetch it from `GET .../community/events/:eventId/photo`. The dashboard
  and the app show it on each event card.
- `scripts/event-photos-qa.cjs` checks the image rules against the disposable interface-QA API and database.
- Events pay the fixed Instant Help rate: one credit per hour, partial hours counted (90 minutes = 1.5 credits).
- The confirmation and its `EVENT_EARNED` ledger entry commit in one transaction. `uq_ledger_event_earning` pays each
  wallet at most once per event, and `chk_ledger_event_earning` requires the event reference.
- A confirmation is final. Repeating it with the same minutes returns `replayed: true` and pays nothing; a different
  amount is refused. A confirmed member can no longer withdraw from the event.
- Staff cannot confirm their own attendance, and members cannot confirm anyone's.
- Held wallets and restricted accounts receive the credits as frozen credits, like visit earnings.
- Confirmed event minutes count in the member's minutes given, the monthly earnings chart, and the community's
  monthly verified time (`eventMinutes` is also returned separately). They are not counted as completed visits.
- `scripts/event-credits-qa.cjs` checks all of this against the disposable interface-QA API and database.
- Location is self-reported by the phone, so a determined member could fake GPS. The venue QR adds a second proof, but a
  photo of it could be shared, so it is only as private as the poster. The stored check-in position and distance, and
  staff approval, are the safeguards; the server does not trust a check-in it did not measure.

Credits can also be given away; see `CREDIT_DONATIONS.md`. Voluntary assistance spending, fraud review and frozen-credit
release are described in [CREDIT_CONTROLS.md](CREDIT_CONTROLS.md). Eligible beneficiaries are never automatically
charged.

## History

`GET /api/wallet/transactions?page&limit` (any signed-in user; `limit` up to 100) returns the caller's own
`balanceCredits`, `frozenCredits` and wallet `status`, with entries newest first. Each entry carries its amount, balance
after, held flag, minutes, date, originating organization, request number and service name. The wallet is universal, so
this endpoint is not scoped to an organization.

## Checks

- `scripts/test-matching-concurrency.ps1`: the PostgreSQL suite applies all ten migrations. It checks the rate and
  multiplier, single payment, the append-only trigger and the unique key, whole-hours-only services, held credits for a
  frozen wallet, and the history endpoint's contents.
- `src/time-ledger/time-ledger.service.spec.ts` covers the rounding.
- On 1 November 2026, an HTTP walk-through against the disposable interface QA API passed all 22 of its checks. It
  confirmed 40 minutes and saw 0.67 credits in the volunteer's history and profile. The confirmer was not paid, and a
  repeated confirmation paid nothing more.
- `scripts/reset-interface-qa-requests.cjs` also sets QA wallet balances back to zero, because removing requests removes
  their ledger rows.
