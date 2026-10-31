# Time credit donations

Members can give universal time credits to a verified member of any participating organization, or to an approved
community pool (FR-TIME-03, D#15, D#19). Migration `1729118400008-CreditDonations` adds `community_credit_pools` and
`credit_donations`, and lets `time_credit_ledger` rows belong to a pool as well as a wallet.

## Endpoints

| Endpoint                                     | Who                                               | Rule                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/organizations/:id/donations`      | An approved member of `:id`                       | `amount` 0.01–1000 with at most two decimals, and either `recipientOrganizationId` with `recipientMembershipNumber`, or `poolId`. Optional `note` (up to 200 characters). A required `idempotencyKey`. `:id` is recorded as the origin organization (ITB-009). |
| `GET /api/donation-pools`                    | Any signed-in user                                | Open pools of every active organization, with their balance.                                                                                                                                                                                                   |
| `POST /api/organizations/:id/donation-pools` | Municipality administrator or super administrator | Approves a pool with a `name` that is unique in the organization and an optional `description`.                                                                                                                                                                |

## Rules

- **Recipients:** a member must hold an approved membership, have an active account and a `VERIFIED` identity, and
  belong to an active organization. Otherwise the answer is 404, with the same message whatever the reason, so the
  endpoint reveals nothing about other people. Giving to oneself is refused.
- **Frozen wallets:** a frozen wallet or a suspended account cannot give (403) or receive (409), and keeps its balance
  (D#79).
- **Balance:** a gift larger than the donor's spendable balance is refused (409). Database checks keep every balance
  non-negative as well.
- **Two ledger rows:** each gift is a `DONATION_SENT` row (negative) on the donor and a `DONATION_RECEIVED` row
  (positive) on the recipient wallet or pool. Both carry the donation id and the origin organization, and
  `uq_ledger_donation_leg` allows one row of each per gift. The ledger stays append-only.
- **Retries:** the same `idempotencyKey` returns the first gift with `replayed: true`. The same key with a different
  amount or recipient is refused (409).
- **Concurrency:** wallets are locked in id order, and the pool after them. Two gifts from one wallet therefore cannot
  both spend the same credits, and two members giving to each other at the same moment cannot deadlock.
- **Privacy:** in `GET /api/wallet/transactions` the donor sees who received each gift (a membership number or pool name
  and its organization). A recipient sees only the note and the organization the gift came through, never the donor.
- Each gift writes `CREDITS_DONATED`, and each new pool writes `COMMUNITY_POOL_CREATED`.

Pools only collect credits so far. Spending pool credits on assistance is not built yet.

## Checks

- `scripts/test-matching-concurrency.ps1` applies all eight migrations. The donation tests cover a member gift with both
  ledger rows, replay and key reuse, privacy in both histories, cross-organization pool gifts, closed pools, every
  refusal above, two simultaneous gifts against one balance, and two members giving to each other at once.
- On 1 November 2026, an HTTP walk-through against the disposable interface QA API passed all 18 of its checks. It ran
  every endpoint above, including the refusals, retries and privacy checks.
- The QA fixture verifies the caregiver and the volunteer (the beneficiary stays unverified) and approves
  `QA Elder Care Pool` in the second organization. `scripts/reset-interface-qa-requests.cjs` also clears gifts and pool
  balances.
