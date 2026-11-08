#!/usr/bin/env bash
# Nightly database backup with retention. Run on the server from the deploy folder, for example
# from root's crontab at 02:30 India time:
#
#   30 21 * * * cd /opt/time-bank && scripts/backup-database.sh >> /backups/backup.log 2>&1
#
# Keeps BACKUP_KEEP_DAYS days (default 14) of nightly-*.sql.gz in BACKUP_DIR (default /backups).
# Pre-deploy and drill backups are left alone. Copy BACKUP_DIR off the server as well: a backup on
# the same disk does not survive losing that disk.
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
BACKUP_DIR=${BACKUP_DIR:-/backups}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
PG_EXEC=${PG_EXEC-docker compose -f docker-compose.server.yml exec -T postgres}

mkdir -p "$BACKUP_DIR"
target="$BACKUP_DIR/nightly-$(date +%Y%m%d-%H%M%S).sql.gz"
partial="$target.partial"
trap 'rm -f "$partial"' EXIT

# Written under a temporary name, so a failed run never leaves a backup that looks complete.
$PG_EXEC pg_dump -U "$DB_USER" "$DB" | gzip >"$partial"
gzip -t "$partial"
mv "$partial" "$target"
echo "[backup] $(date -Is) wrote $target ($(du -h "$target" | cut -f1))"

find "$BACKUP_DIR" -maxdepth 1 -name 'nightly-*.sql.gz' -mtime "+$KEEP_DAYS" -print -delete |
  sed 's/^/[backup] removed old /'
