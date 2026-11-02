# Milestone 4 credit controls

Eligible beneficiaries, including older people and people with disabilities, receive approved assistance free,
regardless of their credit balance. This is the product rule confirmed on 2 November 2026. Creating, matching, starting,
finishing and confirming a request never charges the beneficiary. These controls do not change eligibility.

Migration `1729118400010-CreditControls` adds credit reviews, voluntary spending/release operations, pool frozen
balances and references on the append-only ledger. Apply all migrations before starting the updated API.

## Voluntary credit spending

`POST /api/organizations/:id/requests/:requestId/credit-spending`

Body: `amount`, `reason`, `idempotencyKey`, and optionally `poolId`.

- With no pool, only the beneficiary or request creator can volunteer their **own** wallet credits. No endpoint accepts
  a different payer's wallet or user ID. A member's universal credits work in any organization where they are approved.
- Pool spending requires current Municipality Admin or Super Admin authority. The pool must belong to the request's
  organization, be active and have enough available credits.
- Only a completed request with independently verified service earnings can be funded. The amount cannot exceed the
  total credits awarded for that request. One voluntary payment per request is allowed, including a partial payment;
  that partial payment closes further funding for that request.
- Spending retires the chosen credits. It does not issue another award or transfer a second payment to the volunteer.
  The volunteer was already credited at independent confirmation.
- Retry keys are scoped to the actor across both spending and frozen-earning releases. An identical retry returns the
  recorded operation; a changed amount, reason, account, request or organization is refused. A concurrent mismatched
  operation may return 409 while the first request is processing; retry the same operation after it finishes.
- Every debit records its originating organization, request and operation ID. The account debit, operation, ledger entry
  and audit event commit together or roll back together.

Amounts are numeric values from 0.01 to 1000, with at most two decimals. Keys are 8–100 characters and reasons are
5–1000 characters. Unknown body fields are rejected.

## Disputed credits and corrections

All paths below start with `/api/organizations/:id`.

| Endpoint                                             | Authority                         | Purpose                                                                            |
| ---------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| `POST credit-reviews`                                | Coordinator or administrator      | Identify a positive source ledger entry and hold disputed credits still available. |
| `GET credit-reviews?page&limit`                      | Coordinator or administrator      | Inspect this organization's reviews and their dispositions.                        |
| `GET credit-reviews/:reviewId/transfers?page&limit`  | Coordinator or administrator      | Find actual subsequent donation legs for investigation.                            |
| `POST credit-reviews/:reviewId/investigation`        | Coordinator or Super Admin        | Record findings once; requires `investigation` (10–2000 characters).               |
| `POST credit-reviews/:reviewId/resolution`           | Municipality Admin or Super Admin | Authorize `RELEASE` or `CORRECT`, with `resolution` (10–2000 characters).          |
| `GET donation-pools/:poolId/transactions?page&limit` | Coordinator or administrator      | Inspect the local pool's ledger, spendable balance and frozen balance.             |

Opening a review requires `sourceEntryId`, `amount`, `reason`, and `idempotencyKey`. The source must be a positive
service earning or received donation. A wallet source must originate in the reviewing organization; pool reviews belong
to the pool's owning organization. Staff cannot investigate or resolve their own wallet credits. A resolver must be
different from both the opener and the investigator. Even an administrator holding a coordinator role cannot approve
their own investigation. Authority is reloaded from current database records, including active account restrictions.

The requested amount is the **disputed amount**. `held_amount` is the lesser of that amount and the current available
balance. The latter moves from spendable to frozen credits, never below zero. The original source row is preserved. Open
and corrected reviews against a source cannot exceed its original credit amount. Corrections remove only the held
amount; any spent/unrecovered portion stays documented in the review and does not become a negative balance.

An originally frozen service earning can also be reviewed through its original source. `pre_frozen_amount` reserves its
attributable, still-frozen credits without moving them again; any remaining hold uses currently available credits.
Ordinary releases exclude these reservations. Resolving a review against already-frozen earnings consumes that
attribution, so a later release cannot withdraw the same frozen credits a second time. Internal release entries are not
independent new earning sources for a second review.

A coordinator can investigate actual downstream donations and open a child review with `parentReviewId`. The child
source must be the receiving ledger leg of a donation from the parent wallet after its disputed source was posted. The
child's amount is bounded by that transfer's credit, the parent's unheld/unallocated disputed amount, and previous
reviews against the receiving source. Child reviews can continue through subsequent member transfers. Available
recipient or pool credits are held for review; no recipient is automatically declared fraudulent. Each organization's
staff use their own authority for sources assigned to that organization. Transfer discovery provides the appropriate
review organization ID without exposing the recipient's profile or documents.

This is an evidence-driven investigation workflow, not automatic attribution of particular fungible credit units. Staff
select and document the suspected transfer path. Already spent credits are not clawed back through an invented debt.
Descendant reviews must be resolved before their parent; each disposition follows its own investigation evidence.

`RELEASE` returns the held amount to the available balance. A frozen/closed wallet or restricted account cannot be
released until reinstated. `CORRECT` removes the disputed held amount and appends `CREDIT_CORRECTED`; it never edits or
deletes the original award, donation or hold. Each review mutation and audit record share one transaction. Repeated
identical submissions are idempotent; changed findings or a conflicting final decision are refused.

## Freeze and reinstatement

`POST wallets/:userId/status` is restricted to **Super Admin**, because the wallet is global. Supply `status` (`ACTIVE`
or `FROZEN`), `reason`, and `idempotencyKey`. Changes preserve balances and produce immutable audit records. Keys are
scoped to actor and wallet. An administrator cannot change their own wallet status. Closed wallets, banned/suspended
owners and active account restrictions cannot be restored through this endpoint. Restoring wallet status does not
release frozen funds.

Account suspensions/bans already block wallet use through current account status. Active global restrictions now also
block giving/receiving donations, spending and releases even if the account status has not yet changed. Confirmed
earnings received while restricted or wallet-frozen are recorded in frozen credits pending reinstatement.

`POST wallets/:userId/release-frozen` requires Municipality Admin or Super Admin authority plus `amount`, `reason` and
`idempotencyKey`. It releases only held service earnings attributable to the administrator's organization, after
subtracting earlier releases. The owner and wallet must be active, and amounts reserved by fraud reviews are excluded.
Administrators cannot release their own credits. Reinstating an account never automatically releases disputed funds.

The wallet history now includes `reviewId`, `operationId`, and `frozenDelta`. For old earnings posted before migration
0010, `held` remains the authoritative indication that the earning went into frozen credits; the new `frozenDelta`
column defaults to zero rather than rewriting historical rows. New frozen earnings record the positive delta.
`FRAUD_HELD` moves a negative amount from spendable to frozen; `FRAUD_RELEASED` and `FROZEN_RELEASED` reverse that
internal movement. `CREDIT_CORRECTED` has a negative amount and `held=true`: it debits frozen credits only.

## Verification and release

`scripts/test-matching-concurrency.ps1` applies all ten migrations to an isolated database. Tests cover free completion,
voluntary member/pool spending, caps, private requests, role revocation, signed HTTP guard and DTO handling, freezes,
releases, source/transfer-linked holds, independent review, immutable history, retries, real concurrent spending/holds,
late audit failure rollback and schema rollback protection.

Rollback refuses to remove the credit-control schema once reviews or operations exist. Roll forward to correct a
deployed issue; do not delete financial history to run an older binary. PostgreSQL 18 is used locally; PostgreSQL 17
remains the CI/container target. These backend APIs still need coordinator/admin user interfaces and the human ledger,
permission and migration review required by the project policy before production adoption.
