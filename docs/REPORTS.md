# Reports and sponsor exports

Milestone 7, part 5 (FR-REPORT-01, FR-REPORT-02, FR-REPORT-03, FR-REPORT-04, D#49, D#54, D#55, D#57, D#58). Figures for
staff, and saved impact reports for sponsors.

## Who can read what

| Person             | Can read                                                              |
| ------------------ | --------------------------------------------------------------------- |
| Coordinator        | Nothing                                                               |
| Municipality Admin | Their own community: figures, downloads and sponsor reports           |
| Super Admin        | Any community, and a summary across all                               |
| Sponsor            | Only the file someone sends them. There is no sponsor login or portal |

Reports are in the panel under Governance. The panel hides the tab from coordinators, and the API refuses them anyway.

## Staff report

Choose a month or two dates, in India time. The figures are worked out when opened, and can be downloaded as PDF, Excel
or CSV. The screen and the files show the same figures.

- **People, as of today:** volunteers, beneficiaries, applications waiting.
- **Help given:** new members; requests made, completed, cancelled and with no volunteer found; visits, hours, people
  helped, volunteers who helped; split by service and by ward.
- **Speed:** the typical (median) time from a request to a volunteer accepting.
- **Time credits:** earned, donated, spent, put on hold, released from hold, removed after a review.
- **Safety and governance:** counts of alerts, complaints by outcome, restrictions, appeals and closures.

The all-communities summary adds one row per community and leaves out wards, since each community numbers its own.

## Sponsor report

Community, period, hours of help, visits completed, people helped, active volunteers, credits earned and the top five
services (the rest together as "Other services"). Available as PDF and CSV.

Left out: safety alerts, complaints, restrictions, appeals, closures, budgets and spending (FR-REPORT-04).

- A job saves each active community's previous month, soon after the month ends. `REPORTS_INTERVAL_SECONDS` sets how
  often it checks (default one hour). It also checks 30 seconds after the server starts. It is safe with several
  servers.
- Saved figures are frozen. A database trigger refuses any change.
- Each saved report uses one repeatable-read database snapshot, so its totals and breakdowns agree even if relevant
  records change during generation. Version allocation is serialized; a stale snapshot collision retries the complete
  transaction, up to five attempts, without partial reports.
- Staff can save a finished month again. That makes a new version and keeps the old one, so what a sponsor was sent can
  always be produced again.
- Nothing is emailed. Staff download the file and send it themselves.

## Privacy

- **Counts only.** The queries do not read names, phone numbers, member numbers, request numbers, addresses or written
  notes.
- **Small counts.** Any count under 5 in a breakdown shows as `<5`. If that hides only one row, the next smallest shows
  as `hidden`, so it cannot be worked out from the total. Figures beside a hidden count, such as hours, are hidden with
  it. A breakdown of all zeros stays as zeros. The limit is one setting, `SMALL_COUNT_LIMIT` in `report-privacy.ts`.
- **Headline totals stay exact** in staff reports. A sponsor report also hides the number of people helped and active
  volunteers below 5, because that file leaves the organization.
- **Typical wait** stays empty until at least 5 requests found a volunteer, or it would be one person's wait.
- **Ward numbers** are typed in by hand. Only a recognisable number counts as a ward, so `ward no. 02` becomes `Ward 2`.
  Anything else goes under Other, because it could be a name or an address.
- **Formulas.** Text starting with `=`, `+`, `-` or `@` is made plain text, so a file cannot run anything in a
  spreadsheet.
- **Downloads are recorded.** The audit log keeps who, which community, the period and the format.

## How things are counted

- A **visit** is one volunteer's confirmed help, so a request with two volunteers is two visits.
- A visit counts in the month it was **confirmed**, using confirmed minutes rather than reported ones.
- Help and credits count under the community of the request, wherever the volunteer belongs (ITB-009).
- Each person counts once per community. In the summary a person counts once overall, so the total can be lower than the
  rows added up. The report says so.
- Credits passed to a nominee are not earnings.
- Retired test accounts (`TEST_ACCOUNT_RETIRED`) are left out everywhere.
- **Dates:** requests made, alerts, complaints received and appeals filed count by when they were created. Outcomes
  count by when they were decided. People as of today ignore the chosen period, except new members.

## Limits

- **English only in PDFs.** The built-in PDF font draws Latin text only, so Malayalam shows as `?`. It needs an embedded
  font, with the Milestone 9 Malayalam validation. Excel and CSV are not affected.
- **NFR-14, UC-28 and AT-29** are cited in the PRD but never defined. The privacy rules come from FR-REPORT-02 alone,
  and the limit of 5 is a choice to confirm before real use.
- **Not in this work:** charts and trend graphs (front-end polish), loyalty figures (Milestone 6).
- A community's own label for a service appears in its reports, so staff should not put a person's name in one.

## Commit validation — 9 November 2026

- Backend: all 788 unit/router/security tests passed.
- PostgreSQL: all 123 integration tests passed, including a concurrent change between report aggregate reads, four
  simultaneous staff-generated versions, duplicate monthly jobs, download audit and append-only protection.
- Dashboard: all 36 tests passed, including PDF/Excel/CSV byte forwarding, expired-session refresh, denied access and
  unexpected file-type rejection.
- API and standalone dashboard builds passed. API lint passed. Dashboard lint has no errors; five existing
  unused-disable warnings remain in the request and catalogue components outside this change.

Both production Docker images also passed in
[GitHub CI](https://github.com/shiblymohammed/time-bank/actions/runs/42621694065). The subsequent official-registry
dependency audit and security patch are recorded in [M7_SIGNOFF.md](M7_SIGNOFF.md). Malayalam/privacy product decisions
remain release checks. Development validation does not replace them.
