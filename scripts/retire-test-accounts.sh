#!/usr/bin/env bash
# Retires test or demo accounts on a database that also holds real people.
#
#   scripts/retire-test-accounts.sh phones.txt                             # shows what would happen
#   CONFIRM_DATABASE=<POSTGRES_DB> scripts/retire-test-accounts.sh phones.txt --apply
#
# phones.txt lists one number per line in full, such as +919876543210. There is deliberately no
# "looks like a test number" rule: a real person's number can look like anything.
#
# If everything on the database is test data, do not use this. Recreate the database instead and
# let the migrations run, which leaves nothing behind.
#
# Retiring keeps history. The credit ledger is append-only by design, so these accounts' entries
# and any balance stay, marked by the closed account. The account cannot sign in, its phone number
# and ID document can be used by a real person, its memberships and roles are revoked, and its open
# requests and offers are cancelled. Each one writes an audit event.
#
# Nothing changes if any listed account is a Super Admin, or shares a booked or unconfirmed visit
# with someone not on the list: deal with that visit first. Take a backup before --apply.
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=${ENV_FILE:-.env}
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi
DB_USER=${POSTGRES_USER:?POSTGRES_USER must be set (in .env)}
DB=${POSTGRES_DB:?POSTGRES_DB must be set (in .env)}
# How to reach the Postgres tools. Empty runs them directly (local testing with PGHOST/PGPORT).
PG_EXEC=${PG_EXEC-docker compose -f docker-compose.server.yml exec -T postgres}

FILE=${1:?Usage: retire-test-accounts.sh phones.txt [--apply]}
APPLY=${2:-}
if [[ -n "$APPLY" && "$APPLY" != "--apply" ]]; then
  echo "Unknown option: $APPLY" >&2
  exit 2
fi
if [[ "$APPLY" == "--apply" && "${CONFIRM_DATABASE:-}" != "$DB" ]]; then
  echo "To change database $DB, also set CONFIRM_DATABASE=$DB" >&2
  exit 2
fi

phones=""
while IFS= read -r line || [[ -n "$line" ]]; do
  line=${line%$'\r'}
  line=${line//[[:space:]]/}
  [[ -z "$line" || "$line" == \#* ]] && continue
  if [[ ! "$line" =~ ^\+[0-9]{10,15}$ ]]; then
    echo "Not a full phone number: $line" >&2
    exit 2
  fi
  phones+="${phones:+,}$line"
done <"$FILE"
if [[ -z "$phones" ]]; then
  echo "No phone numbers in $FILE" >&2
  exit 2
fi

if [[ "$APPLY" == "--apply" ]]; then FINISH=COMMIT; else FINISH=ROLLBACK; fi

# One transaction: every account is retired, or none. A preview runs the same steps and rolls back.
$PG_EXEC psql -U "$DB_USER" -d "$DB" -X -q -v ON_ERROR_STOP=1 -v phones="$phones" -v finish="$FINISH" <<'SQL'
BEGIN;

CREATE TEMP TABLE listed ON COMMIT DROP AS
  SELECT unnest(string_to_array(:'phones', ',')) AS phone;
CREATE TEMP TABLE targets ON COMMIT DROP AS
  SELECT u.id, u.phone_e164 AS phone FROM users u JOIN listed l ON l.phone = u.phone_e164;

\pset footer off
\echo
\echo 'Not found (already retired, or a mistyped number):'
SELECT phone FROM listed WHERE phone NOT IN (SELECT phone FROM targets);

\echo 'Accounts to retire:'
SELECT t.phone, u.full_name AS name, u.status,
       (SELECT count(*) FROM organization_memberships m WHERE m.user_id = t.id) AS memberships,
       (SELECT coalesce(w.balance_credits, 0) FROM universal_time_wallets w WHERE w.user_id = t.id)
         AS credits_kept_in_ledger
FROM targets t JOIN users u ON u.id = t.id ORDER BY t.phone;

-- Requests still open, on either side of a visit.
CREATE TEMP TABLE open_requests ON COMMIT DROP AS
  SELECT r.id, r.beneficiary_membership_id, r.created_by_user_id
  FROM service_requests r
  WHERE r.status NOT IN ('COMPLETED', 'CANCELLED', 'EXPIRED_UNMATCHED');

\echo 'Visits shared with someone not on the list (these stop the run):'
CREATE TEMP TABLE shared ON COMMIT DROP AS
  SELECT r.id AS request, ub.phone_e164 AS beneficiary, uv.phone_e164 AS volunteer, a.status
  FROM open_requests r
  JOIN volunteer_assignments a ON a.service_request_id = r.id
  JOIN organization_memberships mb ON mb.id = r.beneficiary_membership_id
  JOIN users ub ON ub.id = mb.user_id
  JOIN organization_memberships mv ON mv.id = a.volunteer_membership_id
  JOIN users uv ON uv.id = mv.user_id
  WHERE (a.status IN ('ACCEPTED', 'IN_PROGRESS') OR (a.status = 'COMPLETED' AND a.confirmed_at IS NULL))
    AND (ub.id IN (SELECT id FROM targets)) <> (uv.id IN (SELECT id FROM targets));
SELECT * FROM shared;

\echo 'Super Admins on the list (these stop the run):'
CREATE TEMP TABLE super_admins ON COMMIT DROP AS
  SELECT DISTINCT t.phone
  FROM targets t
  JOIN organization_memberships m ON m.user_id = t.id
  JOIN membership_role_grants g ON g.membership_id = m.id
  WHERE g.role = 'SUPER_ADMIN' AND g.status IN ('ACTIVE', 'PENDING_APPROVAL');
SELECT * FROM super_admins;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM shared) OR EXISTS (SELECT 1 FROM super_admins) THEN
    RAISE EXCEPTION 'Nothing changed. Sort out the visits or Super Admins listed above first.';
  END IF;
END $$;

-- Requests owned by a listed person end, with every offer on them.
CREATE TEMP TABLE ending ON COMMIT DROP AS
  SELECT r.id FROM open_requests r
  JOIN organization_memberships m ON m.id = r.beneficiary_membership_id
  WHERE m.user_id IN (SELECT id FROM targets)
     OR r.created_by_user_id IN (SELECT id FROM targets);
UPDATE volunteer_assignments SET status = 'CANCELLED', paused_at = NULL, updated_at = now()
  WHERE service_request_id IN (SELECT id FROM ending)
    AND status IN ('OFFERED', 'ACCEPTED', 'IN_PROGRESS');
UPDATE service_requests SET status = 'CANCELLED', updated_at = now()
  WHERE id IN (SELECT id FROM ending);
UPDATE safety_alerts SET status = 'RESOLVED', outcome = 'ENDED', resolved_at = now(),
    staff_notes = 'Test account retired', updated_at = now()
  WHERE status <> 'RESOLVED' AND service_request_id IN (SELECT id FROM ending);

-- Their complaints close. The record stays.
UPDATE complaints SET status = 'CLOSED', outcome = 'NOT_UPHELD', decided_at = now(),
    member_message = 'Test account retired', updated_at = now()
  WHERE status <> 'CLOSED' AND raised_by_user_id IN (SELECT id FROM targets);

-- Their open recommendations and appeals close. The records stay.
UPDATE restriction_cases SET status = 'REFUSED', decided_at = now(), updated_at = now()
  WHERE status = 'RECOMMENDED' AND subject_user_id IN (SELECT id FROM targets);
UPDATE appeals SET status = 'DECIDED', outcome = 'STANDS', decided_at = now(),
    member_message = 'Test account retired', updated_at = now()
  WHERE status = 'OPEN' AND appellant_user_id IN (SELECT id FROM targets);

-- Their nominee goes, and any closure reported for them ends. The records stay.
UPDATE death_nominees SET replaced_at = now()
  WHERE replaced_at IS NULL AND user_id IN (SELECT id FROM targets);
UPDATE account_closures SET status = 'REFUSED', decided_at = now(), updated_at = now()
  WHERE status = 'REPORTED' AND subject_user_id IN (SELECT id FROM targets);

-- Offers to a listed volunteer on someone else's request; matching moves on to others.
UPDATE volunteer_assignments SET status = 'CANCELLED', updated_at = now()
  WHERE status = 'OFFERED'
    AND volunteer_membership_id IN
      (SELECT id FROM organization_memberships WHERE user_id IN (SELECT id FROM targets));

UPDATE membership_role_grants SET status = 'REVOKED', revoked_at = now(),
    revocation_reason = 'Test account retired'
  WHERE status <> 'REVOKED' AND membership_id IN
    (SELECT id FROM organization_memberships WHERE user_id IN (SELECT id FROM targets));
UPDATE organization_memberships SET status = 'REVOKED', updated_at = now()
  WHERE user_id IN (SELECT id FROM targets);

UPDATE verified_identities SET verification_status = 'UNVERIFIED', verification_level = 'BASIC',
    verified_at = NULL, document_type = NULL, document_last4 = NULL, document_fingerprint = NULL,
    verification_notes = NULL, updated_at = now()
  WHERE user_id IN (SELECT id FROM targets);

UPDATE authentication_sessions SET revoked_at = now()
  WHERE revoked_at IS NULL AND user_id IN (SELECT id FROM targets);
DELETE FROM push_devices WHERE user_id IN (SELECT id FROM targets);
UPDATE notification_outbox SET status = 'EXPIRED'
  WHERE status = 'PENDING' AND user_id IN (SELECT id FROM targets);

INSERT INTO audit_events (event_type, target_id, target_type, payload)
  SELECT 'TEST_ACCOUNT_RETIRED', t.id, 'USER',
         jsonb_build_object('phoneLast4', right(t.phone, 4), 'tool', 'retire-test-accounts.sh')
  FROM targets t;

-- Last, so the real number is free for a real person to sign up with.
UPDATE users SET status = 'TEST_ACCOUNT_RETIRED', full_name = NULL, email = NULL,
    phone_e164 = 'retired-' || left(replace(id::text, '-', ''), 12), updated_at = now()
  WHERE id IN (SELECT id FROM targets);

SELECT count(*) AS accounts, :'finish' AS result FROM targets;

:finish;
SQL

if [[ "$APPLY" == "--apply" ]]; then
  echo "Done: the accounts above are retired."
else
  echo "Preview only, nothing changed. Run again with --apply and CONFIRM_DATABASE=$DB."
fi
