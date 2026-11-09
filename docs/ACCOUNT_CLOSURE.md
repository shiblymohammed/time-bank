# Account closure and nominees

Milestone 7, part 4 (FR-IDENT-06, FR-IDENT-07, FR-IDENT-08, D#44, D#45, D#46, D#87 to D#90). What happens when a member
dies or one person holds two accounts, and who can receive a deceased member's time credits.

## Who decides

A coordinator reports. Someone above decides. Nothing changes until they do, so one wrong report cannot lock anyone out.

| Case                                     | Decided by         |
| ---------------------------------------- | ------------------ |
| A member or coordinator in one community | Municipality Admin |
| A person in more than one community      | Super Admin        |
| A Municipality Admin or Super Admin      | Super Admin        |
| Reopening a closure made by mistake      | Super Admin        |

- Nobody acts on their own case, and the person concerned cannot read the staff record.
- Whoever reported cannot approve. Whoever recommended a transfer cannot approve it, and neither can whoever receives
  it.
- The last Super Admin cannot be closed.
- Approval rechecks current roles and community memberships, since either can change while a report is waiting.
- A duplicate decision locks both accounts before checking the survivor. Concurrent reciprocal decisions cannot close
  both accounts.

## Nominee

In the app, under Your nominee, a member gives a name and phone number. The nominee does not need an account yet.

- Adding, changing or removing needs a fresh code to the member's own phone.
- Earlier nominees are kept, and staff can see them on a closure. The audit log never holds a nominee's name or phone.
- A nominee named within 30 days before the reported death, or after it, goes to coordinator review. So does any nominee
  someone disputes. No credits move during a review.

## When a member dies

The coordinator records the date of death and the type of record seen, with its last 4 characters. No document is kept.

On approval:

- The person is signed out and cannot sign in. Waiting pushes are dropped and phones are unregistered.
- Requests that have not started are cancelled with the same generic wording as a restriction. Offers and upcoming
  visits are released, and coordinators are told about visits under way.
- Memberships are revoked, and so are staff roles. Open restriction recommendations end.
- The wallet is closed and keeps its balance, so nothing can be spent. Credits from a visit that finishes later are
  held.

Records stay where they are, with no separate archive. Closed people drop out of working lists but stay visible to
administrators.

### Passing on credits

1. The nominee joins the app. The coordinator checks their ID and recommends the transfer.
2. A Municipality Admin approves. If the account's phone is not the one the member named, only a Super Admin can.
3. Held earnings are released and the balance moves. Both ledger entries point at the closure.

- Credits under an open credit review stay behind. Once it ends, the same steps can pass them on.
- With no nominee, the credits stay frozen in the closed account.
- There is no waiting period, unless legal advice asks for one.

## When an account is a duplicate

The coordinator names both accounts. Staff see each one's balance, ID check, visits and requests side by side. An ID
check that refuses a repeated document points staff here.

On approval, the same stopping steps run, with these differences:

- Nothing is merged. The balance stays frozen in the closed account for good.
- The document is freed, so it can verify the account that stays.
- The person can still sign in to a limited session. They read the message staff wrote and can appeal within 30 days.

## Fixing a mistake

| Mistake                 | Who                                    | What comes back                                            |
| ----------------------- | -------------------------------------- | ---------------------------------------------------------- |
| Wrong death report      | Super Admin                            | Sign-in, memberships, wallet and credits held while closed |
| Wrong duplicate closure | Super Admin, on appeal or by reopening | The same, and the document if nobody else now holds it     |

- Staff roles never return by themselves. Someone must grant them again.
- A suspension ended while the account was closed stays ended on reopening. Still-active restrictions continue to apply.
  The older global restriction route cannot replace a closed status with a ban; reopen the closure first.
- Requests that were cancelled stay cancelled.
- Credits already passed on are not reversed. Staff correct them by hand with the existing credit tools.
- If another account now holds the document, the reopened account goes back to unverified and needs a new ID check.

## Not in this work

- **Loyalty coins (D#46, D#90):** retiring a closed account's coins belongs to Milestone 6, which is on its list.
- **A living member closing their own account:** not in the PRD. Check with a lawyer about India's data protection law.
- **Lost phone or SIM recovery (FR-IDENT-05):** not built, and needs a place in the order of work.
- **Reused phone numbers:** a closed account keeps its number. A later Super Admin action could release it.
- **A nominee who changes phone number:** a Super Admin decides, as above. There is no separate flow.

## Before real use

- Take legal advice on passing on credits after death (D#44 says "following verification and law").
- Test the nominee's phone code on a real phone with real Firebase. Only mock codes have been tested so far.
