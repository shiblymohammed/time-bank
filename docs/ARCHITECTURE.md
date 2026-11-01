# Kottakkal Time Bank — Architecture Decision Records

This document records **architecture decisions** made for the platform, traceable to the PRD 107-decision register. It
is a living document — add an entry for every significant technical choice.

---

## ADR-001: Monorepo with pnpm workspaces and Turborepo

**Status:** Accepted  
**Date:** 2026-10-16  
**PRD decisions:** D#95, D#96, D#94, D#107

### Context

One developer (D#107) manages a Flutter Android app, a Next.js web dashboard, a NestJS API, and shared TypeScript types.
These need to share code, stay in sync, and be deployed together.

### Decision

Use a **pnpm workspace monorepo** with **Turborepo** for task orchestration.

### Consequences

- ✅ `@ktb/shared-types` can be imported by both `@ktb/api` and `@ktb/web` without publishing to npm
- ✅ `pnpm install` at root installs all packages; single `pnpm test` runs all tests
- ✅ Turborepo caches builds — only rebuilds what changed
- ⚠️ Flutter (`apps/mobile`) uses Dart/pub, not Node — it is excluded from the pnpm workspace and managed separately
- ⚠️ The `pnpm-lock.yaml` must always be committed and `--frozen-lockfile` used in CI

---

## ADR-002: TypeORM over Prisma for NestJS database access

**Status:** Accepted  
**Date:** 2026-10-16  
**PRD decisions:** D#95, NFR-10, BR-09

### Context

The platform needs an ORM for PostgreSQL with NestJS integration, support for raw SQL migrations, and transactional
control for the ledger (NFR-10, BR-09).

### Decision

Use **TypeORM 0.3** with explicit migrations. `synchronize: false` always.

### Consequences

- ✅ TypeORM's `@nestjs/typeorm` integrates seamlessly with NestJS DI
- ✅ Migrations are explicit TypeScript files — versioned, auditable, rollback-able (NFR-17)
- ✅ Raw query support for complex ledger operations (NFR-10)
- ⚠️ TypeORM has a steeper learning curve than Prisma for complex queries
- ⚠️ `synchronize: true` is permanently disabled — schema drift must be caught in CI

---

## ADR-003: NestJS modular monolith (not microservices)

**Status:** Accepted  
**Date:** 2026-10-16  
**PRD decisions:** D#95, NFR-01, scope exclusion from PRD §1.2

### Context

PRD §1.2 explicitly excludes Kubernetes and microservices. D#107: one developer.

### Decision

Build a **NestJS modular monolith** where each domain (auth, identity, municipalities, requests, ledger…) is a separate
NestJS module but runs in a single process.

### Consequences

- ✅ Simpler deployment — one Docker image, one process
- ✅ Single database transaction spans multiple modules (critical for ledger integrity NFR-10)
- ✅ Modules can be extracted to microservices later if load demands it
- ⚠️ Module boundaries must be respected through NestJS imports/exports — no circular deps

---

## ADR-004: Docker Compose for both dev and production

**Status:** Accepted  
**Date:** 2026-10-16  
**PRD decisions:** D#101, D#97, NFR-02

### Context

D#101 mandates Docker Compose + GitHub Actions. D#97: VPS-managed hosting. No Kubernetes (excluded in PRD §1.2).

### Decision

Use Docker Compose for both development (with hot-reload volume mounts) and production (with versioned images pulled
from GHCR).

### Consequences

- ✅ Same compose schema in dev and prod — fewer environment surprises
- ✅ `docker compose up` is a one-command dev environment
- ⚠️ Production compose does not support zero-downtime rolling updates natively — acceptable for initial launch; UC-30
  rollback procedure documented

---

## ADR-005: GitHub Container Registry (GHCR) for image storage

**Status:** Accepted  
**Date:** 2026-10-16  
**PRD decisions:** D#101, NFR-17

### Context

Need a container registry to push versioned images from CI and pull on the VPS.

### Decision

Use **GitHub Container Registry (ghcr.io)** — free for public repos, integrates with GitHub Actions via `GITHUB_TOKEN`
(no extra credentials needed for CI push).

### Consequences

- ✅ No separate registry account or billing
- ✅ Image tags tied to git SHA and semver — NFR-17 versioned images
- ✅ GitHub Actions can push using existing `GITHUB_TOKEN`
- ⚠️ VPS needs a GitHub PAT or deploy key to pull from GHCR if repo is private

---

## ADR-006: append-only audit_events table created in Milestone 1

**Status:** Accepted  
**Date:** 2026-10-16  
**PRD decisions:** BR-09, NFR-09, NFR-10

### Context

BR-09 requires ledger transactions and corrections to be append-only with auditability. NFR-09 requires auditable
privileged operations. This must be foundational.

### Decision

Create the `audit_events` table in the very first migration (M1), before any business tables.

### Consequences

- ✅ Every subsequent feature can write audit events from day one
- ✅ Database-level comment documents the immutability requirement
- ✅ No UPDATE or DELETE grants ever issued on this table
- ⚠️ Audit events will grow large — partitioning by month to be evaluated in M9 (production hardening)
