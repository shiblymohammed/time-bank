# Membership applications

An applicant says what they want to do when they apply, and a volunteer says how they can help. Migration
`1729118400009-MembershipApplications` adds three columns to `organization_memberships`: `requested_role`,
`application_notes` and `application_details`. Nothing here grants a role by itself; a coordinator still approves every
application (ITB-005, ITB-007).

## Endpoints

| Endpoint                                               | Who                  | What changed                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/organizations/:id/memberships/apply`        | Any signed-in user   | Optional `requestedRole` (`VOLUNTEER`, `BENEFICIARY` or `CAREGIVER`), `notes` (up to 500 characters) and, with `VOLUNTEER` only, `volunteer`: `maxTravelRadiusKm` 0.5–50 (default 5), `availableAtShortNotice`, `usualDays` (`MON`–`SUN`), `usualTimes` (`MORNING`, `AFTERNOON`, `EVENING`) and up to 20 `skillCodes`. |
| `POST /api/organizations/:id/memberships/:mid/approve` | Coordinator or above | Without `initialRole`, grants the requested role, and `VOLUNTEER` when none was requested.                                                                                                                                                                                                                             |
| `GET /api/catalogue/skills`                            | Anyone               | The skill codes that active global services require, with readable labels (`FIRST_AID` → "First aid").                                                                                                                                                                                                                 |
| `GET /api/auth/me`                                     | The signed-in user   | Each membership includes `requestedRole`.                                                                                                                                                                                                                                                                              |
| `GET /api/organizations/:id/memberships/:mid`          | Coordinator or above | Includes `requestedRole`, `applicationNotes` and `applicationDetails`.                                                                                                                                                                                                                                                 |

## Rules

- **Roles:** applicants can ask only for an operational role. Database check `chk_membership_requested_role` refuses
  anything else, and `chk_membership_application_details` keeps the answers a JSON object.
- **Skills:** each claimed code must be one that an active service requires (400 otherwise). A claim is not a
  qualification: approval turns each claimed skill into a `PENDING_VERIFICATION` row in `volunteer_skills`, and a
  coordinator verifies it before matching uses it.
- **Approval:** when the granted role is `VOLUNTEER`, approval also creates the volunteer's availability from the
  answers (travel radius and short notice) if none exists. If the approver grants another role, the answers stay on the
  application only.
- **Usual days and times** are for the coordinator. Matching has no weekly schedule yet, so they are not used to match.
- **Changing an application:** a pending applicant who applies again with new answers updates them; an applicant
  applying again after a rejection replaces them. An identical retry without answers returns the application unchanged.
- **Help roles:** `BENEFICIARY` still needs eligibility, and `CAREGIVER` still needs a coordinator to authorize them for
  a particular person. Asking for either role does neither.
- The `MEMBERSHIP_APPLIED` audit event records the requested role.

## Checks

- Unit tests cover storing the answers, refusing volunteer answers for other roles and unknown skills, a pending
  applicant changing their request, and approval granting the requested role and seeding availability and pending
  skills.
- `scripts/test-matching-concurrency.ps1` applies all ten migrations. Its application tests run the real service against
  PostgreSQL, including both database checks.
- On 1 November 2026, an HTTP walk-through against the disposable interface QA API passed all 14 of its checks.
