# Kottakkal Time Bank — Milestones

Source of truth: PRD §11 (Delivery strategy for solo developer).
This document tracks planned scope per milestone. **Do not implement future milestone
scope during an earlier milestone** — each milestone ends with complete tests and
documented limitations.

---

## Milestone 1: Foundation ✅ IN PROGRESS

**Goal:** Repository, CI, isolated dev+prod config, API conventions, Flutter/Next.js shells,
health endpoints, audit foundation.

**Scope:**
- [x] Monorepo structure (pnpm workspace + Turborepo)
- [x] `@ktb/shared-types` — core enums (UserRole, AccountStatus, WalletType)
- [x] NestJS API shell with health endpoints (`/health/live`, `/health/ready`)
- [x] Next.js web dashboard shell (placeholder root page)
- [x] Flutter Android shell (Material 3, Riverpod, localization delegates)
- [x] PostgreSQL via Docker Compose
- [x] Migration 0001: `audit_events` table (BR-09)
- [x] GitHub Actions CI (lint, typecheck, unit tests, integration tests, Docker build, Flutter analysis)
- [x] GitHub Actions deploy workflow (manual gate + approval)
- [x] `.env.example` with all variables documented
- [x] `.gitignore` covering Node, Flutter, Docker, secrets
- [x] `docs/DEV_SETUP.md` — step-by-step with verification checks
- [x] `docs/ARCHITECTURE.md` — 6 ADRs with PRD traceability

**Not in this milestone:**
- OTP authentication (Milestone 2)
- Any business workflows (Milestone 3+)
- Wallets or ledger (Milestone 4)

**Milestone 1 sign-off checklist:**
- [ ] All 5 CI jobs pass on GitHub Actions
- [ ] `docker compose up` → all containers healthy
- [ ] `curl http://localhost:3001/health/ready` → `{"status":"ok"}`
- [ ] Swagger UI loads at `http://localhost:3001/api/docs`
- [ ] Next.js loads at `http://localhost:3000`
- [ ] Nginx proxy routes at `http://localhost:8080`
- [ ] `pnpm test` → all tests pass
- [ ] `pnpm typecheck` → zero errors
- [ ] Migrations run successfully → `audit_events` table exists
- [ ] `flutter analyze` → no issues (with Flutter SDK installed)
- [ ] Git tag `v0.1.0-m1` created

---

## Milestone 2: Identity and municipality administration

**Goal:** Verification, role grants, municipality setup, beneficiary eligibility, caregivers,
permissions, account recovery.

**Planned scope:**
- AuthModule: OTP authentication (FR-IDENT-01, D#103)
  - OTP rate limiting, single-use, short expiry (NFR-07)
  - JWT access + refresh tokens
  - Session audit logging
- IdentityModule: document submission, duplicate screening (FR-IDENT-02, D#86)
- MunicipalitiesModule: Super Admin provisions municipalities (D#52, FR-GOV-01)
- RolesModule: role grants, permission checks per API operation (NFR-09, FR-GOV-03)
- BeneficiariesModule: eligibility, review dates, caregiver authorization (FR-BEN)
- Phone/SIM recovery (FR-IDENT-04, D#43)
- Nominee registration (FR-IDENT-05, D#44)
- Permission matrix tests (NFR-16)
- Coordinator-facing Next.js screens for registration review

---

## Milestone 3: Core service catalogue & request matching ✅ IMPLEMENTED

**Goal:** Centrally managed catalogue, municipal enablement/proposals, beneficiary eligibility,
caregiver proxy, manual service location, immediate and scheduled candidate matching,
volunteer assignment lifecycle, concurrency locks, and coordinator escalation.

**Implemented scope:**
- [x] `@ktb/shared-types` — Core M3 enums (`UrgencyType`, `CreationChannel`, `ServiceRequestStatus`, `VolunteerAssignmentStatus`, `CaregiverAuthorizationStatus`, `BeneficiaryEligibilityType`, `SkillVerificationStatus`, `MatchingRoundStatus`, `MatchingEscalationReason`)
- [x] TypeORM Migration 0003: `1729118400003-ServiceCatalogueAndRequests.ts` (12 core catalogue & request tables + indexes)
- [x] TypeORM Migration 0004: `1729118400004-OperationalZonesAndMatchingRounds.ts` (`operational_zones`, `volunteer_zone_assignments`, `matching_rounds`, residential address & GPS consent columns)
- [x] `CatalogueModule`: Global service categories, master definitions, municipal catalogue enablement, municipal proposals (FR-SVC, D#10, ITB-002)
- [x] `BeneficiariesModule`: Beneficiary ongoing/temporary eligibility, review dates, monthly request quotas, caregiver authorization (FR-BEN, D#8, D#24, D#25, D#26, D#37)
- [x] `RequestsModule`: Immediate & scheduled requests, mandatory manual location entry, cancellation audit, rescheduling history (FR-SVC-01, FR-SVC-02, D#59, D#60, D#61, D#62)
- [x] `MatchingModule` (Phase C):
  - Coordinator-managed operational zones and volunteer zone assignments (D#9, D#13)
  - Verified residential address base location with optional fresh, consented GPS (D#58)
  - Policy candidate filtering: role grants, verified skill prerequisites, active account restrictions, schedule conflict avoidance, sensitive service checks, cross-org participation toggle (ITB-006, D#7, D#11, D#79)
  - `DeterministicCandidateRankingStrategy`: ward/zone match, distance proximity, skills, workload balancing, home org affinity, and deterministic lexical tie-breaking
  - Configurable `MatchingConfigService` (tiers, search radii 3/7/15km, timeouts)
  - Durable `MatchingRound` records and multi-round progression (Tier 1 -> Tier 2 -> Tier 3 -> Escalation)
  - Atomic offer acceptance with offline retry idempotency (`clientOperationId`), expiry handling, and concurrency locks (D#12, D#64, NFR-11)
- [x] Multi-tenant isolation guards & cross-organization community drive authorization rules (ITB-005, ITB-006, ITB-007)
- [x] Test suite: 24 test suites, 238 unit and integration tests passing with zero regressions


## Milestone 4: Universal time-credit ledger

**Goal:** Atomic awards, redemption for assistance, cross-municipality donations,
freeze/correction rules.

**Planned scope:**
- TimeLedgerModule: wallet, ledger entries, holds (FR-TIME)
- Idempotent credit issuance after verification (FR-TIME-02, NFR-10)
- Cross-municipality donations (FR-TIME-03, UC-12, UC-13)
- Suspension/ban wallet freeze (FR-TIME-05, D#79)
- Fraud freeze + coordinator investigation + Municipality Admin correction (FR-TIME-06, D#91)
- Concurrency tests for double-spend prevention (NFR-16, AT-15)

---

## Milestone 5: Team and transfer workflows

**Goal:** Team-size rules, invitation matching, separate timers, transfer rewards,
cancellations.

**Planned scope:**
- Team positions: minimum safe + preferred (FR-TEAM-01, D#64)
- Team invitation and auto-matching (FR-TEAM-02, D#65)
- Separate timer per team member (FR-TEAM-04, D#66)
- Sub-minimum mid-service handling (FR-TEAM-05, D#69, BR-07)
- Sequential transfer: only finishing volunteer earns (FR-TEAM-07, D#33, BR-06)

---

## Milestone 6: Loyalty and merchants

**Goal:** Coin rules, merchant offers, publication approval, QR/manual redemption,
recognition.

**Planned scope:**
- LoyaltyLedgerModule: separate wallet, earning rules (FR-LOY)
- MerchantsModule: offer management, Municipality Admin approval (FR-LOY-03, D#20)
- QR code + one-time code redemption (FR-LOY-04, D#21, AT-15)
- Recognition: badges, certificates, opt-in leaderboard (D#36, D#37)

---

## Milestone 7: Governance and reporting

**Goal:** Alerts, complaints, suspensions, bans, appeals, account closure, analytics/exports,
external sponsor reports.

**Planned scope:**
- SafetyModule: alerts, pause/resume (FR-SAFE)
- ComplaintsModule: escalation hierarchy (FR-SAFE-04, D#75, D#76)
- AppealModule: appeals to Super Admin (D#77, D#78, BR-11)
- RestrictionsModule: suspension, ban, reinstatement (FR-SAFE-06, FR-SAFE-07)
- Account closure: death, duplicate (FR-IDENT-06, FR-IDENT-07)
- ReportsModule: municipality dashboard, PDF/XLSX/CSV exports (FR-REPORT)
- External sponsor impact report export (D#54, UC-28, AT-29)

---

## Milestone 8: Offline reliability

**Goal:** Local secure queue, automatic sync, conflict handling, delivery states,
on-device field tests.

**Planned scope:**
- Flutter encrypted local queue (FR-OFF-01, D#47)
- Idempotency key / operation ID on all mutations (FR-OFF-03)
- Sync state: pending/success/failed (FR-OFF-02, D#99)
- Offline safety alert delivery state (FR-OFF-05, AT-22)
- Flutter offline/low-connectivity field test suite (NFR-16)

---

## Milestone 9: Production hardening

**Goal:** Pen-test/review, realistic load tests, backup restoration, PITR drill, admin
audit review, accessibility and Malayalam validation.

**Planned scope:**
- Security review: access controls, ledger, auth (NFR-18)
- Load test: 300 concurrent users (D#98, AT-26, NFR-03)
- PITR backup restore drill (D#100, UC-29, NFR-05)
- Accessibility audit: contrast, touch targets, screen reader (NFR-13, FR-UX-02)
- Malayalam UI validation (D#50, AT-24)
- Production monitoring setup (NFR-06, D#102)
- Documented rollback procedure (NFR-17, UC-30)
