# M7 integration review — 9 November 2026

Status: complete; eight confirmed integration defects fixed and validated. This review supplements M7 development
sign-off by examining failures across module boundaries. It does not implement future milestone scope or approve a
production deployment.

## Plan

1. Trace M7 account and visit lifecycle changes through identity/authorization (M2), matching/requests (M3), credits
   (M4), team visits/transfers (M5), notifications and reports. Check dashboard and Flutter contracts where affected.
2. Reproduce concrete failures with regression tests, using a disposable local PostgreSQL database for transaction,
   concurrency and ledger behavior. Focus on actions that overlap: safety pauses, restrictions, closure, appeals,
   completion and reporting.
3. Fix the confirmed cause while preserving existing authorization, audit, credit and confidentiality rules. Keep
   unrelated local files and the separate mobile repository unchanged unless an affected contract requires a fix.
4. Run the affected tests, the full backend/dashboard suites, type checks and lint. Run database regression tests for
   changes to persisted workflows. Inspect the final diff and record evidence and limitations here.
5. Record remaining product decisions and real-device/deployment checks separately from defects fixed in this review.

## Findings and fixes

| Problem reproduced                                                                                                                             | Modules affected                                      | Fix and regression evidence                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A late accepted volunteer could still start after the whole visit ended through a safety alert.                                                | M3 matching, M5 team visits, M7 safety                | Ending the last active visit cancels unstarted offers/acceptances and completes active matching rounds. Worked assignments remain available for independent credit review. PostgreSQL regressions cover staff, beneficiary and last-volunteer termination. Closing an old alert also clears lingering commitments.                                              |
| A pending restriction/closure kept its original approval authority after the subject gained an administrator role or joined another community. | M2 roles/memberships, M7 governance                   | Approval rechecks current roles; closure also rechecks the affected communities. Local staff cannot approve an action that now requires central authority. Regressions exercise promotion and membership changes between reporting and approval.                                                                                                                |
| The older Super Admin restriction route could replace a deceased/duplicate closed status with a ban.                                           | M2 administration, M7 closure/authentication          | Platform restriction creation refuses closed accounts. The direct administration path locks the current user before deciding, so it cannot save a stale pre-closure status. Unit regressions cover both closure kinds.                                                                                                                                          |
| Reopening restored a suspension that staff had already ended while the account was closed.                                                     | M2 access, M4 wallet access, M7 closure/reinstatement | Restoration checks current restriction history and active community cases. Ended restrictions stay ended; still-active restrictions and unrecorded pre-existing status holds remain protected. PostgreSQL regressions cover global/local suspensions, both resolved and still active. Staff roles still require a new grant.                                    |
| Ending the last of two overlapping restrictions left earnings from the earlier restriction frozen. A closure could cause the same gap.         | M4 credits, M7 restrictions/closure                   | Automatic release follows the continuous blocking interval across restrictions and closures. Existing attribution and review reservations still cap the release. PostgreSQL checks cover overlapping restrictions, pre-closure earnings, independent earlier wallet holds and existing review/estate behavior.                                                  |
| Closing an account while approving its pending restriction produced a PostgreSQL deadlock.                                                     | M3 booking locks, M7 restrictions/closure/appeals     | Restriction decisions take the person before restriction case rows, using non-key locks compatible with foreign-key references. Closure appeals retain closure's case-first order. A forced overlap reproduced the database error before the fix and passes afterward. Appeal decisions use the same order; a regression races an appeal against reinstatement. |
| Reciprocal duplicate closures could both succeed, leaving neither account open.                                                                | M2 identity, M7 duplicate closure                     | Approval locks both the closing account and the proposed surviving account in ID order before checking their status. A forced concurrent test reproduced two successful closures before the fix; afterward one succeeds and the other receives a normal conflict.                                                                                               |

Concurrent retries in the older administration route also reproduced a database error: both callers had read the
restriction as active before entering their transactions. Resolution now locks and rereads the current restriction, so
only one caller runs its audit and automatic credit release. The other receives a normal conflict, and an independent
earlier hold stays frozen.

All demonstrated failures were exercised with fictional accounts or unit fixtures. The review made no production account
changes. No database migration or API response/enum change is needed. Existing dashboard and Flutter cancellation,
restriction and closure states remain the interface contract.

## Validation

Final validation after all code changes:

| Check                                                          | Result                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Backend unit, security and routing tests                       | 791 passed, 50 suites                                              |
| Full PostgreSQL integration suite                              | 140 passed, including 17 added cross-module regressions            |
| Dashboard session, request and export tests                    | 36 passed                                                          |
| Flutter tests, including safety and restricted-account screens | 182 passed                                                         |
| Flutter analysis                                               | No issues                                                          |
| API production build                                           | Passed                                                             |
| API and dashboard type checking                                | Passed                                                             |
| API lint                                                       | Passed                                                             |
| Dashboard lint                                                 | Zero errors; five existing unused-disable warnings                 |
| Repository formatting and whitespace                           | 359 tracked/new source/document files passed; no whitespace errors |

The PostgreSQL suite used fresh loopback-only PostgreSQL 18 databases, current migrations and fictional fixtures. Every
test cluster was stopped; the earlier startup run's stopped cluster was removed. No configured development or production
database was reset. Tests that forced an interleaving reproduced the original stale-approval, status, credit-release and
concurrent-decision failures before their fixes; preservation tests also verify active restrictions, independent earlier
wallet holds and existing credit-review reservations.

This follow-up did not rerun Docker builds or remote CI. The API was built locally, and the earlier M7 sign-off records
the previous main commit's container validation. There were no container, dependency or migration changes here. The
separate Flutter repository's pre-existing `analysis_options.yaml` change was preserved; no mobile source was edited.

The database test helper accepts an optional `-TestNamePattern` for focused reproduction. Without it, the helper still
runs the complete suite and creates/stops its own disposable loopback PostgreSQL cluster.

## Scope limits

- This is a source and automated integration review, not a claim that every possible failure has been eliminated.
- Real-phone Firebase/push delivery, deployed-database migration review, Malayalam PDFs, privacy-policy confirmation,
  load and accessibility remain the release checks recorded in [M7_SIGNOFF.md](M7_SIGNOFF.md).
- M6 loyalty, M8 offline queues and lost-phone/SIM recovery remain separate planned work. This review does not add those
  features.
- No automatic rewrite of historical balances or account records is included. A previously affected record must be
  reviewed using its existing case and ledger history before staff repair it.
