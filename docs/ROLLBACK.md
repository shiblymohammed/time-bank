# Indian Time Bank — Rollback & Recovery Procedure

**Reference:** NFR-17 (versioned migrations with rollback plans), UC-30, D#100, D#101
**Updated:** November 2026

---

## Overview

This document defines the rollback procedure for the Indian Time Bank production deployment. It covers:

1. **Application rollback** — reverting to a previous container image
2. **Database migration rollback** — reverting schema changes
3. **Point-in-time recovery (PITR)** — restoring from a backup to a specific timestamp

All production changes use versioned container images pushed to GHCR. The deploy workflow (`deploy.yml`) captures the previous image tag before every deployment, enabling immediate rollback.

---

## 1. Application Rollback (< 5 minutes)

### When to use
- New deployment fails health checks
- API returns unexpected errors after deployment
- New code introduces a regression caught in production monitoring

### Automated rollback (handled by deploy.yml)
The `deploy.yml` workflow automatically rolls back if health checks fail within 3 minutes of deployment. The previous image tag is captured before deployment and restored if needed.

### Manual rollback

```bash
# SSH into the VPS
ssh ${VPS_USER}@${VPS_HOST} -p ${VPS_SSH_PORT}
cd /opt/ktb

# Check what images are available
docker images ghcr.io/*/api --format "{{.Tag}}\t{{.CreatedAt}}" | head -10

# Roll back to a specific tag
IMAGE_TAG=sha-abc1234 GITHUB_REPOSITORY=your-org/time-bank \
  docker compose -f docker-compose.prod.yml up -d --no-build api web nginx

# Verify health
curl -sf http://localhost/api/health/ready
```

### Smoke test after rollback
```bash
# Liveness
curl -sf http://localhost/api/health/live | jq '.status'

# Readiness (database)
curl -sf http://localhost/api/health/ready | jq '.status'

# Metrics
curl -sf http://localhost/api/health/metrics | jq '.uptime'
```

---

## 2. Database Migration Rollback

### When to use
- A migration introduced a bug or data corruption
- Schema change is incompatible with the rolled-back application version

### Important constraints
- **Ledger tables (`time_credit_ledger`, `loyalty_coin_ledger`) are append-only** — the DB trigger rejects UPDATE and DELETE. Never attempt to reverse ledger rows; use a corrective entry instead.
- **Migration 0012 and later** add governance tables — these can be safely dropped on rollback because they don't have foreign keys from earlier tables.
- **Migrations 0001–0009** touch core identity/ledger tables — rolling these back risks data loss. Do not roll back unless you have a clean backup to restore.

### Procedure

```bash
# On the VPS — run the migration revert in a one-shot container
docker run --rm \
  --network ktb_internal \
  --env DATABASE_URL="${DATABASE_URL}" \
  --env DATABASE_SSL="${DATABASE_SSL:-false}" \
  "ghcr.io/${GITHUB_REPOSITORY}/api:${PREVIOUS_IMAGE_TAG}" \
  sh -c "cd /app && node -e \"
    const { AppDataSource } = require('./apps/api/dist/database/data-source');
    AppDataSource.initialize()
      .then(() => AppDataSource.undoLastMigration())
      .then(() => { console.log('Migration reverted'); process.exit(0); })
      .catch((e) => { console.error(e); process.exit(1); });
  \""
```

### Verify after migration rollback
```bash
# Check applied migrations
docker run --rm \
  --env DATABASE_URL="${DATABASE_URL}" \
  "ghcr.io/${GITHUB_REPOSITORY}/api:${PREVIOUS_IMAGE_TAG}" \
  node -e "
    const { AppDataSource } = require('./apps/api/dist/database/data-source');
    AppDataSource.initialize()
      .then(() => AppDataSource.showMigrations())
      .then(() => process.exit(0));
  "
```

---

## 3. Point-in-Time Recovery (PITR)

### When to use
- Data corruption discovered hours or days after a bad deployment
- Accidental deletion of critical records
- Catastrophic hardware or storage failure

### Prerequisites
- PostgreSQL WAL archiving enabled (`archive_mode = on` in `postgresql.conf`)
- WAL archives stored at `/var/lib/postgresql/wal_archive` (also synced off-server)
- Base backup taken daily via pg_basebackup

### Recovery steps

```bash
# 1. Stop all application containers
docker compose -f docker-compose.prod.yml stop api web

# 2. Identify the recovery target time
#    Check audit_events table to find when the corruption started:
psql "${DATABASE_URL}" -c \
  "SELECT created_at, event_type, actor_id FROM audit_events ORDER BY created_at DESC LIMIT 20;"

# 3. Restore base backup to a recovery directory
RECOVERY_TARGET="2026-11-01 14:30:00+05:30"  # IST timestamp of last known good state
BASE_BACKUP_DIR="/backups/base-backup-latest"
RESTORE_DIR="/var/lib/postgresql/17/recovery"

mkdir -p "${RESTORE_DIR}"
tar -xzf /backups/base-backup-latest.tar.gz -C "${RESTORE_DIR}"

# 4. Create recovery signal and config
cat > "${RESTORE_DIR}/recovery.signal" << EOF
EOF

cat >> "${RESTORE_DIR}/postgresql.conf" << EOF
restore_command = 'cp /var/lib/postgresql/wal_archive/%f %p'
recovery_target_time = '${RECOVERY_TARGET}'
recovery_target_action = 'promote'
EOF

# 5. Start PostgreSQL with the recovery directory
# Point postgresql.conf data_directory at ${RESTORE_DIR} and start

# 6. Verify data integrity
bash scripts/pitr-drill.sh   # runs against the restored instance

# 7. Redirect application to recovered database
#    Update DATABASE_URL in /etc/ktb/prod.env and restart containers
docker compose -f docker-compose.prod.yml up -d api web nginx
```

---

## 4. Monitoring & Alerting (NFR-06, D#102)

### Key endpoints to monitor

| Endpoint | Purpose | Alert if |
|---|---|---|
| `GET /api/health/live` | Liveness | Returns non-200 |
| `GET /api/health/ready` | DB connectivity | Returns non-200 |
| `GET /api/health/metrics` | Runtime stats | `heapUsedBytes > 512MB` |
| `GET /api/sync/outbox/stats` | Outbox queue | `pending > 100` or `failed > 10` |

### Recommended monitoring stack
- **Uptime**: UptimeRobot or Grafana OnCall polling `/api/health/ready` every 60s
- **Metrics**: Prometheus scraping `/api/health/metrics` + custom exporters
- **Logs**: Structured JSON logs → Grafana Loki or similar
- **Alerts**: PagerDuty/Slack webhook on health check failure

### Log levels (set via `LOG_LEVEL` env var)
- `error` — production (minimum)
- `warn` — production recommended
- `debug` — development only

---

## 5. Contact & Escalation

| Severity | Action |
|---|---|
| Health check fails for > 2 minutes | Trigger automated rollback via deploy.yml re-run |
| Data corruption suspected | Stop writes immediately, take backup, start PITR |
| Ledger integrity violation | Freeze affected wallets, contact Super Admin |

---

## 6. Drill Schedule (NFR-05)

| Drill | Frequency | Script |
|---|---|---|
| Full backup + restore | Monthly | `bash scripts/pitr-drill.sh` |
| Application rollback | After every major release | Manual — follow Section 1 |
| Load test (300 VU) | Quarterly | `k6 run scripts/load-test/k6-load-test.js` |
