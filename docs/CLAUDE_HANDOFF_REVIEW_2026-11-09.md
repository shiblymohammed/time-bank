# Project handoff review — 9 November 2026

## Where work stopped

The current unfinished change set is **Milestone 7 reporting and sponsor exports**. It is implemented
in the working tree but has not been committed. The latest committed backend/dashboard work is
`fc3dc37` (account closure and nominees); the latest mobile commit is `f9f7a7e` (nominee screen and
closed-account notice).

This review uses Git history, local changes, source and project documents. Git attributes these
commits to the project owner, so it does not establish which assistant authored each change.
The project-local `.claude` directory contains a panel launch configuration, not a handoff transcript.

## Backend

Recent committed modules cover team visits/transfers, visit safety alerts, complaints, restrictions,
appeals, death/duplicate account closure, nominees, identity checks, staff email verification,
organization-locked sign-in, matching recovery and the push queue.

Uncommitted reporting work includes:

- `apps/api/src/reports/`: community and central reports, period calculations, privacy rules,
  PDF/Excel/CSV rendering, monthly sponsor-report worker, and unit tests.
- Migration `1729118400022-SponsorReports.ts`: versioned sponsor reports with a trigger preventing
  updates/deletes.
- Reports module registration, report-generation dependencies and lockfile changes.
- Additional PostgreSQL integration and HTTP journey cases for reports, privacy, permissions,
  downloads, versioning and concurrent monthly jobs.

The integration tests are present; they were not executed against PostgreSQL during this review.
No migrations were applied, servers started, real accounts changed or deployment performed.

## Admin dashboard

The current panel already includes the newer governance workflows. The uncommitted Reports page
is integrated into navigation for Municipality Admins and Super Admins, with coordinators excluded.
It includes date/month selection, staff figures, downloads and saved sponsor-report versions.

File download support was added to the browser client, authenticated gateway and server proxy.
Those changes warrant an actual browser/download check alongside the reports page before this
feature is considered signed off. Passing helper tests does not prove that browser downloads work.

The uncommitted web `tsconfig.json` also contains temporary QA build-output paths. Review these
before committing; they are not part of the reporting feature itself.

## Flutter

The mobile app is a separate Git repository under `apps/mobile/time_bank_flutter`, ignored by the
parent repository. Recent commits add team workflows, safety alerts, complaints/restrictions/appeals,
nominee registration and closed-account notices.

Its only uncommitted change at the start of this review was excluding `ios/**` from analyzer input.
There is no pending mobile Reports screen; the reporting feature currently belongs to the staff panel.
That is consistent with the documented access model.

## Checks performed now

| Check | Result |
| --- | --- |
| API TypeScript check | Passed |
| Dashboard TypeScript check | Passed |
| Targeted reports and schema tests | 42 passed, 2 suites |
| Dashboard tests | 34 passed |
| Flutter analysis | No issues |

The first dashboard test run could not reach its local stub server under restricted execution.
The same unchanged tests passed with local network access. This was not treated as an application
regression. Full API tests, database journeys, native device flows and deployed Firebase/SMS/push
were not rerun in this review.
The whitespace check also flags the existing final line of `apps/web/tsconfig.json`; it was left
untouched with the rest of the unfinished change set.

## What needs attention before continuing

1. **Finish the reporting handoff.** Review all untracked report files, migration, dependencies and
   gateway changes together. Run the reporting database/journey cases and browser downloads, then
   commit the complete feature rather than only the already-tracked files.
2. **Align planning documents.** `MILESTONES.md` says teams are built and the pilot comes last;
   the PRD summary still says teams are planned and the pilot is next. The M2 summary still says
   nominees are open even though the latest closure/mobile commits implement them. The older M4
   release-gate text also needs checking against the now-existing credit interfaces.
3. **Review saved-report consistency.** Staff reads use a repeatable-read transaction, while saving
   sponsor figures uses read committed and several separate aggregate queries. Check whether those
   figures can disagree if relevant records change between queries. This is a source-review concern,
   not a reproduced failure; the advisory lock already protects report version numbering.
4. **Keep the documented report limits visible.** PDFs do not yet render Malayalam correctly;
   the small-count privacy threshold needs product confirmation. The report file documents these limits.

Two previously documented booking issues are still visible in source: request-key replay does not
compare changed payloads, and beneficiary quota month boundaries use host-local time rather than an
explicit India calendar boundary. Include these in the remaining reliability work rather than assuming
every item in the older audit has been closed.

## Recommended continuation

Finish and sign off M7 reports first. Then follow the latest milestone plan: M6 loyalty/merchants,
M8 offline reliability, front-end polish, remaining M9 hardening, then deployment and pilot.
Lost-phone/SIM recovery also needs an explicit place in that plan. Additional organization flavors
and staff subdomains remain prerequisites for a second organization.

Existing feature code was left unchanged by this review.
