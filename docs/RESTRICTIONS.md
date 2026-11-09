# Suspensions, bans and appeals

Milestone 7, part 3 (FR-SAFE-06, FR-SAFE-07, D#77, D#78, D#81, BR-11, AT-09). How a person's access is stopped, how it
returns, and how anyone can challenge a decision made about them.

## Who decides

A coordinator recommends. Someone above decides. The level comes from the person's own roles, not from who is asking.

| About                                   | Decided by         |
| --------------------------------------- | ------------------ |
| A member (volunteer, beneficiary, etc.) | Municipality Admin |
| A coordinator                           | Municipality Admin |
| A Municipality Admin or Super Admin     | Super Admin        |

- A community with no Municipality Admin falls to a Super Admin.
- A Super Admin can act directly in an emergency. The same case record and appeal right follow.
- Nobody acts on their own case. Whoever recommended cannot approve. Whoever decided, or recommended, cannot hear the
  appeal.
- The last Super Admin cannot be suspended or banned.
- Staff are found by phone or member number. Nobody types a raw id.

## What it does

The person deciding picks how far a suspension reaches. A ban always covers every community.

|                 | This community only | All communities                     |
| --------------- | ------------------- | ----------------------------------- |
| Membership here | Suspended           | Stays, but cannot be used           |
| Account         | Stays active        | Suspended or banned                 |
| Other communities | Not affected      | Blocked                             |
| Wallet          | Not touched         | Credits safe, but cannot be spent   |

While a platform restriction is active, the existing money checks block spending and hold new earnings. The wallet's own
status does not change, so a separate freeze is never undone by accident.

### Their bookings

If the person is a beneficiary, requests that have not started are cancelled with the reason `ACCOUNT_UNAVAILABLE`. The
wording says only that they are no longer available, so a volunteer never learns why. Visits already under way carry on,
and coordinators get a push to look at them. Nobody can book for a restricted beneficiary, including a caregiver or
coordinator.

## What the person sees

- After the phone code they get a **limited session**. It holds no roles and reaches only their profile, the community
  list, their restriction and the appeal form. Everything else is refused.
- The app shows the message written for them, the date, a reference, and how to appeal. They never see the staff reason.
- The panel refuses a limited session and tells them to use the member app.
- An account closed for any other reason still cannot sign in.

Pushes and audit entries carry no reason or message. A platform-restricted person has no registered device while
restricted, so they read the news when they next open the app.

## Reinstatement

- A suspension's review date only reminds staff. **Nothing lifts by itself** (D#81).
- A coordinator recommends reinstatement. The level that decided approves or refuses it. A Super Admin can also reinstate
  directly.
- A ban cannot be recommended for reinstatement. It ends only on appeal or by a Super Admin.
- When access returns, the person's next refresh gives them a full token with no new code.
- Earnings held during that restriction are released, unless another restriction remains. Fraud and duplicate-claim holds
  stay with their own review.
- Requests cancelled by the restriction stay cancelled.

## Appeals

One appeal per decision, within **30 days** of it.

- **Restriction:** heard by a Super Admin, whose answer is final (D#78). The person files in the app, or staff file for
  someone who does not use one.
- **Complaint outcome:** the member can challenge it. It moves up a level (Coordinator, Municipality Admin, Super Admin),
  and the level that decided loses sight of it (D#77). There can be a further appeal to the next level, until a Super
  Admin has answered.
- **Upheld:** nothing changes (AT-09). The person sees that the decision stands, and why.
- **Overturned:** a restriction ends as `OVERTURNED_ON_APPEAL`, and access and held earnings return automatically. A
  complaint's outcome flips, and the member sees the new message.

An appeal against a Super Admin's own direct decision needs a second Super Admin.

## API

| Route                                                                | Who                 |
| -------------------------------------------------------------------- | ------------------- |
| `POST /organizations/:id/restriction-cases`                          | Coordinator and up  |
| `GET /organizations/:id/restriction-cases`, `/:caseId`               | Coordinator and up  |
| `POST .../:caseId/approve`, `/refuse`, `/reinstate`, `/refuse-reinstatement` | The deciding level |
| `POST .../:caseId/notes`, `/recommend-reinstatement`                 | Coordinator and up  |
| `POST .../:caseId/appeal`                                            | Staff, for a member |
| `GET /me/restriction`, `POST /me/restriction/:caseId/appeal`         | The person          |
| `POST /organizations/:id/complaints/:complaintId/appeal`             | The member          |
| `GET /organizations/:id/appeals`, `/:appealId`, `POST .../decide`    | The hearing level   |
| `/admin/restriction-cases`, `/admin/appeals`, `/admin/restrictions`  | Super Admin         |

## Data

Migration `1729118400020-RestrictionCases` adds `restriction_cases`, append-only `restriction_case_events` and `appeals`.
It also backfills a case for each restriction already active, so those people can appeal too.

Set `RESTRICTION_REVIEW_INTERVAL_SECONDS` to change how often review reminders are checked (default 900).

## Limits

- A person with no app and no staff contact has no way to learn of a decision. Someone has to tell them.
- There is no target time for deciding an appeal. Set one once people have used it.
- A cancelled request is not rebooked after an overturn. The person books again.
- Not yet tried on a real phone or with real push.
