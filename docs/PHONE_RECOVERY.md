# Lost phone or SIM recovery

FR-IDENT-05, D#43. A coordinator checks someone's identity and moves their account to a new number. The account, wallet,
memberships, restrictions and visits stay the same, because they all belong to the account and not to the number.

## How it goes

1. **A coordinator opens a case** in the panel, under Phone number changes: the member number or old phone, the new
   number, and the ID document they saw in person. Nothing changes on the account yet, and it stays usable.
2. **The old phones get a push:** a request was made to change your number, and to call your coordinator if it was not
   you. It gives no new number and no reason.
3. **The new number confirms.** The person signs in with the new SIM, checks that the reference on screen is the one the
   coordinator reads out, and confirms with a fresh code. A member with a basic phone does this at the desk on any phone
   with the app: the SMS goes to their phone, and the coordinator types the code in.
4. **Someone above decides.** Approve stays blocked until the new number has confirmed.
5. **On approval, in one transaction:** the number moves, every session and registered device on the account ends, any
   merchant code waiting on the old phones is cancelled, and any empty account on the new number is retired.
6. **The person signs in again** with the new number and finds their account.

The new-number screen shows the reference and the community, and never the old account's name, balance or number,
because a mistyped number could belong to a stranger. "This is not me" ends the case and tells whoever opened it.

## Who decides

| Case                                       | Decided by         |
| ------------------------------------------ | ------------------ |
| Member or coordinator in one community     | Municipality Admin |
| Person in more than one community          | Super Admin        |
| Municipality Admin or Super Admin          | Super Admin        |
| Document does not match, or none on record | Super Admin        |
| Undoing a move                             | Super Admin        |

- Nobody opens, decides or reads their own case. Whoever opened it cannot approve it. Whoever approved it cannot undo
  it.
- The one exception: a Super Admin's own phone when no third Super Admin exists. The other Super Admin may open and
  approve.
- If the only Super Admin loses their phone, it takes a server script, like `set-staff-email.ts`.

## Identity check

The coordinator types the document's type and number. The server compares its fingerprint with the one on record, and
keeps only the type, the last 4 characters and the result.

| Result                               | What happens                               |
| ------------------------------------ | ------------------------------------------ |
| Matches this account                 | The usual person decides                   |
| None on record, or a different one   | A Super Admin decides                      |
| Already verifies a different account | Refused, and audited. See Account closures |

Membership approval has no ID check of its own, so some ordinary cases have nothing on record and go to a Super Admin.

## The new number

| Account on it                  | What happens                           |
| ------------------------------ | -------------------------------------- |
| None                           | Moves straight across                  |
| Empty, made by signing in      | Retired on approval                    |
| Only a waiting application     | The application must be rejected first |
| Anything real                  | Refused. One number holds one account  |
| Closed (deceased or duplicate) | Refused                                |

Empty means all of these: active; no memberships, or only rejected ones; not verified and no document; a zero balance
with nothing frozen and no ledger rows; no coins, coin history or merchant codes, and no merchant of its own; no
restriction, closure or nominee; no email. It is checked again at approval, under a lock.

An empty account is retired, not merged. No credits or history move. Two real accounts for one person are refused here,
and staff decide which to keep under [Account closures](ACCOUNT_CLOSURE.md).

## The old number

It is held for 90 days. Signing in with it is refused with "This number cannot be used right now. Contact your community
coordinator." A new organization's admin cannot be given a held number either.

The hold keeps a move undoable, and stops the real owner of a wrongly moved number silently getting a new empty account.
Indian operators must wait at least 90 days before reissuing a number, so a stranger holding it inside that time should
be rare. After 90 days the number is free.

Nobody can open a case to a held number. To move an account back, a Super Admin undoes the move.

## Nominees

- A member's nominee stays, and later changes take a code to the new number.
- If the new number is their own nominee's number, the deciders are warned. On approval that nominee ends, and the app
  asks the member to name someone else.
- A number that has moved on or off any account since the nominee was named no longer counts as a match, so a Super
  Admin decides. Otherwise a stranger later given that number would look like the nominee.
- While a case is open, nominee changes are refused, so a stolen phone with the SIM in it cannot change the nominee.
- A nominee named within 30 days after a move gets the same review as one named close to a death.
- Closing an account ends its open case, and a case cannot open while a closure report is open.

## Coins and the phone

- Coins belong to the account, like credits, and move with it. They stay usable until the decision.
- A merchant code waiting on the old phones is cancelled at approval (and again on undo). No coins were taken for it,
  since coins only leave the wallet when a merchant redeems a code, so nothing is lost. The member asks for a new code.
- A merchant's own contact number is not changed by a move. Staff edit it if the owner moved.
- When the server ends the session, the app deletes what it last saw, so a lost phone stops showing visits and addresses
  with no signal. Changes waiting to send stay on the phone, and are sent only if the same person signs in there again.

## Undoing a move

A Super Admin can undo a move while the old number is still held. The old number comes back, sessions and devices end
again, and the record keeps showing that it moved. It is refused if the account has moved again since, or if another
account now has the old number. Credits spent in between are corrected by hand, as with closures. The retired empty
account stays retired, and whoever holds that number gets a new one by signing in.

## Known limits

- **The account stays usable until the decision.** Someone holding a stolen phone and SIM could spend credits or coins
  until then. Only a Super Admin can freeze a wallet in that gap.
- **An old access token works for up to 15 minutes** after a move, as with restrictions. Refresh stops at once, and so
  do staff powers.
- **A lost phone that never gets signal again** keeps showing what it last saw, because only the server can tell it the
  session ended.
- **Cases do not expire.** A case stays open until someone decides or withdraws it.
- **No appeal.** A refused case can be opened again, and undo covers a wrong approval.
- **A member cannot change their own number** without a coordinator.
- **Legal:** holding a number and comparing ID documents should go in the existing privacy review.
- **Not tested on real phones.** The sign-in swap and push registering again need a second real SIM on a phone with real
  Firebase. Mock codes do not prove them.
