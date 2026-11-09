# Milestone 7 development sign-off

M7's implementation is complete: safety alerts, complaints, restrictions and appeals, account closure and nominees,
staff reporting, and versioned sponsor exports. This closes development of M7 so work can move to M6. Deployment,
municipal approval and the pilot follow the remaining milestones and [pilot checklist](PILOT_CHECKLIST.md).

## Scope and evidence

| Scope                    | Delivered behavior                                                                              | Reference                             |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------- |
| Safety                   | Confidential alerts, pause/restart and staff resolution; paused time excluded from earnings     | [Safety alerts](SAFETY_ALERTS.md)     |
| Complaints               | Member submission, staff hierarchy, confidential history and decisions                          | [Complaints](COMPLAINTS.md)           |
| Restrictions and appeals | Independent approval, restricted sessions, reinstatement and appeals to the next deciding level | [Restrictions](RESTRICTIONS.md)       |
| Closure and nominees     | Death/duplicate review, frozen balances, authorized nominee transfers and reopening             | [Account closure](ACCOUNT_CLOSURE.md) |
| Staff reporting          | Local-admin reports, central summary, India-time periods and PDF/Excel/CSV exports              | [Reports](REPORTS.md)                 |
| Sponsor reporting        | Monthly saved snapshots, append-only versions, PDF/CSV and no sponsor login                     | [Reports](REPORTS.md)                 |

Backend tests cover permissions and routing. Real PostgreSQL tests cover concurrent actions, transactional rollback,
credit effects, report snapshot consistency, simultaneous version allocation and append-only protection. Dashboard tests
cover sessions and report-download forwarding, including refreshed sessions, denied access and unexpected file types.
The member journey script also contains the M7 workflows; it is not a substitute for a real-device trial.

## Validation on 9 November 2026

- Base implementation `f0c3433`: 788 backend tests, 123 PostgreSQL integration tests and 36 dashboard tests passed
  locally before commit, along with API and standalone dashboard builds.
- [GitHub validation of the base implementation](https://github.com/shiblymohammed/time-bank/actions/runs/42621694065)
  passed unit tests, PostgreSQL integration, PostgreSQL concurrency and both production Docker builds. Its formatting
  step failed on files inherited from earlier commits; this sign-off change applies the existing formatter rules to
  those files. No application behavior is changed by that formatting.
- The sign-off dependency patch replaces Firestore's old gRPC 1.9 dependency with 1.14.7. The official-registry
  production audit then reports **zero critical, zero high, six moderate and zero low** findings. See the
  [audit record](DEPENDENCY_AUDIT_2026-11-09.json).
- After the patch and formatting cleanup, all 788 backend tests and 36 dashboard tests passed again locally. API and
  dashboard type checks passed, all 358 tracked/new files covered by the format check passed, and both lint checks
  passed. Dashboard lint retains five existing unused-disable warnings. All 58 formatting-only files were compared with
  formatter output from their committed originals to verify no extra changes were mixed into the cleanup.
- CI now rejects production dependency findings at high severity or above. The six moderate findings remain visible; the
  security check does not claim an advisory-free dependency tree.
- The required final checks are the five jobs in
  [CI on main](https://github.com/shiblymohammed/time-bank/actions/workflows/ci.yml?query=branch%3Amain): lint/type
  checking/format/security, unit tests, database integration, database concurrency and production image builds.

## Remaining release work

These limits are carried into later release validation; they are not additional unfinished M7 implementations:

- **Report privacy policy:** the current small-count threshold is 5. It needs product/privacy confirmation before real
  data is shared. The PRD's NFR-14, UC-28 and AT-29 references are undefined; this work does not invent their approval.
- **Malayalam PDFs:** PDFs use a Latin-only font. Embedded Malayalam fonts and validation remain with M9. Excel and CSV
  preserve Unicode.
- **Real devices and delivery:** real Firebase nominee verification, push delivery and governance screens still need a
  controlled device trial. Safety delivery while offline belongs to M8; until then, a failed alert must not look sent.
- **Operating procedures:** name the people responding to alerts and deciding cases, and agree response times before the
  pilot. The software does not provide round-the-clock staffing.
- **Inheritance:** obtain legal advice before passing on a deceased person's credits, as already required by D#44.
- **Dependencies:** the six moderate advisories need the framework/dependency review in M9. No SSE controller or binary
  file-validation endpoint was found in the API. ExcelJS uses UUID v4, while its advisory concerns v3/v5/v6 buffer APIs.
  These source observations limit demonstrated reachability; they do not waive the findings or prove all transitive code
  safe. Glob/minimatch also occur in runtime dependencies and must remain in the review.
- **Later milestones:** loyalty coins and retirement on closure are M6; durable offline queues are M8; load,
  accessibility, Malayalam, monitoring and deployment validation remain M9/release work. Lost-phone/SIM recovery remains
  a separate open M2 feature and must be scheduled before launch.

No real-account action, production migration, report distribution or deployment is part of this sign-off.
