# Complaints

Milestone 7, part 2 (FR-SAFE-03, D#28, D#75, D#76). A member tells the community about something that went wrong, in
confidence. Safety alerts are for during a visit: a complaint can be about anything, at any time.

## Who handles a complaint

The member says what it is about. That choice sets the level, so nobody has to name a member of staff and the app never
needs a staff list.

| About                              | Goes to            | Out of reach                          |
| ---------------------------------- | ------------------ | ------------------------------------- |
| A volunteer, member or the service | Coordinators       | Anyone it involves, and other members |
| A coordinator                      | Municipality Admin | Every coordinator                     |
| A Municipality Admin               | Super Admin        | Every coordinator and administrator   |

- Each level can also read and act on the levels below it. A Municipality Admin can pick up a routine complaint.
- Nobody handles a complaint they made, or one about a visit they were part of (asked for, booked or agreed to help
  with).
- If nobody at that level can take it, for example a community with no administrator, a Super Admin is told.
- Any handler can **pass it up** with a reason. It goes to the next level with its full history, and the level below
  loses sight of it (D#77). A Super Admin is the final authority (D#78).

## Confidentiality

- Handlers see who complained, so they can call back. Fully anonymous complaints were ruled out: they are hard to act on
  and easy to abuse.
- Anyone who cannot read a complaint gets the same "not found" as for one that does not exist.
- Lists hold no words or names. Reading a complaint is a separate call.
- A Super Admin can read any complaint. Reading one below their level leaves `COMPLAINT_READ_CENTRALLY` on the audit
  trail.
- Push messages are generic, because they show on locked screens.
- The audit trail records that something happened, never the words. The words stay on `complaints` and
  `complaint_events`, where these rules protect them. `complaint_events` is append-only: a database trigger refuses any
  change.

## Making one

- In the app: **Profile > Complaints**, or **Make a complaint** on one of the member's own visits. "Report a problem" on
  a finished visit is different: it disputes the time, and holds the credits.
- A member can link only a visit they asked for, booked or agreed to help with. An offer they never accepted does not
  count.
- 5 complaints in 24 hours per person, so the queue cannot be flooded. Past that, the app asks them to call.
- A retry after a dropped connection finds the complaint already made.
- Only an approved member of the community can complain. A suspended or banned member cannot. Their route is an
  [appeal](RESTRICTIONS.md#appeals).

## Handling one

In the panel: **Complaints**. Choose **All organizations** as a Super Admin to see every community.

- **I am handling this:** other staff see someone has it.
- **Add a note:** kept in the history. The member does not see it.
- **Pass up:** see above.
- **Close with a decision:** upheld or not upheld, with a reason for the record and a message for the member.

The member sees Received, Being looked at, then Upheld or Not upheld with the message. They never see who handled it,
its level or staff notes.

A complaint never moves credits or restricts anyone by itself. To restrict someone, staff open a
[restriction case](RESTRICTIONS.md) and give the complaint's reference.

A member can challenge the outcome within 30 days. The appeal goes to the next level, and the level that decided loses
sight of it. See [appeals](RESTRICTIONS.md#appeals).

## API

| Call                                                      | Who                             |
| --------------------------------------------------------- | ------------------------------- |
| `POST /organizations/:id/complaints`                      | Approved member                 |
| `GET /organizations/:id/complaints/mine`                  | Member, their own               |
| `GET /organizations/:id/complaints?open=false`            | Staff, a summary at their level |
| `GET /admin/complaints?open=false`                        | Super Admin, every community    |
| `GET /organizations/:id/complaints/:complaintId`          | Staff at that level or above    |
| `POST /organizations/:id/complaints/:complaintId/take`    | Same                            |
| `POST /organizations/:id/complaints/:complaintId/notes`   | Same                            |
| `POST /organizations/:id/complaints/:complaintId/pass-up` | Same                            |
| `POST /organizations/:id/complaints/:complaintId/decide`  | Same                            |

## Limits

- Text only, with no photos or documents.
- A closed complaint cannot be reopened. The member's route is an appeal (D#77).
- A caregiver can link a visit only if they booked it themselves.
- There is no target time for a response. Set one with coordinators once people have used it.
