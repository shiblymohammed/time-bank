# Team visits and handovers

Milestone 5 (FR-TEAM, D#31 to D#34, D#63 to D#69, BR-06, BR-07). A visit for one volunteer works as it always has,
except that the only volunteer can now hand it over.

## Filling a team

- Each service sets a safe minimum and a preferred number of volunteers.
- Offers stay open until the preferred number is booked or the visit starts. Volunteers already working count as booked.
- Automatic matching looks for more people only while a request is below its minimum. Between the minimum and the
  preferred number, the offers already sent stay open, and volunteers or coordinators can add people.
- **Invitations:** a booked volunteer can invite someone by exact membership number or phone number, up to 5 per visit.
  There is no way to browse members. Every refusal about the person reads the same, so an invitation cannot reveal who
  is a member. Services on coordinator dispatch cannot be invited to.
- Teammates see each other's names and phone numbers only while both are booked or under way.

## Starting

- With a minimum above 1, Start means "I've arrived". Timers begin together when the last needed volunteer arrives.
- Anyone arriving later starts their own timer when they press Start.
- Someone who has arrived cannot be marked as a no-show. If the team never assembles, the usual matching and escalation
  continue, and the volunteer can still withdraw.
- Each volunteer has their own timer, Finish, confirmation and credits.

## When a team falls below its minimum

| What happened                   | When the team counts as short                           |
| ------------------------------- | ------------------------------------------------------- |
| "I have to leave"               | Straight away                                           |
| A teammate pressed Finish       | After 10 minutes, if the others have not finished too   |
| A volunteer left after an alert | After 10 minutes (staff are already handling the alert) |

Once short, the coordinator is told, the people on site are told, and the open place goes on offer until enough people
are booked. Timers keep running. On a service marked hazardous, people on site are told to stop heavy or risky work.
That instruction is a message: nothing in the system can enforce it. "Short" ends when enough volunteers are actually on
site, not when someone accepts. Super admins mark a service as hazardous in the central service rules.

While a safety alert has anyone paused, nobody new can start and no offers go out. The shortage waits until the visit
restarts or ends.

"I have to leave" is only for someone with a teammate still working. Their own time counts and is confirmed in the usual
way (FR-TEAM-06).

## Handing over

"I cannot carry on" is for the last volunteer on site.

- **Pay:** only the volunteer who finishes earns, for their own timed minutes (D#33, BR-06). The volunteer who handed
  over earns nothing, even for time already given. The app says so before they confirm, and the server refuses a
  handover without that acknowledgement. Their minutes stay on record. Their assignment becomes `REPLACED` and links to
  the replacement through `replaced_by_assignment_id`.
- **Finding someone:** routine visits go back on offer. Sensitive services and immediate requests go only to a
  coordinator (D#32).
- **Nobody takes it:** once no offer is left open, the coordinator is told. They can dispatch someone, or use **Stop
  looking**. If nobody is left, the request closes: `COMPLETED` if help was delivered, otherwise `CANCELLED`, recorded
  as `NO_REPLACEMENT_FOUND`. A request never reads as completed when only handovers are left.

A visit that is short appears in the panel's review filter until it is settled.

## Safety alerts

See [SAFETY_ALERTS.md](SAFETY_ALERTS.md). An alert pauses everyone. Each volunteer then restarts or leaves for
themselves, and only the beneficiary, their caregiver or staff can end the visit for the whole team.

## API

| Call                                                           | Who                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| `POST /organizations/:id/assignments/:assignmentId/start`      | Volunteer; on a team, "I've arrived"                      |
| `POST /organizations/:id/assignments/:assignmentId/leave`      | Volunteer with a teammate working                         |
| `POST /organizations/:id/assignments/:assignmentId/hand-over`  | Last volunteer on site, with `acknowledgeNoCredits: true` |
| `POST /organizations/:id/assignments/:assignmentId/invite`     | Booked volunteer                                          |
| `POST /organizations/:id/requests/:requestId/stop-replacement` | Staff                                                     |

`GET assignments/mine` returns a `team` object saying what is open to that volunteer (`canLeave`, `canHandOver`,
`canInvite`). A request's `stage` is `AWAITING_REPLACEMENT` while nobody is working and someone must take over.

## Limits

- A safety alert can be raised only once a visit has started, so someone waiting alone for their team cannot raise one.
  They should call their coordinator or 112.
- A search during a visit sends one round of offers, then goes to the coordinator. It does not widen the search area.
- The volunteer's own time before a handover is not paid. This follows the PRD, and is worth reviewing with coordinators
  once people have used it.
- Coins for team visits and handovers (D#34) come with Milestone 6, and working offline with Milestone 8.
