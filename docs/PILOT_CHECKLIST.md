# One-municipality pilot checklist

The gate between the test server and real people using the service. A pilot is a small, supervised run with one
municipality. It is a decision for the project owner and the municipality, and nothing here is approved by finishing it.

The pilot comes last, after every feature is built and the front end is polished. See [MILESTONES.md](MILESTONES.md).

## Before anyone real signs up

### Sign-off by people

- [ ] A named person has reviewed the credit ledger, authorization rules and migrations.
- [ ] The municipality has agreed to the pilot and named a coordinator and an administrator.
- [ ] Privacy notices and consent for phone numbers, addresses and care details have been reviewed.
- [ ] Someone is named to respond when a service goes wrong, with a phone number that is answered.

### Technical

- [ ] [Every check in the test server guide](TEST_SERVER.md#checks-after-deploying) has passed on the deployed server.
- [ ] A database backup has been restored successfully at least once, onto a separate database
      (`scripts/backup-restore-drill.sh` printed `RESULT: PASS`), and nightly backups run and are copied off the server.
- [ ] All CI jobs pass on the deployed commit, including Matching Concurrency.
- [ ] Android release build works on a real phone with Firebase sign-in, not test sign-in.
- [ ] Real SMS delivery and quota are confirmed for the expected number of users.
- [ ] Push messages arrive on a real phone with the app closed.

### Data

- [ ] The municipality, wards and operational zones are set up.
- [ ] The enabled service list is reviewed by the coordinator.
- [ ] No test or demo accounts remain on the pilot database. If everything on it is test data, recreate the database. If
      real people are on it too, use `scripts/retire-test-accounts.sh`.

## A safe first scope

- Start with 5 to 10 verified volunteers and a few beneficiaries known to the coordinator.
- Start with low-risk services. Keep sensitive ones on coordinator dispatch.
- Use scheduled requests first. Add immediate requests once matching is trusted.
- Review every credit award during the first weeks.

## During the pilot

Check these weekly with the coordinator:

- Requests made, matched, escalated and cancelled, and how long matching took.
- Volunteers who never respond, or who received no push message.
- Sign-in failures and SMS costs.
- Any credit correction or review, and why it was needed.
- Every safety alert, how quickly someone responded, and how it ended.
- [Complaints](COMPLAINTS.md): how many, how quickly someone picked each up, and how each ended.

## Stop the pilot if

- A beneficiary is left without promised help because of a system fault.
- Credits are wrong and the cause is not understood.
- Personal data reaches someone who should not have it.
- Backups are failing.

## Known gaps to accept or close first

- Milestone 7 is built, within the limits stated in [safety alerts](SAFETY_ALERTS.md), [complaints](COMPLAINTS.md),
  [restrictions and appeals](RESTRICTIONS.md), [account closure](ACCOUNT_CLOSURE.md) and [reports](REPORTS.md).
- [Report](REPORTS.md) PDFs are in English only, and the hiding limit of 5 needs confirming, since the PRD cites a
  privacy rule (NFR-14) it never defines.
- Passing on a deceased member's credits needs legal advice first (D#44), and the nominee's phone code has not been
  tested on a real phone with real Firebase.
- [Lost phone or SIM recovery](PHONE_RECOVERY.md) has not been tested on real phones. It needs a second real SIM and
  real Firebase.
- [Offline use](OFFLINE.md) covers starting, finishing, leaving and safety alerts only; the rest needs a connection. SMS
  and WhatsApp alerts are not built, and the airplane-mode phone test is still to do.
- Load, security and accessibility reviews and Malayalam validation (Milestone 9) have not been done.
- [Other remaining issues](FULL_APPLICATION_AUDIT_2026-11-02.md), including quota month boundaries. Request-key reuse is
  fixed (see [offline use](OFFLINE.md)).
