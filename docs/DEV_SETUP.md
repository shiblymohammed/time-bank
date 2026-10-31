# Kottakkal Time Bank — Developer Setup Guide

> **Milestone 1 — Foundation.** No business workflows yet. This guide gets all infrastructure running and verified
> locally.

---

## Prerequisites

| Tool           | Required version | Install                                                                                      |
| -------------- | ---------------- | -------------------------------------------------------------------------------------------- |
| Node.js        | ≥ 22.0.0         | [nodejs.org](https://nodejs.org)                                                             |
| pnpm           | = 12.3.4         | `corepack enable && corepack prepare pnpm@12.3.4 --activate`                                 |
| Docker Desktop | ≥ 4.30           | [docker.com](https://www.docker.com/products/docker-desktop)                                 |
| Git            | ≥ 2.40           | [git-scm.com](https://git-scm.com)                                                           |
| Flutter SDK    | ≥ 3.24.0         | [flutter.dev](https://flutter.dev/docs/get-started/install/windows) — Android only at launch |
| Android Studio | Latest stable    | Required for Android SDK and emulator                                                        |

> **Why pnpm?** pnpm enforces strict dependency isolation (no phantom dependencies), uses a content-addressable store
> (faster, less disk), and has first-class workspace support. The exact version is pinned in
> `package.json → engines.pnpm`.

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
- Installs dependencies for `@ktb/api`, `@ktb/web`, `@ktb/shared-types`, `@ktb/eslint-config`, and `@ktb/tsconfig` in a
  single pass
- Links workspace packages to each other using `workspace:*` protocol

---

## Step 2 — Environment configuration

```powershell
# Copy the example env file (never commit the real .env)
cp .env.example .env
```

Open `.env` and set these minimum required values for local development:

| Variable                  | What to set               | Why                                    |
| ------------------------- | ------------------------- | -------------------------------------- |
| `POSTGRES_PASSWORD`       | any strong local password | Docker Compose fails loudly if missing |
| `JWT_SECRET`              | any string ≥ 32 chars     | Fails loudly if missing                |
| `JWT_ACCESS_TOKEN_EXPIRY` | leave as `15m`            | FR-IDENT-01: short-lived tokens        |

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

> Skip this step if you are not working on the Flutter app right now. The web and API can be developed independently.

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

| Symptom                                   | Likely cause           | Fix                                               |
| ----------------------------------------- | ---------------------- | ------------------------------------------------- |
| `POSTGRES_PASSWORD must be set in .env`   | Missing .env           | `cp .env.example .env` and set password           |
| `JWT_SECRET must be set in .env`          | Missing .env value     | Add any string ≥ 32 chars                         |
| API container unhealthy                   | PostgreSQL not ready   | `docker compose logs postgres` — check for errors |
| `Cannot find module '@ktb/shared-types'`  | shared-types not built | `pnpm --filter @ktb/shared-types build`           |
| Port 3000 already in use                  | Another app on 3000    | Change `WEB_PORT` in `.env`                       |
| Flutter: `No supported devices connected` | No emulator/device     | Start Android emulator in Android Studio          |
| `flutter: command not found`              | Flutter not on PATH    | Add Flutter SDK `bin/` folder to PATH             |

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

**Milestone 1 scope:** Infrastructure only. No auth, no business logic, no wallets. Milestone 2 adds: OTP auth,
identity, municipalities, roles, beneficiary eligibility.

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

## Web dashboard API integration

The dashboard uses real OTP authentication and live API data. Copy `apps/web/.env.example` to `apps/web/.env.local` and
set `API_INTERNAL_URL` to the NestJS server origin (default `http://localhost:3001`). Start the API and web apps with
`corepack pnpm dev`. Browser requests go to same-origin Next.js routes: `/api/session` for sign-in and `/api/backend/*`
for an allowlisted set of API paths, so no browser CORS configuration is needed. Docker Compose uses `http://api:3001`.
See [Live admin dashboard](LIVE_ADMIN_DASHBOARD.md) for details.

Sign in with the phone number of an existing Super Admin. OTP verification does not grant admin privileges; the account
needs an active Super Admin role on an approved membership in the database. Development OTP responses include a code,
which the sign-in form fills automatically. Click Verify and sign in to submit it. Production uses SMS. Tokens are kept
in HTTP-only cookies that browser scripts cannot read. They are refreshed automatically, survive a page reload, and are
revoked on sign-out.

Overview metrics and account restrictions are platform-wide. The tenant selector scopes organization rows, memberships,
and audit events. Membership review and branding updates require an active organization, as enforced by the backend.
Memberships are fetched in pages of 100; audit events have 50-row pagination and an event-type filter. API failures are
displayed and never replaced with sample records. Successful actions reload server data, including server-assigned
membership numbers and audit events.

Use **Manage organization** on an organization row to edit its name, district, and lifecycle status, list/register app
builds, or appoint a role by global user ID. Organization settings and app build writes require an active tenant. Use
**Details & roles** on a membership row to inspect approval history, grant/revoke roles, and review supporting document
records. Document storage keys are shown as references; the backend does not expose a document download endpoint. These
controls use the existing administrative and membership APIs; applicant-only application and upload endpoints are
outside this admin dashboard.

### Service operations (Milestone 3)

Open **Service Operations** in the sidebar after signing in. Global scope supports category and service
creation/activation and central proposal review. Select an active organization in **Tenant Scope** to configure its
catalogue, manage service requests, review beneficiary eligibility and caregivers, and manage operational zones and
volunteer skills.

Requests have status filtering and 20-row pagination, details and assignments, coordinator creation on behalf of a
beneficiary, manual dispatch, matching radius expansion/progression, rescheduling, and cancellation. Local date/time
inputs are converted to ISO timestamps before submission. Eligibility quotas and volunteer counts are sent as numbers;
ward/category lists are sent as arrays. Successful writes refresh server data, and backend validation errors appear in
the screen. Volunteer offer acceptance/decline/withdrawal remain volunteer-facing workflows.

The updated backend includes migrations `1729118400003` and `1729118400004`. Apply pending migrations to your
development database using the migration procedure above before trying the new endpoints. Build `@ktb/shared-types`
after pulling backend changes so the API can load the new enums.

Verification commands from the repository root:

```bash
pnpm --filter @ktb/shared-types build
pnpm --filter @ktb/web test
pnpm --filter @ktb/api test --runInBand
pnpm typecheck
pnpm build:web
```

An optional browser integration test uses Playwright, an externally supplied test runtime. With the web dev server
running on port 3000 and Playwright available in Node's module search path, run:

```bash
node --test apps/web/test/service-operations.e2e.cjs
```

Set `WEB_TEST_URL` to test a different local port, `NODE_PATH` to your Playwright module directory if it is not
installed locally, and `CHROME_PATH` to use an existing Chrome executable instead of a Playwright-managed browser. This
test intercepts API responses; it checks frontend integration contracts without writing to a real database. Live
OTP/database validation requires a running API and a provisioned Super Admin account.

### Remaining API workflows and Flutter

Service Operations now includes local proposal submission, global/tenant service and zone details, profile lookup, and
volunteer availability/skills/assigned-zone lookup, updates, and zone removal. Branding editing loads the current
branding endpoint before saving. Administrative and operational role revocations use their corresponding backend
endpoints.

The independent Flutter repository at `apps/mobile/time_bank` now defaults to live member mode. Its `LIVE_API.md`
documents API_URL, emulator/device networking, authentication, membership applications/document references, caregiver
requests, and volunteer offers and availability. Use `--dart-define=DEMO_MODE=true` for the original offline preview.
Mobile changes must be reviewed and committed within that repository; the parent ignores it.

Two authenticated discovery endpoints support the mobile workflows: `GET /api/organizations/:id/assignments/mine` and
`GET /api/organizations/:id/caregivers/mine`. They derive the caller's membership from the evaluated organization
context. Availability, skill and volunteer-zone lookups require the same membership or a coordinator/admin context.
Radius expansion and progression validate that the request belongs to the selected organization. No schema changes are
required for these endpoints.
