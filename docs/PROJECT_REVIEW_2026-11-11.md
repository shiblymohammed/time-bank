# Project checkpoint review — 11 November 2026

This review compares the current files and Git history with the last shared M6 checkpoint. It preserves existing
application code and uncommitted design changes. Git identifies commits, not which assistant or IDE wrote them.

## Where coding now stands

The previous shared delivery was M6: root commit `23a75b7`, delivery notes `25af3ef`, and Flutter `a6859a3`, pushed to
the two main branches. Work has since continued in both repositories.

| Area                                | Current local checkpoint                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend/dashboard                   | `main`, `9c352e8` — separate specification folders for all five Join wizard steps                                                          |
| Flutter                             | `main`, `e1f2479` — Welcome, Login and Join wizard redesign                                                                                |
| Current uncommitted root changes    | Seven onboarding specification documents, reference screenshots and associated design assets                                               |
| Current uncommitted Flutter changes | Further login/OTP layout changes; handling of the Both intent; generated Android/iOS app icons; launcher-icon tooling and lockfile changes |

The latest coding focus is **onboarding visual polish**, rather than unimplemented M8 or phone recovery.

## Features added since M6

- **M8 offline visits:** encrypted local snapshots and outbox, locally recorded start/finish/leave events, automatic
  retry while the app is running/resumed, server operation receipts, pending/sent/refused states and offline safety
  delivery wording. Root `2c053ec`; Flutter `a7def47`.
- **Lost phone/SIM recovery:** coordinator cases, confirmation on the new number, independent approval, number holds,
  session/device termination, merchant-code cancellation and reversal. Root `ef1a0a0`; Flutter `ff9c3a8`.
- **Long visits:** reminder/escalation when a visit is not finished. Root `3d9cd15`; Flutter `d15beed`.
- **Funding help received:** the member helped can see relevant earnings and voluntarily contribute credits. Root
  `03bc979`; Flutter `6774b97`.
- **Wards and NOC:** migration 27, ward administration, ward choice, private document upload/read and a NOC gate before
  new membership approval. Root `e3c0682`; Flutter `d824140`.
- **Screen design documentation and onboarding redesign:** screen inventory/workflow, individual screen folders, five
  Join steps and reference assets. Root `e3c0682` through `9c352e8`; Flutter `e1f2479` plus the current edits.

The outbox and phone-recovery screens discussed previously already exist. They should be maintained and verified, not
rebuilt. M8 still requires real-device airplane-mode testing. Offline coordinator registration is explicitly excluded by
the owner decision recorded in `OFFLINE.md`; it is not a newly discovered missing screen.

## Validation performed on the current checkout

| Check                                          | Result                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| Backend unit and HTTP tests                    | 820 passed across 52 suites                                                           |
| Dashboard tests                                | 37 passed                                                                             |
| Backend and dashboard type checks              | Both passed when run with access to installed dependency links                        |
| Flutter analysis                               | Two errors, both in tests                                                             |
| Full Flutter tests                             | 198 passed; 19 failures, including two test files that cannot compile                 |
| Selected PostgreSQL offline/recovery tests     | 45 failed, 172 skipped; missing `OrganizationMembership.ward_id` in the test database |
| Literal Flutter asset paths                    | No missing files found                                                                |
| iOS icon filenames referenced by Contents.json | All referenced files exist locally                                                    |

The database run used an isolated `ktb_matching_test_*` database. Its server stopped and disposable cluster was removed
by the runner. No real accounts, production databases or external application state were changed. Local dependencies
were checked against the existing frozen lockfile without changing dependency versions. No Android/iOS native build,
real SIM, camera or production deployment was validated in this review.

Logs are under `node_modules/.cache/project-review-*`. Initial unprivileged type checks could not read some linked
dependencies; those environmental errors were resolved by running the checks with access to the installed links.

## Findings to address before another release

### 1. Database integration setup stops before the new ward/NOC migration

`apps/api/test/matching-concurrency.integration-spec.ts:163` ends its explicit migration list at migration 26. Current
entities include fields introduced by `1729118400027-WardsAndNoc.ts`. Every selected offline/recovery case failed with a
missing `OrganizationMembership.ward_id` column. This is a test-schema integration regression; it does not prove those
application workflows fail when all production migrations have been applied.

Add migration 27 to this test setup, then rerun all database tests. Also update the HTTP journey: it currently tries to
approve new memberships without first submitting and accepting their now-required NOC (`scripts/journey-qa.cjs:198`). Do
not remove the NOC rule to make an older fixture pass.

### 2. Flutter test compilation and redesign expectations are out of sync

`test/live_store_session_test.dart:13` overrides `ApiClient.request` without its new `upload` parameter.
`test/widget_test.dart:16` still instantiates the removed template `MyApp` and tests the template counter. These are the
two analysis errors. Several remaining failures expect old labels or the previous welcome animation. Update tests to
exercise the new screens, preserving checks for session isolation, Firebase phone-processing explanation, account
recovery, registration payloads, small screens and large text. Do not simply delete failing behavior tests or assume all
19 failures are cosmetic.

### 3. Join cards overflow at larger text sizes

`lib/features/live/live_join_screens.dart:1116` fixes intent cards at 130 pixels high, while their text column at line
1150 grows with accessibility text size. The test run reported bottom overflows of 113, 77 and 37 pixels. Let cards grow
and adapt the illustration/text layout; retain the member's text-size setting.

### 4. “I want to do both” loses the second interest

The card at `lib/features/live/live_join_screens.dart:438` promises both giving time and requesting help. The current
edit marks Both as volunteering, assigns `VOLUNTEER` on either side of the conditional at line 150, and sends only that
role at line 175. The backend application contract accepts one requested role and has no combined interest field. Normal
approval therefore receives only the volunteer request. Preserve both interests through an explicit reviewed workflow,
or revise the wording to explain the actual supported process. Do not grant beneficiary eligibility automatically as a
visual-design shortcut.

### 5. iOS NOC camera setup is incomplete

`lib/features/live/live_noc_screen.dart:96` uses ImagePicker for camera/gallery, but `ios/Runner/Info.plist` lacks
`NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription`. The package requires those descriptions; the native
camera path must be configured before device testing. See the
[official image_picker setup](https://pub.dev/packages/image_picker#ios). No dedicated Flutter NOC tests or real
database ward/NOC lifecycle tests were found; existing tests mostly mock an accepted document to pass the new approval
gate.

### 6. Launcher generation altered an unrelated Xcode build setting

The uncommitted `ios/Runner.xcodeproj/project.pbxproj:457` and `:514` replace
`ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS = YES` with `AppIcon`. That setting controls generated
symbol extensions; the app-icon name belongs in `ASSETCATALOG_COMPILER_APPICON_NAME`. Restore the appropriate symbol
setting and validate all iOS configurations. This was found by inspection; an Xcode build was not run on Windows. See
[Apple's build settings reference](https://developer.apple.com/documentation/xcode/build-settings-reference).

### 7. Terms/privacy text looks interactive but does not open anything

`lib/features/live/live_sign_in_screen.dart:23` starts agreement as checked. The underlined Terms and Privacy spans at
lines 227 and 237 have no link handlers; tapping the surrounding row only toggles agreement. Provide actual readable
documents and accessible checkbox/link controls, and decide how any required acknowledgement is recorded. Styling alone
does not implement that flow.

## Recommended continuation

1. Stabilize the existing onboarding changes: fix test compilation, Join sizing, Both intent, and native upload/icon
   configuration. Retain the chosen visuals and reference assets.
2. Complete ward/NOC coverage: migration setup, upload/read permissions, ward changes, document replacement/review,
   approval gating and relevant concurrent operations; repair the journey fixtures.
3. Rerun the full database and Flutter suites, then native Android/iOS builds. Keep source changes and generated icon
   assets together in the eventual reviewed commit.
4. Resume visual polish with the **membership status and ward/NOC screens**, followed by the main Home/Profile shell and
   request/volunteer screens, using `docs/flutterpolishplan/` as the design backlog. Its prose is not proof that every
   illustrated status or navigation behavior is implemented.
5. Finish real-device M6/M8/recovery checks, then M9 hardening and the pilot gates. The app remains English-only in its
   declared supported locales; Malayalam/accessibility and real SMS/push/device validation remain release work.

Existing code/design edits were not reverted or committed. The older `CLAUDE_HANDOFF_REVIEW_2026-11-09.md` is a
historical checkpoint and no longer describes the current unfinished work. This review is the newer checkpoint.
