#!/usr/bin/env bash
# Backup restore drill: proves a database backup can be restored, onto a separate scratch database.
#
#   scripts/backup-restore-drill.sh                       # take a fresh backup, then restore it
#   scripts/backup-restore-drill.sh /backups/x.sql.gz     # restore an existing backup
#   KEEP_DRILL_DB=1 scripts/backup-restore-drill.sh       # leave the scratch database to inspect
#
# Run it on the server from the deploy folder. It reads POSTGRES_USER and POSTGRES_DB from .env and
# runs the Postgres tools inside the compose postgres container. The live database is only read.
#
# Checks: the restore runs without a single SQL error; every live table exists in the copy; the
# copy holds the same migrations as live (or a subset, for an older backup); for a fresh backup,
# every table's row count lands between the live count just before the dump and just after the
# restore. Exit code 0 means PASS.
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
LIVE_DB=${POSTGRES_DB:?POSTGRES_DB must be set (in .env)}
DRILL_DB=${DRILL_DB:-ktb_restore_drill}
BACKUP_DIR=${BACKUP_DIR:-/backups}
# How to reach the Postgres tools. Empty runs them directly (local testing with PGHOST/PGPORT).
PG_EXEC=${PG_EXEC-docker compose -f docker-compose.server.yml exec -T postgres}

if [[ "$DRILL_DB" == "$LIVE_DB" ]]; then
  echo "DRILL_DB must not be the live database" >&2
  exit 2
fi
if [[ ! "$DRILL_DB" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "DRILL_DB may use only lower-case letters, digits and underscores" >&2
  exit 2
fi

pg() { $PG_EXEC "$@"; }
sql() { pg psql -X -q -t -A -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$1" -c "$2" | tr -d '\r'; }

# Row count of every table in the public schema, as "table count" lines, sorted.
counts() {
  sql "$1" "SELECT format('SELECT %L || '' '' || count(*) FROM public.%I', tablename, tablename)
            FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename" |
    while read -r query; do sql "$1" "$query"; done | tr -d '\r'
}

say() { echo "[drill] $*"; }
failed=0
fail() {
  echo "[drill] FAIL: $*"
  failed=1
}

fresh=0
backup=${1:-}
if [[ -z "$backup" ]]; then
  fresh=1
  mkdir -p "$BACKUP_DIR"
  backup="$BACKUP_DIR/drill-$(date +%Y%m%d-%H%M%S).sql.gz"
  say "Counting live rows before the backup"
  before=$(counts "$LIVE_DB")
  say "Taking a fresh backup: $backup"
  pg pg_dump -U "$DB_USER" "$LIVE_DB" | gzip >"$backup"
fi
[[ -s "$backup" ]] || {
  echo "Backup file is missing or empty: $backup" >&2
  exit 2
}
gzip -t "$backup" || {
  echo "Backup file is not a readable gzip file: $backup" >&2
  exit 2
}
say "Backup: $backup ($(du -h "$backup" | cut -f1))"

say "Creating scratch database $DRILL_DB"
sql postgres "DROP DATABASE IF EXISTS $DRILL_DB" >/dev/null
sql postgres "CREATE DATABASE $DRILL_DB" >/dev/null
cleanup() {
  if [[ "${KEEP_DRILL_DB:-0}" == 1 ]]; then
    say "Kept $DRILL_DB for inspection; drop it when done"
  else
    sql postgres "DROP DATABASE IF EXISTS $DRILL_DB" >/dev/null || true
  fi
}
trap cleanup EXIT

say "Restoring"
started=$(date +%s)
if ! gunzip -c "$backup" | pg psql -X -q -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DRILL_DB" >/dev/null; then
  fail "the restore stopped on an SQL error (see above)"
  exit 1
fi
say "Restored in $(($(date +%s) - started))s"

live_tables=$(sql "$LIVE_DB" "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")
copy_tables=$(sql "$DRILL_DB" "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")
missing=$(comm -23 <(echo "$live_tables") <(echo "$copy_tables"))
[[ -z "$missing" ]] || fail "tables missing from the copy: $(echo "$missing" | tr '\n' ' ')"

live_migrations=$(sql "$LIVE_DB" "SELECT name FROM migrations ORDER BY name")
copy_migrations=$(sql "$DRILL_DB" "SELECT name FROM migrations ORDER BY name")
extra=$(comm -13 <(echo "$live_migrations") <(echo "$copy_migrations"))
behind=$(comm -23 <(echo "$live_migrations") <(echo "$copy_migrations"))
[[ -z "$extra" ]] || fail "the copy has migrations live does not: $(echo "$extra" | tr '\n' ' ')"
if [[ -n "$behind" ]]; then
  if ((fresh)); then
    fail "the fresh copy is missing migrations: $(echo "$behind" | tr '\n' ' ')"
  else
    say "Older backup: it predates migrations $(echo "$behind" | tr '\n' ' ')"
  fi
fi
say "Migrations in the copy: $(echo "$copy_migrations" | grep -c . || true), latest $(sql "$DRILL_DB" "SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 1")"

copy=$(counts "$DRILL_DB")
if ((fresh)); then
  after=$(counts "$LIVE_DB")
  # Each table's copy count must lie between the live counts around the dump; traffic during the
  # drill can move a count, deletions cannot be told from loss, so those are listed for a re-run.
  while read -r table restored; do
    restored=${restored%$'\r'}
    low=$(awk -v t="$table" '$1 == t { print $2 }' <<<"$before")
    high=$(awk -v t="$table" '$1 == t { print $2 }' <<<"$after")
    [[ -n "$low" && -n "$high" ]] || continue
    if [[ ! "$restored$low$high" =~ ^[0-9]+$ ]]; then
      fail "could not read the row counts for $table"
      continue
    fi
    lo=$((low < high ? low : high))
    hi=$((low > high ? low : high))
    if ((restored < lo || restored > hi)); then
      fail "$table has $restored rows in the copy, live had $low before and $high after"
    fi
  done <<<"$copy"
fi
total=$(awk '{ s += $2 } END { print s + 0 }' <<<"$copy")
say "Rows in the copy: $total across $(echo "$copy" | grep -c . || true) tables"
for table in users organization_memberships service_requests time_credit_ledger audit_events; do
  awk -v t="$table" '$1 == t { printf "[drill]   %-26s %s\n", $1, $2 }' <<<"$copy"
done

if ((failed)); then
  say "RESULT: FAIL"
  exit 1
fi
say "RESULT: PASS - $backup restores cleanly onto a separate database"
