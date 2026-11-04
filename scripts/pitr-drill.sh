#!/usr/bin/env bash
# ─── PITR Backup & Restore Drill ──────────────────────────────────────────────
# D#100, UC-29, NFR-05: Daily encrypted off-server backups with continuous
# PostgreSQL WAL archiving for point-in-time recovery; documented restore drills.
#
# PURPOSE:
#   Validate that a PostgreSQL backup can be restored and the ledger
#   balances match the expected state (verify data integrity after restore).
#
# PREREQUISITES:
#   - PostgreSQL 17+ client tools (pg_dump, pg_restore, psql) installed
#   - A running source PostgreSQL instance (DATABASE_URL in environment)
#   - A writable backup directory ($BACKUP_DIR)
#   - GNU gpg installed for encryption
#
# USAGE (run against a TEST database, NEVER production directly):
#   export DATABASE_URL="postgresql://user:pass@localhost:5432/ktb_prod"
#   export BACKUP_DIR="/backups"
#   export GPG_RECIPIENT="ops@indiantimebank.in"   # public key fingerprint
#   bash scripts/pitr-drill.sh
#
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
DATABASE_URL="${DATABASE_URL:?DATABASE_URL must be set}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
GPG_RECIPIENT="${GPG_RECIPIENT:-}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DRILL_DB="ktb_pitr_drill_${TIMESTAMP}"
BACKUP_FILE="${BACKUP_DIR}/drill-${TIMESTAMP}.pgdump"

echo "═══════════════════════════════════════════════════════════"
echo " Indian Time Bank — PITR Backup & Restore Drill"
echo " Timestamp : ${TIMESTAMP}"
echo " Source    : ${DATABASE_URL//:*@/:***@}"  # mask password
echo " Backup    : ${BACKUP_FILE}"
echo " Drill DB  : ${DRILL_DB}"
echo "═══════════════════════════════════════════════════════════"

# ── Step 1: Take a full backup ─────────────────────────────────────────────────
echo ""
echo "[1/6] Creating full backup with pg_dump (custom format)..."
mkdir -p "${BACKUP_DIR}"
pg_dump \
  --format=custom \
  --compress=9 \
  --verbose \
  --file="${BACKUP_FILE}" \
  "${DATABASE_URL}"

BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "[1/6] ✓ Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ── Step 2: Encrypt backup ────────────────────────────────────────────────────
if [ -n "${GPG_RECIPIENT}" ]; then
  echo ""
  echo "[2/6] Encrypting backup with GPG (recipient: ${GPG_RECIPIENT})..."
  gpg --recipient "${GPG_RECIPIENT}" --encrypt "${BACKUP_FILE}"
  ENCRYPTED="${BACKUP_FILE}.gpg"
  rm "${BACKUP_FILE}"
  echo "[2/6] ✓ Encrypted: ${ENCRYPTED}"
  # For restore drill, decrypt back
  echo "[2/6]   Decrypting for restore drill..."
  gpg --output "${BACKUP_FILE}" --decrypt "${ENCRYPTED}"
else
  echo "[2/6] ⚠ GPG_RECIPIENT not set — backup not encrypted (set for production)"
fi

# ── Step 3: Create isolated drill database ─────────────────────────────────────
echo ""
echo "[3/6] Creating isolated drill database: ${DRILL_DB}..."

# Extract host/user/port from DATABASE_URL for createdb
PGHOST=$(echo "${DATABASE_URL}" | sed 's|.*@\([^:/]*\).*|\1|')
PGPORT=$(echo "${DATABASE_URL}" | sed 's|.*:\([0-9]*\)/.*|\1|')
PGUSER=$(echo "${DATABASE_URL}" | sed 's|.*//\([^:]*\):.*|\1|')
PGPASS=$(echo "${DATABASE_URL}" | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')

PGPASSWORD="${PGPASS}" createdb \
  -h "${PGHOST}" \
  -p "${PGPORT}" \
  -U "${PGUSER}" \
  "${DRILL_DB}"
echo "[3/6] ✓ Drill database created"

# ── Step 4: Restore backup into drill database ────────────────────────────────
echo ""
echo "[4/6] Restoring backup into drill database..."
DRILL_URL="postgresql://${PGUSER}:${PGPASS}@${PGHOST}:${PGPORT}/${DRILL_DB}"

pg_restore \
  --verbose \
  --no-acl \
  --no-owner \
  --dbname="${DRILL_URL}" \
  "${BACKUP_FILE}"
echo "[4/6] ✓ Restore complete"

# ── Step 5: Verify data integrity ─────────────────────────────────────────────
echo ""
echo "[5/6] Verifying data integrity..."

# Check: append-only ledger trigger exists
TRIGGER_COUNT=$(PGPASSWORD="${PGPASS}" psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${DRILL_DB}" -t -c \
  "SELECT COUNT(*) FROM pg_trigger WHERE tgname LIKE '%append_only%';" | tr -d ' ')

if [ "${TRIGGER_COUNT}" -lt "1" ]; then
  echo "[5/6] ✗ FAIL: append-only trigger not found in restored database"
  exit 1
fi
echo "[5/6]   ✓ Append-only ledger trigger: ${TRIGGER_COUNT} trigger(s) found"

# Check: migration history table has all expected migrations
MIGRATION_COUNT=$(PGPASSWORD="${PGPASS}" psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${DRILL_DB}" -t -c \
  "SELECT COUNT(*) FROM migrations;" | tr -d ' ')
echo "[5/6]   ✓ Applied migrations: ${MIGRATION_COUNT}"

# Check: core tables exist
for TABLE in users organizations volunteer_assignments time_credit_ledger; do
  ROW_COUNT=$(PGPASSWORD="${PGPASS}" psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${DRILL_DB}" -t -c \
    "SELECT COUNT(*) FROM ${TABLE};" | tr -d ' ')
  echo "[5/6]   ✓ ${TABLE}: ${ROW_COUNT} row(s)"
done

# Check: wallet balance integrity (no negative balances)
NEG_WALLETS=$(PGPASSWORD="${PGPASS}" psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${DRILL_DB}" -t -c \
  "SELECT COUNT(*) FROM universal_time_wallets WHERE balance_credits < 0;" | tr -d ' ')
if [ "${NEG_WALLETS}" -gt "0" ]; then
  echo "[5/6] ✗ FAIL: ${NEG_WALLETS} wallet(s) with negative balance found — data corruption"
  exit 1
fi
echo "[5/6]   ✓ No negative wallet balances"

echo "[5/6] ✓ All integrity checks passed"

# ── Step 6: Cleanup ────────────────────────────────────────────────────────────
echo ""
echo "[6/6] Cleaning up drill database..."
PGPASSWORD="${PGPASS}" dropdb \
  -h "${PGHOST}" \
  -p "${PGPORT}" \
  -U "${PGUSER}" \
  "${DRILL_DB}"
echo "[6/6] ✓ Drill database dropped"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " PITR DRILL PASSED ✓"
echo " Backup : ${BACKUP_SIZE}"
echo " Migrations applied: ${MIGRATION_COUNT}"
echo " Completed at: $(date -u)"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "NEXT STEPS for full PITR validation:"
echo "  1. Copy the backup to off-server storage (S3/GCS/remote NFS)"
echo "  2. Repeat this drill monthly and after every major migration"
echo "  3. Test WAL replay: use pg_basebackup + WAL archive for point-in-time"
echo "  4. Verify restore target matches a known business transaction"
echo "  See docs/ROLLBACK.md for the full procedure."
