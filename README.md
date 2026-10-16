# Kottakkal Time Bank

> Centrally governed, multi-municipality volunteer assistance platform.  
> Eligible people request practical help; verified volunteers provide assistance and accumulate
> **lifetime universal time credits**. A separate **loyalty-coin** system provides merchant-funded offers.

**Status:** Milestone 1 — Foundation (in progress)  
**PRD:** `Kottakkal_Time_Bank_PRD_107_Decisions.md` — 107 confirmed product decisions  
**Team:** Solo developer · AI-assisted coding (D#107) · Quality-first, milestone-driven (D#106)

---

## Repository structure

```
kottakkal-time-bank/
├── apps/
│   ├── api/          # @ktb/api     — NestJS + TypeScript + PostgreSQL (D#95)
│   ├── web/          # @ktb/web     — Next.js + React + TypeScript (D#96)
│   └── mobile/       # ktb_mobile   — Flutter Android (D#94); iOS later
├── packages/
│   ├── shared-types/ # @ktb/shared-types — enums/types shared by api & web
│   ├── eslint-config/# @ktb/eslint-config — shared ESLint rules
│   └── tsconfig/     # @ktb/tsconfig      — shared TypeScript configurations
├── infra/
│   ├── docker/       # Dockerfiles (API, Web) + PostgreSQL init scripts
│   └── nginx/        # Reverse proxy configuration
├── docs/
│   ├── DEV_SETUP.md  # Step-by-step developer setup with verification checks
│   ├── ARCHITECTURE.md # Architecture Decision Records (ADRs)
│   └── MILESTONES.md # PRD §11 milestone plan
├── .github/
│   └── workflows/
│       ├── ci.yml    # Lint + test + Docker build + Flutter analysis
│       └── deploy.yml# Manual-gate production deployment (UC-30)
├── docker-compose.yml
├── pnpm-workspace.yaml
├── .env.example      # All env vars documented with PRD references
└── turbo.json        # Turborepo task pipeline
```

---

## Quick start

```powershell
# 1. Install dependencies
pnpm install --frozen-lockfile

# 2. Copy environment config
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD and JWT_SECRET

# 3. Start all services
docker compose up -d

# 4. Run database migrations
docker compose exec api npx ts-node \
  -r tsconfig-paths/register \
  node_modules/.bin/typeorm migration:run \
  -d apps/api/src/database/data-source.ts

# 5. Verify
curl http://localhost:3001/health/ready   # API + DB health
open http://localhost:3001/api/docs       # Swagger UI
open http://localhost:3000                # Next.js dashboard
open http://localhost:8080                # Via Nginx reverse proxy
```

See [`docs/DEV_SETUP.md`](docs/DEV_SETUP.md) for the full guide with troubleshooting.

---

## Tech stack

| Layer | Technology | Decision |
|-------|-----------|---------|
| Mobile app | Flutter 3.24 · Android first | D#94 |
| Web dashboard | Next.js 15 · React 19 · TypeScript | D#96 |
| API backend | NestJS 10 · TypeScript · modular monolith | D#95 |
| Database | PostgreSQL 17 · TypeORM 0.3 · explicit migrations | D#95, NFR-17 |
| Infra | Docker Compose · Nginx · VPS | D#97, D#101 |
| CI/CD | GitHub Actions · GHCR images · manual deploy gate | D#101 |
| Shared types | `@ktb/shared-types` workspace package | ADR-001 |
| Package manager | pnpm 12 workspaces · Turborepo | ADR-001 |

---

## Key product decisions (condensed)

The full register is in the PRD. The most architecturally significant decisions:

| # | Decision |
|---|---------|
| D#1 | One centrally administered platform across multiple municipalities |
| D#3 | Time credits ≠ loyalty coins; credits cannot pay for merchant offers |
| D#17 | Single lifetime time-credit wallet, universal across municipalities |
| D#39 | One permanent verified identity per human; multiple approved roles |
| D#47 | Offline-first field recording; server-authoritative final records |
| D#94 | Android Flutter first; iOS later |
| D#95 | NestJS + TypeScript + PostgreSQL |
| D#99 | Automatic sync on reconnect; pending/success/failed states |
| D#101 | Docker Compose + GitHub Actions + approved production releases |
| D#104 | Development and production only — no staging environment |
| D#107 | One developer; human review required for auth, ledger, migrations |

**Business invariants never to violate:**
- BR-01: Volunteer cannot self-verify their own service
- BR-03: Loyalty coins only for merchant offers; time credits are not convertible
- BR-09: Audit ledger is append-only — never rewrite historical records
- NFR-09: Permission checks enforced in backend, not only hidden in UI

---

## Development commands

```powershell
pnpm dev          # Start all apps in parallel (native, no Docker)
pnpm dev:api      # NestJS API with watch mode
pnpm dev:web      # Next.js with Turbopack
pnpm test         # All unit tests
pnpm test:e2e     # API integration tests (requires running DB)
pnpm typecheck    # TypeScript check across all packages
pnpm lint         # ESLint across all packages
pnpm format       # Prettier format all files
```

---

## Milestone progress

| Milestone | Status | Description |
|-----------|--------|-------------|
| M1 | 🚧 In progress | Foundation, CI, infrastructure, shells |
| M2 | ⏳ Planned | Identity, OTP auth, municipalities, roles |
| M3 | ⏳ Planned | Service catalogue, requests, matching, timers |
| M4 | ⏳ Planned | Universal time-credit ledger |
| M5 | ⏳ Planned | Team and transfer workflows |
| M6 | ⏳ Planned | Loyalty coins and merchants |
| M7 | ⏳ Planned | Governance, safety, complaints, reports |
| M8 | ⏳ Planned | Offline reliability |
| M9 | ⏳ Planned | Production hardening, security review, load tests |

Full milestone plan: [`docs/MILESTONES.md`](docs/MILESTONES.md)

---

## AI assistance policy

> PRD §11 (AI assistance boundaries): AI may generate boilerplate, test cases, UI drafts,
> SQL reviews and docs. **Solo developer owns security review and end-to-end validation.**
> No production schema migration, wallet correction, role change or authorization-rule change
> should be adopted solely from unchecked AI output.

---

## Contributing

This is a solo-developer project. All changes require:
1. Feature branch + pull request to `main`
2. All CI checks pass (lint, typecheck, tests, Docker build)
3. Human review of any changes to: auth, migrations, ledger, role checks, audit logic
4. Deployment only via the manual-gate `deploy.yml` workflow

---

*Kottakkal Time Bank — connecting verified volunteers with eligible beneficiaries.*  
*PRD version 1.0 · 107 confirmed product decisions · Built with quality-first milestone approach.*
