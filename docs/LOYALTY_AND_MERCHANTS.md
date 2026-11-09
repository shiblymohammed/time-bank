# M6: loyalty and merchants

Status: built in development; deployment and device review remain open.

Both repositories use the local branch `codex/m6-loyalty-merchants`. The Flutter change is commit `a6859a3` in the
separate repository at `apps/mobile/time_bank_flutter`; the root repository intentionally does not track that checkout.
Neither feature branch has been pushed as part of this work.

## Delivery plan

1. Add community-scoped loyalty wallets, an append-only coin ledger and versioned central earning policies. Award coins
   in the same transaction as authoritative service confirmation. Protect retries, team awards and sequential transfers.
2. Integrate account restrictions, closure and reopening with the loyalty balances. Keep coins separate from time
   credits and nominee inheritance.
3. Add merchant registration, independent local approval, versioned offer publication, centrally approved local bonus
   campaigns and online single-use QR/manual redemption. Merchants fund their own promotions.
4. Add centrally configured milestones, engagement awards, private recognition and an opt-in community leaderboard.
5. Add the staff/merchant dashboard and member Flutter interfaces. Test tenant boundaries, authorization, transactional
   failures, concurrent redemption and the existing M3/M4/M5/M7 workflows before sign-off.

## Policy decisions from the PRD

- Time credits remain universal. Loyalty coins belong to one person in one community and cannot fund assistance, be
  donated, move between communities or be inherited.
- Super Admin controls earning rules. New installations have no active earning policy, so the implementation does not
  invent a live coin rate. Local campaigns need central approval.
- Only authoritative verification earns service coins. Each simultaneous team member earns for their own verified
  minutes; a replaced volunteer in a sequential handover earns nothing.
- Closed duplicates keep their coin balances frozen, with no transfer to the primary account (D#90). A deceased
  account's unused coins are retired (D#46). The earlier milestone shorthand saying both were retired is incorrect.
- Recognition is private unless the member opts in to the community leaderboard. Beneficiary details never appear.
- Redemption is online and server-authoritative, including the manual-code fallback. Offline redemption is excluded by
  BR-08.

## Delivered behavior

- Each community has its own wallet and append-only coin history. Verified service confirmation posts time credits,
  coins, milestones and audit records atomically. An award failure rolls the whole confirmation back.
- A service receipt prevents repeated or retroactive awards, including work confirmed while earning was disabled. Each
  simultaneous team member earns for their own confirmed minutes. Replaced assignments cannot earn coins.
- Policies are immutable versions. The policy and centrally approved campaigns active at confirmation determine the
  award. Coins are whole numbers, rounded down per assignment; qualifying minutes still accumulate for milestones.
  Engagement caps apply per independently approved award; active campaign bonuses share one combined hourly cap.
- A merchant submits a local business application and offers. Independent administrators approve publication. Changes to
  published terms create another proposal; approving a replacement withdraws the earlier offer.
- A five-minute redemption presents a QR image and a 16-character manual code. Both address the same record. Issuing a
  code does not spend or reserve coins or stock. Online consumption locks the token, offer and wallet, rechecks
  eligibility, then deducts coins and stock once. Retries return the same receipt.
- Issuance is limited to five unexpired pending codes per member/community. Cancelling or expiration spends nothing.
  Withdrawal, business suspension, role removal, account restrictions and closure prevent subsequent consumption.
  Closing an account cancels pending codes so reopening cannot revive them.
- Restriction-period earnings remain held until eligible reinstatement. Late independently verified earnings on a
  deceased account are retired against that closure; mistaken reopening restores them through compensating entries.
- Merchant receipts and volume contain no member identity. Members privately see milestone badges and downloadable PDF
  certificates; the opt-in leaderboard exposes only a chosen alias and verified minutes.
- The dashboard admits merchants without granting staff powers or requiring the staff email-code step. Staff and
  merchant tools follow the selected community. Member screens are reachable from the Flutter profile and settings.
- Staff reports and PDF/Excel/CSV exports show separate coin earnings, redemptions, held earnings, retirement,
  restoration and approved business counts. Sponsor report fields and saved versions are unchanged.

## Main API surface

All routes require signed authentication and current database authority. Community routes start at
`/api/organizations/:id/loyalty`; every referenced object is scoped to that community.

| Route                                                                    | Use                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `GET/POST /api/admin/loyalty/policies`                                   | Super Admin policy history and version publication            |
| `GET/POST settings`                                                      | Read earning settings; Municipality Admin/Super Admin changes |
| `GET wallet`, `POST wallet/refresh`                                      | Own balance/history; explicitly settle eligible held earnings |
| `POST visibility`, `GET leaderboard`                                     | Explicit recognition preferences and opted-in aliases         |
| `GET achievements/:id/certificate`                                       | Own private milestone PDF, with no beneficiary details        |
| `GET/POST engagement`, `POST engagement/:id/decide`                      | Propose verified participation; independent admin decision    |
| `GET/POST merchant`, `GET review`                                        | Own application/offers/receipts; local administrative review  |
| `POST merchants/:id/decide`, `POST merchants/:id/suspend`                | Independent business approval/status control                  |
| `GET/POST offers`, `POST offers/:id/decide`, `POST offers/:id/withdraw`  | Published catalogue and offer lifecycle                       |
| `POST redemptions`, `GET redemptions/:id`, `POST redemptions/:id/cancel` | Own short-lived redemption codes                              |
| `POST redemptions/consume`                                               | Owning merchant's atomic QR/manual consumption                |
| `GET/POST campaigns`, `POST campaigns/:id/decide`                        | Local proposals and independent Super Admin approval          |

Proposal/issuance retries carry UUID `clientOperationId` values. A reused key with different instructions is refused.
Raw redemption secrets are never stored or audited; only their SHA-256 hashes are persisted. The server generates QR
images locally. After a signing-key rotation, an issuance retry asks for a fresh code; an already displayed code remains
subject to its original expiry and every consumption check.

## Validation

- Backend: 796 unit/HTTP tests; full PostgreSQL regression suite: 163 tests, including 23 M6 cases.
- Dashboard: 37 tests, including merchant admission without staff powers; production build and type checks.
- Flutter: 188 tests and clean analysis; focused tests cover PDF refresh/session privacy, retry IDs, default private
  recognition and clearing account-specific codes after a session change.
- Browser QA used a separate disposable database and fictional accounts. Verified central policy versioning, independent
  business/offer/engagement approvals, merchant-only navigation, manual redemption and repeated submission. Read-only
  database checks confirmed one stock decrement, one debit, 15 remaining coins from an approved 25-coin award, and no
  time-credit spending. QA services and their database were removed afterwards.
- Real database cases cover QR/manual races, final-stock competition, audit rollback, expiry, wrong merchant/member,
  tenant boundaries, revoked authority, campaign caps, immutable history, team awards, death/duplicate closures,
  reopening and late earnings. Existing matching, credits, governance and sponsor-report tests pass together.
- Production dependency audit: no high/critical findings; six existing moderate advisories remain in the M9 review
  already recorded in [M7_SIGNOFF.md](M7_SIGNOFF.md). No new QR-library advisory was reported.

Local browser evidence is in `output/m6-qa/` (screenshots and database assertions, excluded from the feature commit).

## Activation and release checks

1. Back up the intended database and deploy migration `1729118400023-LoyaltyAndMerchants` with the API and dashboard. A
   fresh installation has no earning policy and every community program is disabled.
2. Have Super Admin explicitly publish the approved earning rate, engagement cap, campaign cap and milestones. Have the
   responsible administrator enable each community program. QA example rates are never deployment defaults.
3. Deploy the separate Flutter repository's M6 change alongside the server. It adds `share_plus` for user-directed
   certificate saving/sharing. Existing universal-credit and nominee flows remain separate.
4. Run the cloud CI PostgreSQL 17 job and human authorization/ledger/migration review before merging for release. Local
   database validation used PostgreSQL 18. No production migration or deployment was performed.
5. Test phone-to-merchant camera scanning, the manual fallback, expiry/network loss and native certificate sharing on
   actual Android/iOS devices. Browser QR-photo reading needs `BarcodeDetector`; unsupported browsers retain the code
   fallback. This run generated QR images and tested the common QR/manual backend state; it did not test a physical
   camera.

Once policy, award, merchant, campaign or ledger history exists, migration reversal refuses to discard it. Roll back
application code only after compatibility review, or restore the verified backup; never delete financial history to make
a down migration succeed.

These checks do not complete M8 offline queues or M9 hardening, Malayalam/accessibility/device validation, real SMS,
lost-phone/SIM recovery or the existing legal review for time-credit inheritance. No automatic performance-scoring
formula was invented: approved engagement and centrally configured milestones provide reviewable recognition.
