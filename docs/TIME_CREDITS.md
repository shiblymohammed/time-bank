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

Credits can also be given away; see `CREDIT_DONATIONS.md`.

## History

`GET /api/wallet/transactions?page&limit` (any signed-in user; `limit` up to 100) returns the caller's own
`balanceCredits`, `frozenCredits` and wallet `status`, with entries newest first. Each entry carries its amount, balance
after, held flag, minutes, date, originating organization, request number and service name. The wallet is universal, so
this endpoint is not scoped to an organization.

## Checks

- `scripts/test-matching-concurrency.ps1`: the PostgreSQL suite applies all nine migrations. It checks the rate and
  multiplier, single payment, the append-only trigger and the unique key, whole-hours-only services, held credits for a
  frozen wallet, and the history endpoint's contents.
- `src/time-ledger/time-ledger.service.spec.ts` covers the rounding.
- On 1 November 2026, an HTTP walk-through against the disposable interface QA API passed all 22 of its checks. It
  confirmed 40 minutes and saw 0.67 credits in the volunteer's history and profile. The confirmer was not paid, and a
  repeated confirmation paid nothing more.
- `scripts/reset-interface-qa-requests.cjs` also sets QA wallet balances back to zero, because removing requests removes
  their ledger rows.
