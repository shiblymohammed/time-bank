# Kottakkal Time Bank — Developer Setup Guide

> **Milestone 1 — Foundation.** No business workflows yet. This guide gets all infrastructure
> running and verified locally.

---

## Prerequisites

| Tool | Required version | Install |
|------|-----------------|---------|
| Node.js | ≥ 22.0.0 | [nodejs.org](https://nodejs.org) |
| pnpm | = 12.3.4 | `corepack enable && corepack prepare pnpm@12.3.4 --activate` |
| Docker Desktop | ≥ 4.30 | [docker.com](https://www.docker.com/products/docker-desktop) |
| Git | ≥ 2.40 | [git-scm.com](https://git-scm.com) |
| Flutter SDK | ≥ 3.24.0 | [flutter.dev](https://flutter.dev/docs/get-started/install/windows) — Android only at launch |
| Android Studio | Latest stable | Required for Android SDK and emulator |

> **Why pnpm?** pnpm enforces strict dependency isolation (no phantom dependencies), uses
> a content-addressable store (faster, less disk), and has first-class workspace support.
> The exact version is pinned in `package.json → engines.pnpm`.

---

## Step 1 — Clone and bootstrap

```powershell
# Clone the repository
git clone <your-repo-url> kottakkal-time-bank
cd kottakkal-time-bank

# Enable corepack (ships with Node 22 — manages pnpm/yarn versions)
corepack enable

# Install all Node/TypeScript dependencies across all workspace packages
# Why --frozen-lockfile: prevents accidental pnpm-lock.yaml updates in dev
pnpm install --frozen-lockfile
```

**What this does:**
- Reads `pnpm-workspace.yaml` to discover all packages under `apps/` and `packages/`
- Installs dependencies for `@ktb/api`, `@ktb/web`, `@ktb/shared-types`, `@ktb/eslint-config`,
  and `@ktb/tsconfig` in a single pass
- Links workspace packages to each other using `workspace:*` protocol

---

## Step 2 — Environment configuration

```powershell
# Copy the example env file (never commit the real .env)
cp .env.example .env
```

Open `.env` and set these minimum required values for local development:

| Variable | What to set | Why |
|----------|-------------|-----|
| `POSTGRES_PASSWORD` | any strong local password | Docker Compose fails loudly if missing |
| `JWT_SECRET` | any string ≥ 32 chars | Fails loudly if missing |
| `JWT_ACCESS_TOKEN_EXPIRY` | leave as `15m` | FR-IDENT-01: short-lived tokens |

Leave all other values at their defaults for local development.

---

## Step 3 — Start the infrastructure

```powershell
# Start PostgreSQL, NestJS API, Next.js web, and Nginx in Docker Compose
# -d = detached (background)
docker compose up -d

# Why docker compose (not docker-compose)?
# Docker Compose v2 is built into Docker Desktop ≥ 4.x. The old
# 'docker-compose' command is deprecated. Always use 'docker compose'.
```

**Watch the startup sequence:**
```powershell
# Follow all container logs
docker compose logs -f

# Or watch just the API
docker compose logs -f api
```

Expected output when healthy:
```
ktb_api_dev   | [KTB API] Listening on port 3001 (development)
ktb_api_dev   | [KTB API] Swagger docs: http://localhost:3001/api/docs
ktb_web_dev   | ▶ Ready in XXXms
```

---

## Step 4 — Run database migrations

```powershell
# Run migrations inside the api container
docker compose exec api npx ts-node \
  -r tsconfig-paths/register \
  node_modules/.bin/typeorm migration:run \
  -d apps/api/src/database/data-source.ts

# What this creates:
#   - pgcrypto extension (UUID generation)
#   - audit_events table (BR-09: append-only ledger foundation)
#   - Indexes on actor_id and created_at
```

**Verify migrations ran:**
```powershell
docker compose exec postgres psql \
  -U ktb_dev -d ktb_dev \
  -c "\dt"
# Expected: audit_events table listed

docker compose exec postgres psql \
  -U ktb_dev -d ktb_dev \
  -c "\d audit_events"
# Expected: id UUID, event_type VARCHAR, created_at TIMESTAMPTZ...
```

---

## Step 5 — Verification checks

Run all of these. Every check should pass before you consider Milestone 1 complete.

### 5.1 Health endpoints

```powershell
# Liveness (no DB required)
curl http://localhost:3001/health/live
# Expected: {"status":"ok","version":"0.0.1","environment":"development","timestamp":"..."}

# Readiness (requires DB connection)
curl http://localhost:3001/health/ready
# Expected: {"status":"ok","info":{"database":{"status":"up"}}}

# Via Nginx (confirms reverse proxy is routing correctly)
curl http://localhost:8080/health/live
# Expected: same as above
```

### 5.2 Swagger UI

Open in browser: **http://localhost:3001/api/docs**

Expected: Swagger UI loads with "Kottakkal Time Bank API" title and Health endpoints listed.

### 5.3 Next.js web dashboard

Open in browser: **http://localhost:3000** (direct) or **http://localhost:8080** (via Nginx)

Expected: "Kottakkal Time Bank — Milestone 1 Foundation running ✓"

### 5.4 TypeScript type checks

```powershell
# Run from monorepo root
pnpm --filter @ktb/shared-types build
pnpm typecheck

# Expected: No TypeScript errors
```

### 5.5 Unit tests

```powershell
pnpm test

# Expected: HealthController › live() › should return status ok — PASS
```

### 5.6 Lint

```powershell
pnpm lint

# Expected: No errors (warnings about missing auth are acceptable in M1)
```

### 5.7 Docker healthchecks

```powershell
docker compose ps

# Expected: All services show "(healthy)" status
# NAME                STATUS
# ktb_postgres_dev    running (healthy)
# ktb_api_dev         running (healthy)
# ktb_web_dev         running (healthy)
# ktb_nginx_dev       running
```

---

## Step 6 — Flutter / Android setup (mobile)

> Skip this step if you are not working on the Flutter app right now.
> The web and API can be developed independently.

```powershell
# Verify Flutter SDK is on PATH
flutter --version
# Expected: Flutter 3.24.x • channel stable

# Install Flutter pub dependencies
cd apps/mobile
flutter pub get

# Run static analysis
flutter analyze
# Expected: No issues found!

# Run tests
flutter test
# Expected: All tests passed!

# List connected devices / emulators
flutter devices

# Launch on emulator (requires Android emulator running in Android Studio)
flutter run
```

---

## Development workflow

### Running services natively (faster hot-reload than Docker for development)

```powershell
# Terminal 1 — PostgreSQL only (from Docker)
docker compose up postgres -d

# Terminal 2 — NestJS API (native, hot-reload via ts-node)
pnpm dev:api

# Terminal 3 — Next.js web (native, turbopack)
pnpm dev:web
```

### Useful commands

```powershell
# Generate a new TypeORM migration after adding entities
cd apps/api
npx ts-node -r tsconfig-paths/register \
  node_modules/.bin/typeorm migration:generate \
  -d src/database/data-source.ts \
  src/database/migrations/XXXX-your-migration-name

# Format all code
pnpm format

# Stop all containers
docker compose down

# Stop containers AND delete volumes (destroys dev DB — destructive!)
docker compose down -v

# Rebuild images after dependency changes
docker compose build --no-cache
```

---

## Common issues

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `POSTGRES_PASSWORD must be set in .env` | Missing .env | `cp .env.example .env` and set password |
| `JWT_SECRET must be set in .env` | Missing .env value | Add any string ≥ 32 chars |
| API container unhealthy | PostgreSQL not ready | `docker compose logs postgres` — check for errors |
| `Cannot find module '@ktb/shared-types'` | shared-types not built | `pnpm --filter @ktb/shared-types build` |
| Port 3000 already in use | Another app on 3000 | Change `WEB_PORT` in `.env` |
| Flutter: `No supported devices connected` | No emulator/device | Start Android emulator in Android Studio |
| `flutter: command not found` | Flutter not on PATH | Add Flutter SDK `bin/` folder to PATH |

---

## Architecture overview (Milestone 1)

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose (dev)                  │
│                                                         │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐ │
│  │  Nginx   │───▶│  Next.js web │    │  NestJS API   │ │
│  │  :8080   │    │  @ktb/web    │    │  @ktb/api     │ │
│  └──────────┘    │  :3000       │    │  :3001        │ │
│       │          └──────────────┘    └───────┬───────┘ │
│       └──────────────────────────────────────┘         │
│                                              │          │
│                              ┌───────────────▼───────┐ │
│                              │     PostgreSQL 17      │ │
│                              │     :5432 (internal)   │ │
│                              └───────────────────────┘ │
└─────────────────────────────────────────────────────────┘

Flutter Android App (native — outside Docker)
  ↓ HTTP (dio)
NestJS API :3001
```

**Milestone 1 scope:** Infrastructure only. No auth, no business logic, no wallets.
Milestone 2 adds: OTP auth, identity, municipalities, roles, beneficiary eligibility.

---

## Next milestone checklist

When Milestone 1 is verified, create a Git tag before starting Milestone 2:

```powershell
git tag -a v0.1.0-m1 -m "Milestone 1: Foundation complete"
git push origin v0.1.0-m1
```

Milestone 2 will wire in (see PRD §11):
- `AuthModule` — OTP via mobile number (FR-IDENT-01, D#103)
- `IdentityModule` — document upload, duplicate screening
- `MunicipalitiesModule` — Super Admin provisions municipalities (D#52)
- `RolesModule` — role grants, permission checks (NFR-09, FR-GOV-03)
- `BeneficiariesModule` — eligibility, caregiver authorization (FR-BEN)
