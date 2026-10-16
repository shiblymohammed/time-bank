# Indian Time Bank — Product Requirements Document (PRD)
**Version:** 2.0 — Multi-Organization & Branded App Architecture  |  **Status:** Approved Product Baseline with ITB Amendments  |  **Date:** 17 October 2026

> **Supersedes:** Kottakkal Time Bank PRD v1.0 (12 October 2026).
> **Baseline Preservation Note:** All 107 confirmed product decisions from v1.0 remain fully preserved and binding. Amendments ITB-001 through ITB-012 clarify and expand the platform topology to an India-wide multi-tenant architecture with centrally verified identity, organization-specific membership approval, dedicated branded mobile apps, and a universal cross-organization lifetime time-credit wallet.

---

## 1. Executive summary

**Indian Time Bank** is a centrally governed, multi-organization volunteer assistance platform supporting municipal corporations, municipalities, and local administrative bodies across India (e.g., Kozhikode Time Bank, Kottakkal Time Bank). 

Under this architecture:
- Eligible individuals request practical help within their local municipality or corporation.
- Verified volunteers provide assistance and accumulate **lifetime universal time credits** stored in a single, cross-organization wallet.
- Eligible beneficiaries receive approved assistance **without needing or spending credits**.
- A distinct **loyalty-coin** system enables local merchant-funded promotional offers and civic recognition.
- Each onboarded municipality or corporation receives a **dedicated, branded mobile app** built from a shared white-label codebase.
- A user maintains **exactly one permanent verified Indian Time Bank identity**, but must receive **independent membership approval** to log in to each organization's branded application.

**Launch principle:** Built and operated by a solo developer using an automated, milestone-driven, quality-first schedule. All confirmed functional workflows target the public launch. A formal budget/spend allocation module remains out of scope; external sponsor impact reports are generated on a schedule.

### 1.1 Product outcomes
- **One Identity, Local Belonging:** Exactly one verified human identity nationwide, with sovereign, locally governed organizational memberships and roles.
- **Universal Time Credits:** Time earned through verified volunteering anywhere in India is preserved for a lifetime in a universal wallet, usable for future assistance or donations across participating organizations.
- **Branded Civic Trust:** Citizens interact with their familiar local municipality or corporation identity (e.g. Kozhikode Time Bank, Kottakkal Time Bank) via dedicated, localized Android applications.
- **Strict Organizational Isolation:** Operational data, service catalogues, volunteer rosters, and coordinator workflows remain strictly isolated by organization, preventing data leakage across civic boundaries.
- **Defensible Accounting & Auditing:** Immutable append-only ledgers capture all credit movements, preserving the originating organization reference on every transaction for auditability and municipal reporting.

### 1.2 Scope and exclusions
- **In Scope for Public Release:**
  - Dedicated branded Android Flutter apps per organization (built from single white-label source).
  - Next.js web dashboards for Super Admin (global), Municipality Admins, Coordinators, and Merchants.
  - Shared NestJS backend API with multi-tenant isolation, OTP authentication, and role authorization.
  - Shared PostgreSQL database enforcing global vs. organization-scoped entity boundaries.
  - Multi-volunteer teams, independent verification, and atomic time & loyalty ledgers.
  - Offline field timers, bilingual UI (Malayalam/English), safety alerts, complaints, and appeals.
  - Automated CI/CD building distinct APKs and publishing releases per organization.
- **Deferred / Excluded:**
  - Flutter iOS builds (architected and planned, but Android first at launch).
  - Funding allocation and budget spending management module.
  - Mandatory hardware/app MFA at launch (mobile OTP confirmed).
  - Persistent background GPS tracking (privacy-first transient/manual location).
  - In-app chat messaging (direct phone calls utilized).
  - Real-time emergency medical dispatch.

---

## 2. Updated system architecture & access model

```
                              ┌──────────────────────────────────┐
                              │         INDIAN TIME BANK         │
                              │       Central Super Admin        │
                              │ Organization Governance Dashboard│
                              └─────────────────┬────────────────┘
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 ▼                                                             ▼
┌─────────────────────────────────┐                           ┌─────────────────────────────────┐
│       Kozhikode Time Bank       │                           │       Kottakkal Time Bank       │
│  Dedicated Branded Android App  │                           │  Dedicated Branded Android App  │
│        (Tenant: KOZHIKODE)      │                           │        (Tenant: KOTTAKKAL)      │
└────────────────┬────────────────┘                           └────────────────┬────────────────┘
                 │                                                             │
                 └──────────────────────────────┬──────────────────────────────┘
                                                │ HTTPS / REST (Versioned API)
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    SHARED NESTJS BACKEND                                      │
│  ┌───────────────────────┬───────────────────────┬───────────────────────┬─────────────────┐  │
│  │ Global Identity & OTP │  Tenant Memberships   │  Role Permissions     │ Service Match   │  │
│  ├───────────────────────┼───────────────────────┼───────────────────────┼─────────────────┤  │
│  │ Universal Time Ledger │ Origin-Scoped Loyalty │ Service Verifications │ Safety & Audit  │  │
│  └───────────────────────┴───────────────────────┴───────────────────────┴─────────────────┘  │
└───────────────────────────────────────────────┬───────────────────────────────────────────────┘
                                                │
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  SHARED POSTGRESQL DATABASE                                   │
│  ┌───────────────────────────────────────────────┬─────────────────────────────────────────┐  │
│  │                 GLOBAL DATA                   │           ORGANIZATION DATA             │  │
│  │ • users            • verified_identities      │ • organizations   • org_branding        │  │
│  │ • auth_sessions    • universal_time_wallets   │ • org_memberships • membership_roles    │  │
│  │ • time_ledger      • global_restrictions      │ • service_catalog • service_requests    │  │
│  │ • audit_events     • death_nominees           │ • assignments     • local_merchants     │  │
│  └───────────────────────────────────────────────┴─────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Actors and permissions matrix

| Actor | Scope | Primary capabilities | Key constraints |
|---|---|---|---|
| **Super Admin** | Global (Indian Time Bank) | Provision organizations/corporations, appoint Municipality Admins, maintain global catalogue policies, inspect cross-org audits, rule on final internal appeals | Cannot bypass immutable audit logs; privileged actions logged permanently. |
| **Municipality Admin** | Organization (e.g. Kottakkal) | Appoint local coordinators, approve local merchants & offers, approve suspensions/bans/reinstatements, approve duplicate closures, export org reports | Strictly isolated to assigned organization; complaints against self route to Super Admin. |
| **Coordinator** | Organization | Verify local membership applications, approve skills, match volunteers, investigate disputes/safety incidents, recommend suspensions | Scoped to own organization; cannot finalize bans or ledger corrections reserved for Admin. |
| **Volunteer** | Multi-Org (Approved Memberships) | Accept tasks, invite teammates, record timers, earn universal time credits and local loyalty coins, donate credits | Must have approved membership in target org's app; cannot self-verify service. |
| **Beneficiary** | Organization | Request immediate/scheduled assistance, verify completion, raise safety alerts | Receives eligible assistance free; eligibility reviewed by local organization coordinator. |
| **Caregiver / Family** | Organization | Submit requests and verify completion on beneficiary's behalf | Requires explicit, revocable beneficiary authorization. |
| **Merchant** | Organization | Submit promotional offers, scan customer QR codes / enter one-time codes, view local redemption volume | Municipality Admin approves offers; merchant funds promotions; loyalty coin use only. |
| **Sponsor / Funder** | External | Receive periodic exported PDF/CSV impact reports | No interactive platform login or dashboard. |

---

## 3. Updated identity, membership & governance rules

### 3.1 Identity vs. Membership separation
1. **One Verified Person = One Global Identity:** A citizen registers once with their mobile number and verification documents. Their global profile, phone credential, verification status, and universal time-credit wallet exist at the **Indian Time Bank** root level.
2. **Independent Organization Memberships:** To access a municipality or corporation's branded app (e.g., Kozhikode Time Bank), the user applies for membership in that specific organization. 
3. **App Login Eligibility:** Possession of an Indian Time Bank identity does *not* automatically grant login to every branded app. An app permits login **only after that organization's coordinator approves the local membership**.
4. **Multi-Organization Participation:** A citizen approved in both Kozhikode and Kottakkal can log in to either branded app using their single verified phone number and OTP.
5. **Distinct Organization Roles:** Roles are granted per organization membership. A user can be a **Volunteer** in Kozhikode and a **Coordinator** in Kottakkal simultaneously.
6. **Physical Service vs. App Access vs. Assignment:**
   - **App Login Eligibility:** Strictly restricted to approved members of that organization.
   - **Assignment Authorization:** A coordinator may assign tasks only to volunteers who hold an approved active volunteer role within that organization.
   - **Cross-Organization Assistance:** A volunteer from another city holding a universal wallet may participate in cross-organization community drives if authorized or enrolled as an approved member in that organization.
7. **Restrictions & Ban Isolation:**
   - **Global Account Suspension / Ban:** Imposed by Super Admin or confirmed network-wide ban freezes access across *all* branded applications and halts all wallet transactions.
   - **Organization-Level Suspension / Revocation:** A municipality admin may revoke or suspend membership in their specific organization. This **must never silently delete or alter** the user's global identity or universal time-credit wallet balance.

### 3.2 Scenario behavior matrix

| Scenario | Expected system behavior | Architectural boundary |
|---|---|---|
| User registers in Kozhikode app | One verified global identity is created (or matched by phone/ID); a membership request is queued for Kozhikode. | Global Identity + Org Membership |
| User opens Kozhikode app before approval | Login denied with clear pending status; access granted only after Kozhikode coordinator approval. | Organization Auth Gate |
| Kozhikode member downloads Kottakkal app | Login denied ("Not a member of Kottakkal Time Bank"); user is prompted to apply for Kottakkal membership. | Multi-Tenant Authorization |
| Same person approved in both apps | Permitted to log in to either app with the same phone number & OTP; sees local context per app. | Shared Auth / Tenant Scope |
| User earns 3 hours in Kozhikode | 3 credits posted to their **Universal Lifetime Wallet**, with transaction metadata recording `originating_org = KOZHIKODE`. | Global Ledger + Org Reference |
| User requests eligible assistance in Kottakkal | If approved as eligible member in Kottakkal, assistance is provided; any member credit transfer debits the universal wallet. | Universal Wallet |
| User is Volunteer in Kozhikode & Coordinator in Kottakkal | JWT/Session issues role claims scoped to the active tenant. In Kottakkal, they see coordinator tools; in Kozhikode, volunteer features. | Scoped Role-Based Access Control |
| Coordinator searches for members | Coordinator can search, view, and inspect *only* records belonging to their authorized organization. | Tenant Data Boundary |
| Super Admin logs in to central dashboard | Super Admin views all organizations, cross-tenant aggregate metrics, and system-wide audits. | Global Super Admin Scope |
| Global ban issued against user | Access blocked across Kozhikode, Kottakkal, and all future apps; wallet operations frozen. | Global Restriction |
| Kottakkal revokes local membership | User can no longer log in to Kottakkal app; Kozhikode membership and global wallet remain unaffected. | Organization-Level Scope |

---

## 4. Updated data model boundaries

```
GLOBAL DOMAIN (Indian Time Bank Core)
├── users (id, phone, status, primary_org_id, created_at, updated_at)
├── verified_identities (id, user_id, document_hash, verification_level, verified_at, verified_by)
├── authentication_sessions (id, user_id, active_org_id, device_info, refresh_token_hash, expires_at)
├── universal_time_wallets (id, user_id, balance_credits, frozen_credits, status)
├── time_credit_ledger (id, wallet_id, amount, balance_after, tx_type, originating_org_id, service_id, reference, created_at)
├── global_account_restrictions (id, user_id, restriction_type, reason, authorized_by, active, created_at)
└── death_nominees (id, user_id, nominee_name, nominee_phone, nominee_user_id, verified, updated_at)

ORGANIZATIONS DOMAIN (Multi-Tenant Local Operations)
├── organizations (id, slug, name, state, district, status, created_at)
├── organization_branding (id, org_id, app_display_name, logo_url, primary_color, secondary_color, terms_url)
├── organization_app_builds (id, org_id, android_package_id, build_version, min_supported_version, active)
├── organization_memberships (id, org_id, user_id, membership_number, status, joined_at, reviewed_by)
├── membership_role_grants (id, membership_id, role, granted_at, granted_by, active)
├── membership_approvals (id, membership_id, status, notes, reviewer_id, created_at)
├── organization_service_catalogue (id, org_id, global_service_type_id, enabled, min_volunteers, preferred_volunteers)
├── service_requests (id, org_id, requester_id, service_catalogue_id, location_text, lat, lng, scheduled_at, status)
├── volunteer_assignments (id, request_id, volunteer_membership_id, status, started_at, completed_at)
├── service_verifications (id, assignment_id, verifier_id, verifier_type, hours_credited, approved_at)
├── organization_merchants (id, org_id, merchant_name, phone, address, approved_by, active)
└── loyalty_redemptions (id, org_id, merchant_id, user_id, offer_id, coins_spent, token, redeemed_at)
```

### 4.1 Cardinality & Integrity Invariants
1. `User (1) ───── (many) OrganizationMembership`: A user may hold memberships in multiple organizations, but each membership is independently approved and administered.
2. `Organization (1) ───── (many) OrganizationMembership`: An organization manages its distinct membership roster.
3. `User (1) ───── (1) UniversalTimeWallet`: Every verified human user has exactly one universal time-credit wallet across all participating organizations.
4. `OrganizationMembership (1) ───── (many) RoleGrants`: Roles (Volunteer, Coordinator, Admin) attach to the specific organization membership, not the bare global user.
5. `Organization (1) ───── (many) ServiceRequests`: Every operational record carries a foreign key to its owning organization.
6. `time_credit_ledger (many) ───── (1) organizations`: Every wallet transaction carries an `originating_org_id` foreign key for municipal auditing, cross-tenant reconciliation, and sponsor impact reporting.
7. **Database Isolation Enforcement:** All queries for operational tables (`service_requests`, `volunteer_assignments`, `organization_memberships`, etc.) must filter by `org_id` in application services. Optional PostgreSQL Row-Level Security (RLS) policies serve as an additional defense-in-depth layer.

---

## 5. PRD change register (ITB-001 through ITB-012)

This register defines the explicit amendments adopted in PRD v2.0. These supersede conflicting assumptions in v1.0 without discarding confirmed core policies.

| Change ID | Requirement update | Scope / Impact | Rationale & Superseded Rule |
|---|---|---|---|
| **ITB-001** | Rename central governance platform to **Indian Time Bank** | Branding, Documentation, Root Config | Supersedes "Kottakkal Time Bank" as the master platform title. Kottakkal becomes the inaugural tenant organization alongside Kozhikode and future cities. |
| **ITB-002** | Support municipal corporations and municipalities as independent organizations | Backend Data Model, API | Formalizes multi-tenant entity modeling. Replaces informal municipal tag with formal `organizations` and `organization_branding` tables. |
| **ITB-003** | Provide dedicated branded mobile application per onboarded organization | Flutter Mobile, CI/CD Pipeline | Replaces the single generic mobile app with white-label flavor builds (e.g. Kozhikode Time Bank APK, Kottakkal Time Bank APK). |
| **ITB-004** | Maintain exactly one centrally verified user identity nationwide | Auth, Identity, KYC | Reaffirms and strengthens D#39 & D#42: One permanent human identity, verified once, spanning all civic organizations. |
| **ITB-005** | Require organization-specific membership approval for app login | Authentication & Auth Guards | Extends D#42: Global identity creation alone does not grant app entry; local membership must be in `APPROVED` state to access an organization's app. |
| **ITB-006** | Enforce organization-specific role grants | RBAC / Authorization | Refines D#2: A user's role (Volunteer, Coordinator) is scoped strictly to an organization membership, allowing different roles in different cities. |
| **ITB-007** | Restrict branded app access to approved organization members | Flutter Client & API Gateway | Mobile login gateway validates that the authenticated global user possesses an active approved membership in the app's configured tenant. |
| **ITB-008** | Maintain one universal lifetime time-credit wallet per user | Ledger & Accounting | Preserves D#17 & D#18: All credits earned across any approved organization flow into the user's single universal wallet with lifetime validity. |
| **ITB-009** | Preserve origin-organization references for all wallet postings | Audit, Reporting, Ledger | Enhances BR-09: Every credit award, donation, or debit record retains `originating_org_id` for municipal impact accounting and audits. |
| **ITB-010** | Support central creation, branding, activation, and suspension of organizations | Web Admin Dashboard | Extends D#52: Super Admin provisions organizations, configures branding tokens, sets package IDs, and can suspend an organization if needed. |
| **ITB-011** | Establish a distinct build, signing, and release lifecycle per organization | DevOps, CI/CD, Distribution | Automates multi-flavor Flutter builds via GitHub Actions. Creating a new organization in DB is decoupled from building/publishing its signed APK. |
| **ITB-012** | Preserve central oversight, global appeals, and platform governance | Super Admin Governance | Reaffirms D#78 & D#83: Super Admin retains global audit inspection, platform-wide ban authority, and final internal dispute appeals. |

---

## 6. White-label Flutter app architecture

A single Flutter codebase (`apps/mobile/`) produces each municipality or corporation's branded Android application using build flavors and declarative configuration files.

```
apps/mobile/
├── lib/
│   ├── core/              # Shared networking, database, offline queue, state primitives
│   ├── features/          # Service requests, matching, timer, wallet, profile, safety
│   ├── authentication/    # Mobile OTP, global identity session, membership gating
│   ├── branding/          # Dynamic theme injector (colors, typography, assets, strings)
│   └── main.dart          # Entrypoint initializing flavor configuration
├── configs/
│   ├── kozhikode.json     # Kozhikode Time Bank configuration
│   └── kottakkal.json     # Kottakkal Time Bank configuration
└── android/
    └── app/
        └── build.gradle   # Flavors: kozhikode, kottakkal (unique applicationId, manifestPlaceholders)
```

### 6.1 Flavor configuration schema

Each configuration file defines tenant identity and visual branding:

```json
{
  "tenantId": "KOZHIKODE",
  "organizationName": "Kozhikode Municipal Corporation",
  "appDisplayName": "Kozhikode Time Bank",
  "applicationId": "in.gov.kerala.timebank.kozhikode",
  "primaryColor": "#0D5C75",
  "secondaryColor": "#F59E0B",
  "logoAssetPath": "assets/branding/kozhikode/logo.png",
  "supportEmail": "timebank@kozhikodecorporation.lsgkerala.gov.in",
  "apiBaseUrl": "https://api.indiantimebank.in"
}
```

### 6.2 Comparison of initial release builds

| Property | Kozhikode Time Bank | Kottakkal Time Bank |
|---|---|---|
| **Display Name** | Kozhikode Time Bank | Kottakkal Time Bank |
| **Tenant Slug** | `kozhikode` | `kottakkal` |
| **Application ID** | `in.gov.kerala.timebank.kozhikode` | `in.gov.kerala.timebank.kottakkal` |
| **App Icon & Branding** | Kozhikode Corporation motif | Kottakkal Municipality motif |
| **Login Eligibility** | Approved Kozhikode members | Approved Kottakkal members |
| **Backend API** | Shared Indian Time Bank API | Shared Indian Time Bank API |
| **Time-Credit Wallet** | Universal Lifetime Wallet | Universal Lifetime Wallet |
| **Local Loyalty Offers**| Kozhikode approved merchants | Kottakkal approved merchants |

---

## 7. Functional requirements

### FR-IDENT: Identity, verification and account lifecycle
- **FR-IDENT-01:** OTP authentication using verified mobile number across all roles; rate limiting, single-use expiry, and auditable session logs (D#42, D#103).
- **FR-IDENT-02:** Single permanent verified human identity created after coordinator validation of identity/address documents; automated duplicate detection by phone or national identifier flags matches for review (D#39, D#86, ITB-004).
- **FR-IDENT-03:** Multi-organization membership: A verified identity can request membership in multiple organizations; each membership is approved independently (ITB-005).
- **FR-IDENT-04:** Branded app login gate: Client and API verify that an authenticated identity holds `status = 'APPROVED'` in the application's configured organization before granting access (ITB-007).
- **FR-IDENT-05:** Coordinator-assisted phone/SIM recovery preserves the original global identity and all associated organization memberships and wallets (D#43).
- **FR-IDENT-06:** Member nominates a verified recipient for post-death credit transfer; nominee changes require OTP; disputed changes trigger coordinator review (D#44, D#45).
- **FR-IDENT-07:** Deceased account closure prevents new operations, retires local coins, transfers time credits to the verified nominee, and securely archives activity (D#46).
- **FR-IDENT-08:** Duplicate account closure requires investigation and Municipality Admin approval; never auto-merge; balances remain permanently frozen in the closed duplicate (D#87, D#88, D#89, D#90).

### FR-GOV: Organizations, roles and governance
- **FR-GOV-01:** Super Admin provisions municipal corporations and municipalities (organizations), configures branding and admins via central dashboard (D#1, D#2, D#52, ITB-010).
- **FR-GOV-02:** Municipality Admins appoint local coordinators; coordinators review memberships, verify skills, and inspect incidents (D#2, ITB-006).
- **FR-GOV-03:** Central service catalogue governance: Super Admin maintains global service categories; organizations enable specific categories and set local volunteer count rules (D#10, ITB-002).
- **FR-GOV-04:** Every privileged API operation checks role permissions and organization scope at the service boundary (NFR-09, ITB-006).
- **FR-GOV-05:** Final internal appeal authority is Super Admin; case evidence and audit history preserved permanently (D#78, ITB-012).

### FR-BEN: Beneficiary eligibility and rights
- **FR-BEN-01:** Central eligibility standards with organization coordinator verification and Municipality Admin exceptions/appeals (D#24).
- **FR-BEN-02:** Ongoing or temporary eligibility periods with mandatory review dates (D#25).
- **FR-BEN-03:** Approved beneficiaries receive eligible assistance completely free, irrespective of their time-credit balance or volunteer suspension (D#6, BR-02).
- **FR-BEN-04:** Organization-scoped frequency limits and coordinator exception handling (D#26).
- **FR-BEN-05:** Caregiver authorization is explicit, revocable, and privacy-protected; no public directory of vulnerable beneficiaries (D#8, D#37).

### FR-SVC: Service catalogue and request lifecycle
- **FR-SVC-01:** Immediate and future-scheduled assistance requests, created by beneficiary, authorized caregiver, or coordinator within their organization (D#8, D#60).
- **FR-SVC-02:** Every request requires a manually entered service location, independent of the member's residential address (D#59).
- **FR-SVC-03:** Scheduled requests begin candidate volunteer matching immediately; volunteers accept future assignments in advance (D#61).
- **FR-SVC-04:** Flexible cancellation and rescheduling with notifications; repeated cancellations reviewed by coordinator (D#62).
- **FR-SVC-05:** Service timers with start/stop, manual correction requests, and independent verification by beneficiary, caregiver, or coordinator (D#14, D#27).
- **FR-SVC-06:** Variable actual duration determined by verified timer, with approved base rates and policy-defined bonuses (D#14).

### FR-MATCH: Volunteer matching and availability
- **FR-MATCH-01:** Proximity matching defaults to verified address; optional transient GPS used with explicit permission; no continuous live tracking (D#58).
- **FR-MATCH-02:** Match candidates based on organization membership, approved skills, request location, and volunteer eligibility (D#9, D#11).
- **FR-MATCH-03:** Voluntary acceptance with no fixed schedule; volunteers freely accept or decline individual tasks (D#12).
- **FR-MATCH-04:** Unfilled requests trigger automatic search radius expansion followed by coordinator escalation and manual assignment (D#7, D#13).
- **FR-MATCH-05:** Assigned parties communicate via direct phone calls; no in-app chat required (D#30).

### FR-TEAM: Multi-volunteer services and transfers
- **FR-TEAM-01:** Catalogue defines minimum safe and preferred volunteer counts per service (D#64).
- **FR-TEAM-02:** Team openings filled by invited eligible volunteers or automatic matching (D#65).
- **FR-TEAM-03:** Equal general team responsibilities; no coordinator-assigned specialized sub-roles (D#67).
- **FR-TEAM-04:** Teams start when minimum safe staffing is verified; each volunteer has an independent timer and verification (D#66, D#68).
- **FR-TEAM-05:** If a team drops below minimum mid-service, hazardous physical tasks must stop, the assignment remains open, and the coordinator is alerted (D#69, BR-07).
- **FR-TEAM-06:** Every completing, verified simultaneous team member earns eligible time credits and coins (D#63, BR-06).
- **FR-TEAM-07:** Sequential transfers permit replacement; *only the finishing volunteer* receives that assignment's service rewards (D#31, D#33, D#34, BR-06).

### FR-TIME: Universal lifetime time-credit ledger
- **FR-TIME-01:** Exactly one universal wallet per verified user; lifetime validity with no routine expiration; strictly separated from loyalty coins (D#3, D#17, D#18, ITB-008).
- **FR-TIME-02:** Credits issued only upon authoritative service verification and policy calculation (D#14, BR-01).
- **FR-TIME-03:** Support eligible assistance requests, member-to-member donations, and donations to approved community pools across organizations (D#15, D#19, UC-12).
- **FR-TIME-04:** Transactional, append-only ledger entries; every transaction logs `originating_org_id`, preventing double issuance or spending (NFR-10, ITB-009).
- **FR-TIME-05:** Temporary suspension and permanent bans freeze transactions while preserving historical balances (D#79, D#84).
- **FR-TIME-06:** Suspected fraud temporarily restricts disputed credits; coordinator investigates and Municipality Admin authorizes corrections (D#91).
- **FR-TIME-07:** Downstream unspent traceable credits from fraudulent transfers are held pending review (D#92).

### FR-LOY: Loyalty coins and local merchants
- **FR-LOY-01:** Separate loyalty coin wallet earned through verified volunteering, milestones, and approved engagement (D#3, D#4).
- **FR-LOY-02:** Super Admin sets central loyalty policies; local municipal bonus campaigns require central approval (D#23).
- **FR-LOY-03:** Local merchants propose promotional offers; Municipality Admin reviews and approves publication (D#20).
- **FR-LOY-04:** In-store redemption via merchant QR scan or single-use manual code fallback; atomic status check prevents double redemption (D#21).
- **FR-LOY-05:** Participating merchants fully fund their offers; no cash reimbursement from the platform or municipality (D#22).
- **FR-LOY-06:** Privacy-controlled civic recognition badges, milestone certificates, and optional leaderboards (D#36, D#37).

### FR-SAFE: Safety, complaints and restrictions
- **FR-SAFE-01:** Volunteers and beneficiaries can raise confidential safety alerts during active service to their assigned coordinator (D#70, D#71, D#72).
- **FR-SAFE-02:** Alerting party can pause or terminate service; restart of a safety-paused service strictly requires coordinator authorization (D#73, D#74, BR-10).
- **FR-SAFE-03:** Confidential complaints against a coordinator escalate directly to the Municipality Admin; complaints against an Admin escalate to Super Admin (D#75, D#76).
- **FR-SAFE-04:** Hierarchical appeals with complete case evidence; Super Admin is final internal authority (D#77, D#78).
- **FR-SAFE-05:** Temporary suspension recommended by coordinator and authorized by Municipality Admin; balances preserved (D#80, D#81).
- **FR-SAFE-06:** Permanent ban authorized by Municipality Admin after investigation; applies platform-wide; overturned appeal to Super Admin automatically restores access (D#82, D#83, D#85, BR-11).

### FR-OFF: Offline field operations
- **FR-OFF-01:** Offline registration capture by coordinators and offline timer/event recording by volunteers (D#47).
- **FR-OFF-02:** Automatic synchronization upon network reconnection with pending/success/failure states (D#99).
- **FR-OFF-03:** Idempotency keys and client operation IDs prevent duplicate records on retry (NFR-11).
- **FR-OFF-04:** Final verification approvals, ledger postings, merchant redemptions, and admin actions remain strictly online and server-authoritative (BR-08).
- **FR-OFF-05:** Multi-channel notifications (Push, SMS, opt-in WhatsApp); un-synced offline alerts never falsely report delivered status (D#48, NFR-15).

### FR-REPORT: Analytics and sponsor reporting
- **FR-REPORT-01:** Organization-scoped dashboards and PDF/Excel/CSV exports for Municipality Admins; Super Admin views nationwide cross-organization metrics (D#49).
- **FR-REPORT-02:** Privacy-safe aggregation protects individual beneficiary and volunteer records (NFR-14).
- **FR-REPORT-03:** Periodic downloadable impact reports generated for external sponsors and funders; no sponsor login or dashboard (D#54, D#57).
- **FR-REPORT-04:** Funding allocation and budget spend management remain excluded from current release (D#58).

---

## 8. Non-functional requirements (NFRs)

| ID | Category | Requirement / Target | Traceability |
|---|---|---|---|
| **NFR-01** | Architecture | NestJS TypeScript modular backend, PostgreSQL 16+ database, versioned REST API (`/v1`), Next.js 15 web dashboards, Flutter 3.24+ Android apps. | D#93–D#96 |
| **NFR-02** | Infrastructure | Docker Compose on Linux VPS, Nginx reverse proxy with TLS termination, GitHub Actions CI/CD with approval gates. | D#97, D#101 |
| **NFR-03** | Multi-Tenancy | Strict tenant isolation by `organization_id` on all operational tables and queries; zero cross-tenant IDOR or data leakage. | ITB-002, ITB-006 |
| **NFR-04** | Capacity | Certified engineering target: 10,000 registered users and 300 concurrent users across initial municipal organizations. | D#98 |
| **NFR-05** | Backup & PITR | Daily encrypted off-server backups with continuous PostgreSQL WAL archiving for point-in-time recovery; documented restore drills. | D#100 |
| **NFR-06** | Ledger Integrity | Double-entry / transactional ledger with idempotency keys; append-only audit trail; zero double-spend or double-minting. | BR-09, NFR-10 |
| **NFR-07** | Identity Security | Mobile OTP authentication for members and administrators; rate limiting, 15m access tokens, single-use refresh tokens; login audit logs. | D#103, NFR-07 |
| **NFR-08** | Offline Reliability| Encrypted local SQLite/Hive queue; automatic retry with client operation IDs; authoritative server-side finality. | D#47, D#99 |
| **NFR-09** | Privacy & Safety | Role-scoped access to beneficiary locations and documents; no continuous GPS tracking; safety alerts route to assigned coordinator only. | D#58, D#71 |
| **NFR-10** | Localization | Bilingual Malayalam and English at launch; architecture extensible to other Indian languages. | D#50 |
| **NFR-11** | Code Quality | Monorepo structure, strict TypeScript (`strict: true`, `exactOptionalPropertyTypes: true`), shared lint/formatting, automated tests in CI. | D#107, NFR-16 |
| **NFR-12** | Solo Maintainability| Clean architecture, descriptive ADRs, and zero unverified AI-generated production code to enable sustainable single-developer maintenance. | D#107 |

---

## 9. Delivery strategy & milestone alignment

The platform is delivered in progressive, testable milestones by a solo developer:

```
┌────────────────────────────────────────────────────────────────────────┐
│ MILESTONE 1: Foundation & Architecture (COMPLETE ✓)                    │
│ Monorepo, pnpm workspace, NestJS API shell, Next.js dashboard shell,   │
│ Flutter mobile shell, Docker Compose, CI/CD, and DB migrations.        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ MILESTONE 2: Multi-Organization Governance & Verified Identity         │
│ Organizations & branding, global identity, OTP auth, local membership  │
│ approval, role grants, white-label Flutter flavor builds.              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ MILESTONE 3: Core Service Catalogue & Request Matching                 │
│ Org service catalogue, request creation, manual location, immediate    │
│ & future matching, volunteer assignment, notifications.                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ MILESTONE 4: Timers, Independent Verification & Universal Ledger       │
│ Service timer recording, independent verifications, atomic time-credit │
│ ledger with origin org tracking, universal donations.                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ MILESTONE 5: Team Services, Transfers & Safety Systems                 │
│ Team headcount rules, sequential transfers, confidential safety alerts,│
│ service pauses, complaints hierarchy, and appeals.                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ MILESTONE 6: Loyalty Coin Economy & Local Merchants                    │
│ Loyalty coin rules, merchant proposals, publication approvals,         │
│ QR and manual code redemption, civic recognition.                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ MILESTONE 7: Offline Operations & Field Synchronization                │
│ Durable local queue, background sync, client operation IDs, offline    │
│ timers, conflict resolution, on-device testing.                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ MILESTONE 8: Administration, Reporting & Production Hardening          │
│ Suspensions, bans, duplicate closures, sponsor impact exports,         │
│ security audit, load testing (300 concurrent), and backup drills.      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Complete decision traceability register (All 107 Decisions)

Every product decision is preserved and traced below. Where amended by ITB-001–ITB-012, the amendment is noted explicitly.

| # | Topic | Confirmed Decision Resolution | Multi-Tenant / ITB Reference |
|---:|---|---|---|
| 1 | Multi-municipality platform | One centrally administered platform supports multiple municipalities and municipal corporations. | ITB-001, ITB-002 |
| 2 | Administrative hierarchy | Super Admin creates organizations and appoints Admins; Admins appoint Coordinators; Coordinators verify members. | ITB-006, ITB-010 |
| 3 | Separate wallet types | Time credits are strictly distinct from loyalty coins; time credits cannot be spent at merchant shops. | Core Invariant |
| 4 | Loyalty earning policy | Hybrid earning from verified service, performance, civic achievements, and community engagement. | FR-LOY-01 |
| 5 | Service completion assurance | Multichannel independent verification by beneficiary, caregiver, or independent coordinator. | FR-SVC-05 |
| 6 | Free assistance to beneficiaries | Verified eligible beneficiaries receive approved assistance without spending time credits. | Core Invariant |
| 7 | Volunteer assignment | Hybrid volunteer acceptance plus coordinator manual assignment and intervention. | FR-MATCH-04 |
| 8 | Request initiators | Beneficiaries, coordinators, and authorized family members/caregivers can submit requests. | FR-SVC-01 |
| 9 | Location-driven matching | Match using location, skills, and eligibility rather than rigid coordinator-controlled volunteer zones. | FR-MATCH-02 |
| 10 | Service catalogue governance | Centrally standardized catalogue; organizations enable services and set local headcount rules. | ITB-002, FR-GOV-03 |
| 11 | Volunteer skills approval | Volunteers select skills; local organization coordinators approve participation with checks. | FR-MATCH-02 |
| 12 | Volunteer availability | No compulsory recurring weekly schedule; volunteers freely accept/decline requests individually. | FR-MATCH-03 |
| 13 | Unfilled request handling | Expand geographic search automatically, then escalate to local coordinator for intervention. | FR-MATCH-04 |
| 14 | Service duration accounting | Start/stop timer, manual correction, recipient verification; actual duration with base rates/bonuses. | FR-SVC-05, FR-SVC-06 |
| 15 | Time-credit use | Hold for future need, use for eligible assistance, donate to verified members or community pools. | FR-TIME-03 |
| 16 | Volunteer-to-beneficiary transition | Volunteers can later gain beneficiary eligibility; free approved assistance does not consume credits. | Core Invariant |
| 17 | Universal time-credit wallet | One single time-credit wallet usable and donatable across all participating organizations. | ITB-008 |
| 18 | Lifetime credit validity | No routine expiration; adjustments only for authorized fraud/error corrections. | ITB-008 |
| 19 | Donation recipients | Verified individuals and approved municipal community assistance pools. | FR-TIME-03 |
| 20 | Merchant offer approval | Merchants propose/manage offers; Municipality Admin approves publication. | FR-LOY-03 |
| 21 | Merchant redemption | Merchant QR scan with one-time manual code fallback; shared state prevents double use. | FR-LOY-04 |
| 22 | Merchant-funded discounts | Participating merchants bear the cost of promotional offers; no cash reimbursement from platform. | FR-LOY-05 |
| 23 | Loyalty policy ownership | Super Admin sets central loyalty policies; local municipal bonus campaigns require central approval. | FR-LOY-02 |
| 24 | Beneficiary eligibility standards | Central eligibility rules, coordinator verification, Municipality Admin exceptions/appeals. | FR-BEN-01 |
| 25 | Eligibility review periods | Differentiated review dates for ongoing versus temporary beneficiary eligibility. | FR-BEN-02 |
| 26 | Service usage frequency | Central frequency limits, exception requests, coordinator prioritization. No emergency dispatch. | FR-BEN-04 |
| 27 | Completion verifier options | Beneficiary, authorized caregiver, or coordinator verifies; volunteer cannot self-verify. | BR-01 |
| 28 | Routine complaints | Local coordinator handles routine disputes; independent handling if conflict of interest exists. | FR-SAFE-03 |
| 29 | Volunteer reliability | Progressive policy for cancellations/no-shows with incident logs, review, and warnings. | FR-SVC-04 |
| 30 | Service communication | Assigned parties communicate via direct phone calls; in-app chat is not required. | FR-MATCH-05 |
| 31 | Volunteer transfer request | Assigned volunteer can withdraw or request a replacement through the app. | FR-TEAM-07 |
| 32 | Transfer authorization | Routine transfers rematch automatically; sensitive/urgent ones require coordinator review. | FR-TEAM-07 |
| 33 | Time-credit award on transfers | Only the volunteer finishing a sequentially transferred assignment receives service time credits. | BR-06 |
| 34 | Loyalty award on transfers | Only the finishing volunteer receives service-related loyalty coins for sequential transfers. | BR-06 |
| 35 | Volunteer performance inputs | Blend beneficiary feedback, verified completions, reliability incidents, and coordinator review. | FR-LOY-01 |
| 36 | Volunteer recognition | Levels, badges, certificates, and loyalty milestone bonuses. | FR-LOY-06 |
| 37 | Recognition privacy | Achievement visibility is privacy-controlled; leaderboards opt-in; beneficiary data never public. | FR-LOY-06 |
| 38 | Long-term client coverage | Android and web dashboards for initial release; iOS and all-role apps in long-term plan. | NFR-01 |
| 39 | Unified multi-role identity | One permanent verified human identity; multiple separately approved organization role grants. | ITB-004, ITB-006 |
| 40 | Primary municipality & multi-org | One administrative home organization; cross-organization volunteering and universal wallet. | ITB-005, ITB-008 |
| 41 | Relocation & multi-membership | Member can join another organization; destination coordinator approves, preserving global wallet. | ITB-005 |
| 42 | Initial login and identity check | Mobile OTP with coordinator-reviewed identity documents and organization membership approval. | ITB-005, ITB-007 |
| 43 | Lost phone/SIM recovery | Coordinator-assisted identity verification and phone update preserve the original account and wallet. | FR-IDENT-05 |
| 44 | Death nominee | Verified nominee can receive remaining time credits following verification and law. | FR-IDENT-06 |
| 45 | Nominee changes | Member updates nominee using OTP; suspect or disputed changes reviewed by coordinator. | FR-IDENT-06 |
| 46 | Deceased member handling | Restrict new activity, verify nominee transfer, retire unused coins, archive history. | FR-IDENT-07 |
| 47 | Offline-first operations | Offline registration capture and offline timer events with later sync; wallet issuing is online-only. | FR-OFF-01, BR-08 |
| 48 | Notifications | Push notifications, SMS, and optional opt-in WhatsApp. | FR-OFF-05 |
| 49 | Analytics and exports | Organization-scoped dashboards for Admins; Super Admin views cross-tenant summaries. | ITB-009, FR-REPORT-01 |
| 50 | Languages | Bilingual Malayalam and English at launch; extensible architecture for other Indian languages. | FR-UX-01 |
| 51 | Accessibility | High contrast, legible typography, touch targets, screen-reader labels, keyboard navigation. | FR-UX-02 |
| 52 | Organization creation | Super Admin provisions organizations and configures branding in dashboard; no self-service creation. | ITB-010 |
| 53 | Funding model | Government grants, NGO partnerships, CSR sponsorship; no compulsory citizen fee. | Informational |
| 54 | Sponsor reporting scope | Sponsors receive periodic downloadable impact reports; no sponsor login or dashboard. | FR-REPORT-03 |
| 55 | Sponsor access boundary | External funders consume exported reports, never privileged member or admin accounts. | FR-REPORT-03 |
| 56 | Funding operations boundary | Sponsorship funds platform infrastructure; merchants fund their own promotions. | Informational |
| 57 | Final sponsor reporting revision | Periodic downloadable impact reports shared externally; dedicated sponsor portal rejected. | FR-REPORT-03 |
| 58 | Volunteer location matching | Verified residential location by default; optional transient GPS; continuous tracking rejected. | FR-MATCH-01 |
| 59 | Service request location | Manually entered service address for every request, independent of home residence. | FR-SVC-02 |
| 60 | Request timing | Both immediate assistance requests and future scheduled bookings supported. | FR-SVC-01 |
| 61 | Scheduled matching | Start matching immediately upon creation; volunteers accept future assignments in advance. | FR-SVC-03 |
| 62 | Cancellation and rescheduling | Requesters can cancel/reschedule; volunteer withdrawal rematches; late cancellations reviewed. | FR-SVC-04 |
| 63 | Multi-volunteer assignments | Service-defined teams supported; each completing verified member earns individual rewards. | FR-TEAM-01, FR-TEAM-06 |
| 64 | Partial team staffing | Minimum safe and preferred team counts defined; service begins once minimum safe count met. | FR-TEAM-01, FR-TEAM-04 |
| 65 | Team recruitment | Volunteer invitations for eligible teammates plus automated matching of open positions. | FR-TEAM-02 |
| 66 | Team verification | Each participating volunteer has an independent timer and completion verification. | FR-TEAM-04 |
| 67 | Team responsibilities | All team members share equal general responsibilities; coordinator-assigned sub-specialties rejected. | FR-TEAM-03 |
| 68 | Team start | Volunteers may begin work once minimum safe staffing is confirmed on-site. | FR-TEAM-04 |
| 69 | Staffing reduction mid-service | If team drops below minimum, notify coordinator; continue safe tasks only; halt hazardous tasks. | FR-TEAM-05, BR-07 |
| 70 | Volunteer safety | Coordinator safety alerts plus confidential incident reporting. | FR-SAFE-01 |
| 71 | Safety-alert routing | Alerts route directly to assigned coordinator; no broadcast escalation to general public. | FR-SAFE-01 |
| 72 | Beneficiary safety | Both volunteers and beneficiaries can trigger safety alerts during active service. | FR-SAFE-01 |
| 73 | Safety response | Alerting party can pause or end service; coordinator notified immediately. | FR-SAFE-02 |
| 74 | Safety restart | Assigned coordinator must authorize restarting a safety-paused service; participants may decline. | FR-SAFE-02, BR-10 |
| 75 | Coordinator complaints | Confidential complaints against a coordinator submit directly to Municipality Admin. | FR-SAFE-03 |
| 76 | Municipality Admin complaints | Confidential complaints against an Admin submit directly to Super Admin. | FR-SAFE-03 |
| 77 | Appeals hierarchy | Appeal decisions to the next higher administrative authority with full case history. | FR-SAFE-04 |
| 78 | Final appeal | Super Admin is the final internal authority; statutory/legal rights unaffected. | FR-SAFE-04, ITB-012 |
| 79 | Temporary suspension wallets | Preserve wallet balances but freeze earning, spending, donations, and redemption. | FR-TIME-05 |
| 80 | Suspension authority | Coordinator investigates and recommends; Municipality Admin approves suspension and reinstatement. | FR-SAFE-05 |
| 81 | Reinstatement review | Coordinator reviews and recommends; Admin approves; never auto-reinstate on elapsed time alone. | FR-SAFE-05 |
| 82 | Permanent ban authority | Municipality Admin may permanently ban after investigation; appealable to Super Admin. | FR-SAFE-06 |
| 83 | Permanent ban scope | Permanent ban authorized by Admin applies platform-wide across all branded applications. | FR-SAFE-06, ITB-012 |
| 84 | Banned member wallets | Preserve wallet balances and audit history while permanently freezing all wallet operations. | FR-TIME-05 |
| 85 | Overturned ban | Successful Super Admin appeal automatically restores permissions and unfreezes wallet. | FR-SAFE-06, BR-11 |
| 86 | Duplicate detection | Automated phone and legal identity matching; coordinator reviews potential duplicate accounts. | FR-IDENT-02 |
| 87 | Post-registration duplicates | Close duplicate accounts after transaction review; automatic merging strictly prohibited. | FR-IDENT-08 |
| 88 | Duplicate closure authority | Coordinator investigates; Municipality Admin approves duplicate account closure. | FR-IDENT-08 |
| 89 | Duplicate time credits | Preserve verified time-credit balance frozen inside closed duplicate; no transfer to primary. | FR-IDENT-08 |
| 90 | Duplicate loyalty coins | Preserve loyalty-coin balance frozen inside closed duplicate; no transfer to primary. | FR-IDENT-08 |
| 91 | Suspected credit fraud | Temporarily freeze disputed credits; coordinator investigates; Admin approves corrections. | FR-TIME-06 |
| 92 | Fraud-tainted transferred credits | Temporarily hold traceable downstream credits pending review; no unverified negative balance. | FR-TIME-07 |
| 93 | First-release interfaces | Flutter mobile for members; Next.js web dashboards for coordinators, admins, and merchants. | NFR-01 |
| 94 | Mobile launch OS | Android first using Flutter; iOS planned for subsequent release. | NFR-01 |
| 95 | Backend stack | NestJS + TypeScript + PostgreSQL; modular monolith with multi-tenant domain boundaries. | NFR-01, ITB-002 |
| 96 | Web frontend stack | Next.js + React + TypeScript role-aware web dashboards. | NFR-01 |
| 97 | Hosting infrastructure | Development-team-managed Linux VPS with isolated containers. | NFR-02 |
| 98 | Capacity target | Initial engineering target of 10,000 registered users and 300 concurrent active users. | NFR-04 |
| 99 | Offline sync behavior | Automatic background synchronization; pending/success/failure states; server-authoritative finality. | FR-OFF-02, NFR-08 |
| 100 | Database backup & recovery | Daily encrypted off-server backups with PostgreSQL WAL archiving for point-in-time recovery. | NFR-05 |
| 101 | Deployment pipeline | Docker Compose on VPS + GitHub Actions CI/CD with approval gates and automated rollbacks. | NFR-02, ITB-011 |
| 102 | Production monitoring | VPS health, API errors/latency, database checks, queue status, developer notifications. | NFR-06 |
| 103 | Login authentication model | Mobile-number OTP for members and administrators; rate-limited, single-use, auditable. | FR-IDENT-01, NFR-07 |
| 104 | Deployment environments | Development and production environments only; no dedicated staging environment. | NFR-04 |
| 105 | Public launch scope | Full confirmed functional platform ready at first public launch. | Launch Principle |
| 106 | Release timing | Milestone-driven, quality-first schedule with no fixed deadline. | Launch Principle |
| 107 | Solo developer model | One solo developer, assisted by AI pair-programming tools with human review. | NFR-12 |

---

## 11. Acceptance test scenarios (Updated for Multi-Tenancy)

| ID | Scenario | Expected Result |
|---|---|---|
| **AT-01** | User with Kozhikode-only membership attempts login to Kottakkal app | Login is denied with explicit notification: "Not an approved member of Kottakkal Time Bank. Apply for membership." |
| **AT-02** | User approved in both Kozhikode and Kottakkal logs into Kozhikode app | Login succeeds via mobile OTP; user sees Kozhikode branding, local catalogue, and local requests. |
| **AT-03** | User earns 2 hours of verified volunteering in Kozhikode | Universal wallet is credited with 2 hours; ledger records `originating_org_id = KOZHIKODE`. |
| **AT-04** | Same user logs into Kottakkal app and views wallet balance | Universal wallet displays the 2 hours earned in Kozhikode, ready for eligible use or donation. |
| **AT-05** | Kottakkal coordinator searches for members | Search returns only members with approved or pending memberships in Kottakkal; Kozhikode-only records are excluded. |
| **AT-06** | User holds Volunteer role in Kozhikode and Coordinator role in Kottakkal | In Kozhikode app/dashboard, user has volunteer capabilities only; in Kottakkal dashboard, coordinator tools are unlocked. |
| **AT-07** | Super Admin logs into central dashboard | Super Admin views all onboarded organizations, provisions new municipalities, and inspects global audit logs. |
| **AT-08** | Kottakkal Municipality Admin revokes a local membership | User is blocked from Kottakkal app; their global verified identity and Kozhikode membership remain active. |
| **AT-09** | Platform-wide permanent ban confirmed on appeal failure | User is locked out of both Kozhikode and Kottakkal apps; universal wallet transactions are frozen. |
| **AT-10** | CI/CD triggered for Kozhikode release | Build script uses `configs/kozhikode.json`, builds `in.gov.kerala.timebank.kozhikode`, and applies Kozhikode branding assets. |
| **AT-11** | Verified beneficiary requests assistance | Assistance is scheduled and delivered free without credit deduction. |
| **AT-12** | Merchant offer redeemed via QR | Merchant scans QR token; server performs atomic validation and single-redemption debit. |
| **AT-13** | Volunteer triggers safety alert offline | App stores event in local queue and clearly displays "Undelivered - pending connection" until server ACK. |
| **AT-14** | Production recovery drill | Encrypted off-server backup and WAL replay executed successfully; ledger balances verified. |

---

## 12. Engineering standards & change-control

1. **Baseline Inviolability:** This PRD v2.0 is the sole authoritative functional reference. All 107 baseline decisions and amendments ITB-001 through ITB-012 are binding.
2. **Strict Multi-Tenant Query Boundaries:** No API endpoint may return or mutate organization data without verifying tenant context from the authenticated user's active membership claim.
3. **Ledger Immutability:** The `time_credit_ledger` and `audit_events` tables are append-only. No `UPDATE` or `DELETE` grants shall exist for application roles.
4. **Solo Developer Pragmatism:** Code structure prioritizes clarity, explicit typing, robust migrations with rollback scripts, and automated CI verification to ensure maintainability by a single developer.

---
**End of PRD v2.0.**
