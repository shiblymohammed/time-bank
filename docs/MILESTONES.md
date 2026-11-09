# Indian Time Bank — Milestones

Source of truth: PRD §9 (Delivery strategy). Kottakkal is the pilot organization. This document tracks planned scope per
milestone. **Do not implement future milestone scope during an earlier milestone** — each milestone ends with complete
tests and documented limitations.

---

## Status on 9 November 2026

The pilot runs after every feature is built. Order of work: rest of M7, M6, M8, front-end polish, M9, then deploy and
pilot.

| Step                           | Status                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| M1 Foundation                  | Built                                                                                                               |
| M2 Identity and administration | Built; SIM-swap recovery and nominees open                                                                          |
| M3 Catalogue and matching      | Built, including automatic matching, booking recovery and the push queue                                            |
| M4 Time credits                | Built                                                                                                               |
| M5 Team and transfer workflows | Built. See [TEAM_VISITS.md](TEAM_VISITS.md)                                                                         |
| Second-organization readiness  | See below; needed before a second organization goes live                                                            |
| M7 Governance and reporting    | Alerts, complaints, restrictions and appeals built; closure and reports planned                                 |
| M6, M8                         | Planned                                                                                                             |
| M9 Production hardening        | Security review done; the rest planned                                                                              |
| Kottakkal pilot                | Last, after all of the above. Staff second factor and restore drill built; see [checklist](PILOT_CHECKLIST.md)      |

## Second-organization readiness

Needed before any organization after Kottakkal goes live (PRD §6.2, ITB-013 to ITB-016):

- [x] Each app is locked to its organization; a non-member is told to apply there (ITB-007, AT-01).
- [x] Each registered device records its organization's app; push goes only to matching devices (AT-15).
- [ ] Flutter flavors per organization: name, logo, colours, `com.indiantimebank.<organization>`, Firebase file.
- [ ] Staff dashboard on `<organization>.indiantimebank.com`, allowed by the API and by Firebase.

---

## Milestone 1: Foundation ✅ BUILT

**Goal:** Repository, CI, isolated dev+prod config, API conventions, Flutter/Next.js shells, health endpoints, audit
foundation.

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

**Goal:** Verification, role grants, municipality setup, beneficiary eligibility, caregivers, permissions, account
recovery.

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

**Goal:** Centrally managed catalogue, municipal enablement/proposals, beneficiary eligibility, caregiver proxy, manual
service location, immediate and scheduled candidate matching, volunteer assignment lifecycle, concurrency locks, and
coordinator escalation.

**Implemented scope:**

- [x] `@ktb/shared-types` — Core M3 enums (`UrgencyType`, `CreationChannel`, `ServiceRequestStatus`,
      `VolunteerAssignmentStatus`, `CaregiverAuthorizationStatus`, `BeneficiaryEligibilityType`,
      `SkillVerificationStatus`, `MatchingRoundStatus`, `MatchingEscalationReason`)
- [x] TypeORM Migration 0003: `1729118400003-ServiceCatalogueAndRequests.ts` (12 core catalogue & request tables +
      indexes)
- [x] TypeORM Migration 0004: `1729118400004-OperationalZonesAndMatchingRounds.ts` (`operational_zones`,
      `volunteer_zone_assignments`, `matching_rounds`, residential address & GPS consent columns)
- [x] `CatalogueModule`: Global service categories, master definitions, municipal catalogue enablement, municipal
      proposals (FR-SVC, D#10, ITB-002)
- [x] `BeneficiariesModule`: Beneficiary ongoing/temporary eligibility, review dates, monthly request quotas, caregiver
      authorization (FR-BEN, D#8, D#24, D#25, D#26, D#37)
- [x] `RequestsModule`: Immediate & scheduled requests, mandatory manual location entry, cancellation audit,
      rescheduling history (FR-SVC-01, FR-SVC-02, D#59, D#60, D#61, D#62)
- [x] `MatchingModule` (Phase C):
  - Coordinator-managed operational zones and volunteer zone assignments (D#9, D#13)
  - Verified residential address base location with optional fresh, consented GPS (D#58)
  - Policy candidate filtering: role grants, verified skill prerequisites, active account restrictions, schedule
    conflict avoidance, sensitive service checks, cross-org participation toggle (ITB-006, D#7, D#11, D#79)
  - `DeterministicCandidateRankingStrategy`: ward/zone match, distance proximity, skills, workload balancing, home org
    affinity, and deterministic lexical tie-breaking
  - Configurable `MatchingConfigService` (tiers, search radii 3/7/15km, timeouts)
  - Durable `MatchingRound` records and multi-round progression (Tier 1 -> Tier 2 -> Tier 3 -> Escalation)
  - Atomic offer acceptance with offline retry idempotency (`clientOperationId`), expiry handling, and concurrency locks
    (D#12, D#64, NFR-11)
- [x] Multi-tenant isolation guards & cross-organization community drive authorization rules (ITB-005, ITB-006, ITB-007)
- [x] Test suite: 24 test suites, 238 unit and integration tests passing with zero regressions

## Milestone 4: Universal time-credit ledger — backend implemented, review pending

**Goal:** Atomic awards, redemption for assistance, cross-municipality donations, freeze/correction rules.

**Implemented backend scope:**

- [x] Universal wallet, append-only ledger and independently confirmed service earnings (FR-TIME-01/02/04).
- [x] Member donations across organizations and donations to approved community pools (FR-TIME-03).
- [x] Explicit voluntary funding of completed assistance using the caller's own wallet or a local approved pool.
      Eligible beneficiaries continue to receive assistance free, regardless of credit balance.
- [x] Global wallet freeze/restore controls, restriction checks and locally attributable frozen-earning releases
      (FR-TIME-05). Reinstatement does not automatically release funds.
- [x] Source-linked dispute holds, recorded coordinator investigation and independent Municipality Admin correction or
      release (FR-TIME-06). Corrections append ledger entries and preserve originals.
- [x] Evidence-linked downstream donation review, with capped holds against available balances and no negative debt
      (FR-TIME-07). Staff investigate actual transfer paths; no automatic fraud attribution.
- [x] Real PostgreSQL concurrency, retry, permission, signed HTTP and failure-rollback tests.

API details, product policy and rollback constraints: [CREDIT_CONTROLS.md](CREDIT_CONTROLS.md).

**Release gates still open:** human ledger/authorization/migration review, CI on PostgreSQL 17, application of the new
migration to the intended deployment, coordinator/admin UI integration, and full device-to-server validation. Earlier
milestone gaps (live SMS/recovery and automatic matching progression/replacement) remain separate work. M4 backend
implementation does not imply overall production readiness.

---

## Milestone 5: Team and transfer workflows ✅ BUILT

**Goal:** Team-size rules, invitation matching, separate timers, transfer rewards, cancellations.

Rules, API and limits: [TEAM_VISITS.md](TEAM_VISITS.md).

**Scope:**

- [x] Team positions: minimum safe + preferred (FR-TEAM-01, D#64)
- [x] Team invitation and auto-matching (FR-TEAM-02, D#65)
- [x] Separate timer per team member (FR-TEAM-04, D#66)
- [x] Sub-minimum mid-service handling (FR-TEAM-05, D#69, BR-07)
- [x] Sequential transfer: only finishing volunteer earns (FR-TEAM-07, D#33, BR-06)

---

## Milestone 6: Loyalty and merchants

**Goal:** Coin rules, merchant offers, publication approval, QR/manual redemption, recognition.

**Planned scope:**

- LoyaltyLedgerModule: separate wallet, earning rules (FR-LOY)
- MerchantsModule: offer management, Municipality Admin approval (FR-LOY-03, D#20)
- QR code + one-time code redemption (FR-LOY-04, D#21, AT-15)
- Recognition: badges, certificates, opt-in leaderboard (D#36, D#37)

---

## Milestone 7: Governance and reporting

**Goal:** Alerts, complaints, suspensions, bans, appeals, account closure, analytics/exports, external sponsor reports.

**Planned scope:**

- [x] SafetyModule: alerts, pause/resume (FR-SAFE). See [SAFETY_ALERTS.md](SAFETY_ALERTS.md).
- [x] ComplaintsModule: escalation hierarchy (FR-SAFE-03, D#75, D#76). See [COMPLAINTS.md](COMPLAINTS.md).
- [x] RestrictionsModule: suspension, ban, reinstatement (FR-SAFE-06, FR-SAFE-07). See [RESTRICTIONS.md](RESTRICTIONS.md).
- [x] Appeals, to Super Admin and through the complaint levels (D#77, D#78, BR-11, AT-09). Same document.
- Account closure: death, duplicate (FR-IDENT-06, FR-IDENT-07)
- ReportsModule: municipality dashboard, PDF/XLSX/CSV exports (FR-REPORT)
- External sponsor impact report export (D#54, UC-28, AT-29)

---

## Milestone 8: Offline reliability

**Goal:** Local secure queue, automatic sync, conflict handling, delivery states, on-device field tests.

**Planned scope:**

- Flutter encrypted local queue (FR-OFF-01, D#47)
- Idempotency key / operation ID on all mutations (FR-OFF-03)
- Sync state: pending/success/failed (FR-OFF-02, D#99)
- Offline safety alert delivery state (FR-OFF-05, AT-22)
- Flutter offline/low-connectivity field test suite (NFR-16)

---

## Milestone 9: Production hardening

**Goal:** Pen-test/review, realistic load tests, backup restoration, PITR drill, admin audit review, accessibility and
Malayalam validation.

**Planned scope:**

- Security review: access controls, ledger, auth (NFR-18)
- Load test: 300 concurrent users (D#98, AT-26, NFR-03)
- PITR backup restore drill (D#100, UC-29, NFR-05)
- Accessibility audit: contrast, touch targets, screen reader (NFR-13, FR-UX-02)
- Malayalam UI validation (D#50, AT-24)
- Production monitoring setup (NFR-06, D#102)
- Documented rollback procedure (NFR-17, UC-30)
