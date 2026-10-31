# Indian Time Bank — Milestone 3 Architecture Specification

**Document Version:** 1.0.0  
**Status:** Under Architectural Review  
**Author:** Senior Backend Architect  
**Traceability Baseline:** PRD v2.0 (17 Oct 2026), Architecture ADR-001 to ADR-006, Decisions D#1–D#107, Amendments
ITB-001–ITB-012

---

## 1. Executive Summary & Context

Milestone 3 establishes the **Core Service Engine** for the Indian Time Bank platform. Building on Milestone 1
(Foundation & Audit Logging) and Milestone 2 (Multi-Tenant Governance, Global Verified Identity, and Organization
Memberships), Milestone 3 introduces the capability for citizens to request, match, schedule, and assign practical
community assistance across participating municipal corporations and municipalities.

### 1.1 Inviolate Principles Preserved

1. **Central Governance & Local Autonomy (ITB-002, ITB-010, D#10):** Master service definitions are governed centrally
   by Super Admin, while organizations independently activate services, set headcount rules, and propose new additions.
2. **One Identity, Tenant-Scoped Roles (ITB-004, ITB-006, D#39):** A citizen has a single national human identity, but
   operational requests, volunteer assignments, and skills are scoped strictly to the organization tenant.
3. **Free Assistance for Beneficiaries (D#6, BR-02):** Approved beneficiaries receive eligible assistance free; no
   credits are debited or required from beneficiaries.
4. **Mandatory Manual Location (D#59, FR-SVC-02):** Geolocation is never silently derived from a residential profile;
   each request requires an explicitly entered service address.
5. **Immediate Candidate Dispatch (D#60, D#61):** Both immediate and future-scheduled requests start matching candidate
   volunteers immediately upon submission.
6. **Voluntary Acceptance & Reliability (D#12, D#29):** Volunteers accept or decline tasks on a flexible
   request-by-request basis with zero compulsory shifts.
7. **Multi-Volunteer Headcounts & Team Readiness (D#64, D#66):** Catalogue items declare minimum safe and preferred
   volunteer headcounts.
8. **Future Decoupling (ITB-008, D#14, D#27):** Timers, verifications, universal ledger postings, and loyalty coins are
   given clean schema extension points without coupling Milestone 3 logic directly to unbuilt Milestone 4/5/6 modules.

---

## 2. Domain Entities & Database Schema

The domain is partitioned into two distinct schema boundaries: **Global Core** (central catalogue) and **Organization
Tenant** (local activation, requests, and volunteer assignments).

```
┌────────────────────────────────────────────────────────────────────────┐
│                        GLOBAL CORE DOMAIN                              │
│                                                                        │
│   ┌───────────────────────────┐         ┌──────────────────────────┐   │
│   │     service_categories    │◀───────┤ global_service_definitions│   │
│   └───────────────────────────┘         └────────────┬─────────────┘   │
└──────────────────────────────────────────────────────┼─────────────────┘
                                                       │ 1
                                                       │
                                                       │ *
┌──────────────────────────────────────────────────────┼─────────────────┐
│                     ORGANIZATION TENANT DOMAIN       ▼                 │
│  ┌───────────────────────────────┐     ┌────────────────────────────┐  │
│  │ organization_service_proposals│     │organization_service_catalog│  │
│  └───────────────────────────────┘     └─────────────┬──────────────┘  │
│                                                      │ 1               │
│  ┌───────────────────────────────┐                   │                 │
│  │   beneficiary_eligibilities   │                   │                 │
│  └───────────────┬───────────────┘                   │                 │
│                  │ 1                                 │                 │
│  ┌───────────────▼───────────────┐                   │                 │
│  │    caregiver_authorizations   │                   │                 │
│  └───────────────┬───────────────┘                   │                 │
│                  │ 0..1                              │ *               │
│                  │                     ┌─────────────▼──────────────┐  │
│                  └────────────────────▶│      service_requests      │  │
│                                        └─────────────┬──────────────┘  │
│                                                      │ 1               │
│  ┌───────────────────────────────┐                   │                 │
│  │       volunteer_skills        │                   │                 │
│  └───────────────────────────────┘                   │                 │
│                                                      │ *               │
│  ┌───────────────────────────────┐     ┌─────────────▼──────────────┐  │
│  │   volunteer_availabilities    │     │    volunteer_assignments   │  │
│  └───────────────────────────────┘     └─────────────┬──────────────┘  │
│                                                      │ 1               │
│                                        ┌─────────────▼──────────────┐  │
│                                        │   assignment_status_logs   │  │
│                                        └────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Global Domain Entities

#### 1. `ServiceCategory` (`service_categories`)

Represents the top-level standardized taxonomy for volunteer services nationwide.

- `id`: UUID (Primary Key, default: `gen_random_uuid()`)
- `code`: VARCHAR(50) (Unique, e.g. `ELDER_CARE`, `ASSISTED_MOBILITY`, `HOME_MAINTENANCE`, `DIGITAL_LITERACY`,
  `READING_ASSISTANCE`, `COMMUNITY_ENVIRONMENT`)
- `name_en`: VARCHAR(100) (English display name)
- `name_ml`: VARCHAR(100) (Malayalam display name, D#50)
- `description_en`: TEXT
- `description_ml`: TEXT
- `icon_key`: VARCHAR(100) (Asset identifier for mobile/web apps)
- `is_active`: BOOLEAN (Default: `true`)
- `display_order`: INT (Default: `0`)
- `created_at`: TIMESTAMPTZ (Default: `NOW()`)
- `updated_at`: TIMESTAMPTZ (Default: `NOW()`)

#### 2. `GlobalServiceDefinition` (`global_service_definitions`)

Canonical catalogue items standardized nationwide by the Super Admin.

- `id`: UUID (Primary Key)
- `category_id`: UUID (Foreign Key -> `service_categories.id`, ON DELETE RESTRICT)
- `code`: VARCHAR(60) (Unique, e.g. `HOSPITAL_ACCOMPANIMENT`, `GROCERY_MEDICINE_PICKUP`, `HOME_SAFETY_REPAIR`,
  `WHEELCHAIR_ASSISTANCE`, `TECH_ASSISTANCE_SENIOR`)
- `name_en`: VARCHAR(150)
- `name_ml`: VARCHAR(150)
- `description_en`: TEXT
- `description_ml`: TEXT
- `default_min_volunteers`: INT (Default: `1`, Minimum safe headcount, D#64)
- `default_preferred_volunteers`: INT (Default: `1`, Preferred headcount, D#64)
- `is_hazardous_physical`: BOOLEAN (Default: `false`, Trigger for BR-07 mid-service cessation)
- `requires_skills`: BOOLEAN (Default: `false`, e.g. First Aid, Electrician certification)
- `required_skill_codes`: JSONB (Default: `'[]'`, Array of skill identifiers)
- `is_emergency_prohibited`: BOOLEAN (Default: `true`, Disclaimers against acute medical dispatch, D#26)
- `is_active`: BOOLEAN (Default: `true`)
- `created_by`: UUID (Foreign Key -> `users.id`)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

---

### 2.2 Organization Tenant Entities

#### 3. `OrganizationServiceCatalogue` (`organization_service_catalog`)

Local organization enablement and parameterization of global service items.

- `id`: UUID (Primary Key)
- `organization_id`: UUID (Foreign Key -> `organizations.id`, ON DELETE RESTRICT)
- `global_service_id`: UUID (Foreign Key -> `global_service_definitions.id`, ON DELETE RESTRICT)
- `custom_label_en`: VARCHAR(150) (Optional localized title override)
- `custom_label_ml`: VARCHAR(150) (Optional localized title override)
- `is_enabled`: BOOLEAN (Default: `true`, Local activation toggle, D#10)
- `min_volunteers`: INT (Tenant-specific minimum headcount, >= `global_service.default_min_volunteers`)
- `preferred_volunteers`: INT (Tenant-specific preferred headcount, >= `min_volunteers`)
- `requires_coordinator_dispatch`: BOOLEAN (Default: `false`, Sensitive services requiring manual review, D#7)
- `local_instructions_en`: TEXT (Specific instructions, e.g. parking or check-in rules)
- `local_instructions_ml`: TEXT
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ
- _Constraints:_ UNIQUE (`organization_id`, `global_service_id`), CHECK (`min_volunteers` >= 1), CHECK
  (`preferred_volunteers` >= `min_volunteers`)

#### 4. `OrganizationServiceProposal` (`organization_service_proposals`)

Municipal proposals submitted to Super Admin to establish new standard services.

- `id`: UUID (Primary Key)
- `organization_id`: UUID (Foreign Key -> `organizations.id`)
- `proposed_by_user_id`: UUID (Foreign Key -> `users.id`, Coordinator or Admin)
- `proposed_name`: VARCHAR(150)
- `category_id`: UUID (Foreign Key -> `service_categories.id`)
- `description`: TEXT
- `justification`: TEXT
- `suggested_min_volunteers`: INT (Default: `1`)
- `is_hazardous_physical`: BOOLEAN (Default: `false`)
- `status`: VARCHAR(30) (Enum: `PENDING_REVIEW`, `APPROVED`, `REJECTED`, Default: `PENDING_REVIEW`)
- `reviewed_by_user_id`: UUID (Foreign Key -> `users.id`, Nullable, Super Admin)
- `reviewed_at`: TIMESTAMPTZ (Nullable)
- `rejection_reason`: TEXT (Nullable)
- `resulting_global_service_id`: UUID (Foreign Key -> `global_service_definitions.id`, Nullable)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ

#### 5. `BeneficiaryEligibility` (`beneficiary_eligibilities`)

Local organization tracking of verified beneficiary status, review schedules, and quotas.

- `id`: UUID (Primary Key)
- `organization_id`: UUID (Foreign Key -> `organizations.id`, ON DELETE RESTRICT)
- `membership_id`: UUID (Foreign Key -> `organization_memberships.id`, ON DELETE RESTRICT)
- `eligibility_type`: VARCHAR(30) (Enum: `ONGOING`, `TEMPORARY`, D#25)
- `status`: VARCHAR(30) (Enum: `ACTIVE`, `PENDING_REVIEW`, `EXPIRED`, `SUSPENDED`, Default: `ACTIVE`)
- `approved_assistance_categories`: JSONB (Default: `'["*"]'`, List of allowed category IDs)
- `review_due_at`: TIMESTAMPTZ (Mandatory review date, D#25)
- `approved_by_user_id`: UUID (Foreign Key -> `users.id`, Coordinator/Admin)
- `approved_at`: TIMESTAMPTZ (Default: `NOW()`)
- `monthly_request_quota`: INT (Default: `8`, Central frequency limit, D#26)
- `quota_override_reason`: TEXT (Nullable, Coordinator justification)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ
- _Constraints:_ UNIQUE (`organization_id`, `membership_id`)

#### 6. `CaregiverAuthorization` (`caregiver_authorizations`)

Explicit, revocable beneficiary authorization allowing a caregiver to act on their behalf.

- `id`: UUID (Primary Key)
- `organization_id`: UUID (Foreign Key -> `organizations.id`, ON DELETE RESTRICT)
- `beneficiary_membership_id`: UUID (Foreign Key -> `organization_memberships.id`, ON DELETE RESTRICT)
- `caregiver_membership_id`: UUID (Foreign Key -> `organization_memberships.id`, ON DELETE RESTRICT)
- `relationship_type`: VARCHAR(50) (Enum: `FAMILY_CHILD`, `FAMILY_SPOUSE`, `LEGAL_GUARDIAN`, `COMMUNITY_REPRESENTATIVE`,
  `OTHER`)
- `status`: VARCHAR(30) (Enum: `PENDING_REVIEW`, `APPROVED`, `REVOKED`, Default: `PENDING_REVIEW`)
- `authorization_document_id`: UUID (Foreign Key -> `membership_documents.id`, Nullable)
- `can_initiate_requests`: BOOLEAN (Default: `true`, D#8)
- `can_verify_completions`: BOOLEAN (Default: `true`, D#5, D#27)
- `approved_by_user_id`: UUID (Foreign Key -> `users.id`, Coordinator)
- `approved_at`: TIMESTAMPTZ (Nullable)
- `revoked_at`: TIMESTAMPTZ (Nullable)
- `revoked_by_user_id`: UUID (Foreign Key -> `users.id`, Beneficiary or Coordinator)
- `revocation_reason`: TEXT (Nullable)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ
- _Constraints:_ UNIQUE (`organization_id`, `beneficiary_membership_id`, `caregiver_membership_id`)

#### 7. `ServiceRequest` (`service_requests`)

The central transaction entity representing an assistance booking.

- `id`: UUID (Primary Key)
- `organization_id`: UUID (Foreign Key -> `organizations.id`, ON DELETE RESTRICT)
- `request_number`: VARCHAR(50) (Unique human-readable reference, e.g. `REQ-KZK-202610-00042`)
- `beneficiary_membership_id`: UUID (Foreign Key -> `organization_memberships.id`, ON DELETE RESTRICT)
- `service_catalog_id`: UUID (Foreign Key -> `organization_service_catalog.id`, ON DELETE RESTRICT)
- `created_by_user_id`: UUID (Foreign Key -> `users.id`, Calling user)
- `creation_channel`: VARCHAR(30) (Enum: `DIRECT_BENEFICIARY`, `CAREGIVER_PROXY`, `COORDINATOR_ON_BEHALF`)
- `caregiver_authorization_id`: UUID (Foreign Key -> `caregiver_authorizations.id`, Nullable)
- `urgency`: VARCHAR(20) (Enum: `IMMEDIATE`, `SCHEDULED`, D#60)
- `status`: VARCHAR(30) (Enum: `DRAFT`, `MATCHING_ACTIVE`, `PARTIALLY_ACCEPTED`, `FULLY_MATCHED`, `IN_PROGRESS`,
  `COMPLETED`, `CANCELLED`, `RESCHEDULED`, `EXPIRED_UNMATCHED`, `ESCALATED_TO_COORDINATOR`)
- `scheduled_start_time`: TIMESTAMPTZ (Mandatory; for immediate requests, defaults to `NOW()`)
- `expected_duration_minutes`: INT (Default: `60`, Validated: 15 to 480 minutes)
- `min_volunteers`: INT (Copied from catalogue at creation; immutable once active)
- `preferred_volunteers`: INT
- `location_address_text`: TEXT (Mandatory manually entered address, D#59)
- `location_ward_number`: VARCHAR(20) (Civic ward)
- `location_landmark`: VARCHAR(255) (Optional landmark)
- `location_postal_code`: VARCHAR(10) (Indian 6-digit PIN code)
- `location_lat`: NUMERIC(10, 7) (Optional geocoded / transient GPS pin, D#58)
- `location_lng`: NUMERIC(10, 7)
- `beneficiary_notes`: TEXT (Instructions or access details)
- `matching_radius_km`: NUMERIC(4, 1) (Current expansion radius, e.g. 3.0, 7.0, 15.0, D#13)
- `matching_tier`: INT (Default: `1`, Current radius tier: 1, 2, 3)
- `escalated_at`: TIMESTAMPTZ (Nullable, timestamp when escalated to coordinator)
- `assigned_coordinator_id`: UUID (Foreign Key -> `users.id`, Nullable)
- `allows_cross_org_volunteers`: BOOLEAN (Default: `false`, ITB-006 cross-org toggle)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ
- _Constraints:_ UNIQUE (`organization_id`, `request_number`), CHECK (`min_volunteers` >= 1), CHECK
  (`preferred_volunteers` >= `min_volunteers`)

#### 8. `VolunteerSkill` (`volunteer_skills`)

Tracks coordinator-verified skill credentials for specialized volunteer tasks.

- `id`: UUID (Primary Key)
- `organization_id`: UUID (Foreign Key -> `organizations.id`, ON DELETE RESTRICT)
- `membership_id`: UUID (Foreign Key -> `organization_memberships.id`, ON DELETE RESTRICT)
- `skill_code`: VARCHAR(50) (e.g. `FIRST_AID`, `FOUR_WHEELER_LICENSE`, `ELECTRICIAN_BASIC`, `SIGN_LANGUAGE`)
- `status`: VARCHAR(30) (Enum: `PENDING_VERIFICATION`, `VERIFIED`, `REJECTED`, Default: `PENDING_VERIFICATION`, D#11)
- `verification_notes`: TEXT
- `verified_by_user_id`: UUID (Foreign Key -> `users.id`, Nullable, Coordinator)
- `verified_at`: TIMESTAMPTZ (Nullable)
- `document_id`: UUID (Foreign Key -> `membership_documents.id`, Nullable)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ
- _Constraints:_ UNIQUE (`membership_id`, `skill_code`)

#### 9. `VolunteerAvailability` (`volunteer_availabilities`)

Preferences for geographic matching and notifications.

- `id`: UUID (Primary Key)
- `organization_id`: UUID (Foreign Key -> `organizations.id`, ON DELETE RESTRICT)
- `membership_id`: UUID (Foreign Key -> `organization_memberships.id`, ON DELETE RESTRICT)
- `is_available_immediate`: BOOLEAN (Default: `true`, Willing to receive immediate alerts)
- `max_travel_radius_km`: NUMERIC(4, 1) (Default: `5.0`, Max search radius from base)
- `preferred_ward_numbers`: JSONB (Default: `'[]'`, Wards of primary interest)
- `transient_lat`: NUMERIC(10, 7) (Nullable, transient GPS for active volunteer sessions, D#58)
- `transient_lng`: NUMERIC(10, 7) (Nullable)
- `transient_updated_at`: TIMESTAMPTZ (Nullable)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ
- _Constraints:_ UNIQUE (`organization_id`, `membership_id`)

#### 10. `VolunteerAssignment` (`volunteer_assignments`)

Represents an individual volunteer's allocation to a request position.

- `id`: UUID (Primary Key)
- `organization_id`: UUID (Foreign Key -> `organizations.id`, ON DELETE RESTRICT)
- `service_request_id`: UUID (Foreign Key -> `service_requests.id`, ON DELETE CASCADE)
- `volunteer_membership_id`: UUID (Foreign Key -> `organization_memberships.id`, ON DELETE RESTRICT)
- `slot_number`: INT (1 up to `preferred_volunteers`)
- `status`: VARCHAR(30) (Enum: `OFFERED`, `ACCEPTED`, `DECLINED`, `TIMED_OUT`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`,
  `WITHDRAWN`, `REPLACED`)
- `offered_at`: TIMESTAMPTZ (Default: `NOW()`)
- `offer_expires_at`: TIMESTAMPTZ (Deadline to accept, e.g. 15m for IMMEDIATE, 4h for SCHEDULED)
- `accepted_at`: TIMESTAMPTZ (Nullable)
- `declined_at`: TIMESTAMPTZ (Nullable)
- `decline_reason`: TEXT (Nullable)
- `withdrawn_at`: TIMESTAMPTZ (Nullable, volunteer stepped down before service, D#31)
- `withdrawal_reason`: TEXT (Nullable)
- `replaced_by_assignment_id`: UUID (Foreign Key -> `volunteer_assignments.id`, Nullable, D#31, D#33)
- `assigned_by_coordinator_id`: UUID (Foreign Key -> `users.id`, Nullable, if manually dispatched)
- `created_at`: TIMESTAMPTZ
- `updated_at`: TIMESTAMPTZ
- _Constraints:_ UNIQUE (`service_request_id`, `volunteer_membership_id`) WHERE `status` IN ('OFFERED', 'ACCEPTED',
  'IN_PROGRESS')

#### 11. `RequestCancellation` (`request_cancellations`)

Detailed audit and tracking for request cancellations and coordinator reliability reviews.

- `id`: UUID (Primary Key)
- `organization_id`: UUID (Foreign Key -> `organizations.id`)
- `service_request_id`: UUID (Foreign Key -> `service_requests.id`, ON DELETE CASCADE)
- `cancelled_by_user_id`: UUID (Foreign Key -> `users.id`)
- `canceller_role`: VARCHAR(30) (Enum: `BENEFICIARY`, `CAREGIVER`, `COORDINATOR`, `SYSTEM`)
- `reason_code`: VARCHAR(50) (e.g. `BENEFICIARY_UNWELL`, `SCHEDULE_CONFLICT`, `NO_VOLUNTEER_MATCHED`,
  `DUPLICATE_REQUEST`, `OTHER`)
- `notes`: TEXT
- `cancelled_at`: TIMESTAMPTZ (Default: `NOW()`)
- `hours_before_start`: NUMERIC(5, 2) (Computed delta for reliability scoring, D#29, D#62)

#### 12. `RequestRescheduleHistory` (`request_reschedules`)

Tracks changes to scheduled booking times.

- `id`: UUID (Primary Key)
- `organization_id`: UUID (Foreign Key -> `organizations.id`)
- `service_request_id`: UUID (Foreign Key -> `service_requests.id`, ON DELETE CASCADE)
- `rescheduled_by_user_id`: UUID (Foreign Key -> `users.id`)
- `previous_start_time`: TIMESTAMPTZ
- `new_start_time`: TIMESTAMPTZ
- `reason`: TEXT
- `created_at`: TIMESTAMPTZ (Default: `NOW()`)

---

## 3. Database Constraints, Indices & Migration Strategy

### 3.1 Migration File: `1729118400003-ServiceCatalogueAndRequests.ts`

Migration 0003 builds sequentially upon `1729118400001-Foundation` and `1729118400002-IdentityAndOrganizations`.

```
Execution Order:
1. CREATE TABLE service_categories
2. CREATE TABLE global_service_definitions
3. CREATE TABLE organization_service_catalog
4. CREATE TABLE organization_service_proposals
5. CREATE TABLE beneficiary_eligibilities
6. CREATE TABLE caregiver_authorizations
7. CREATE TABLE volunteer_skills
8. CREATE TABLE volunteer_availabilities
9. CREATE TABLE service_requests
10. CREATE TABLE volunteer_assignments
11. CREATE TABLE request_cancellations
12. CREATE TABLE request_reschedules
13. CREATE INDEXES and FOREIGN KEYS
```

### 3.2 Performance Indices & Integrity Constraints

1. **Tenant Isolation Indices (NFR-03):** Every organization table contains a composite index starting with
   `organization_id`:
   - `CREATE INDEX "idx_service_requests_org_status" ON "service_requests" ("organization_id", "status");`
   - `CREATE INDEX "idx_volunteer_assignments_org_status" ON "volunteer_assignments" ("organization_id", "status");`
   - `CREATE INDEX "idx_volunteer_skills_org_code" ON "volunteer_skills" ("organization_id", "skill_code", "status");`
2. **Matching Lookup Indices:**
   - `CREATE INDEX "idx_service_requests_matching" ON "service_requests" ("status", "scheduled_start_time", "urgency") WHERE "status" IN ('MATCHING_ACTIVE', 'PARTIALLY_ACCEPTED');`
   - `CREATE INDEX "idx_volunteer_assignments_lookup" ON "volunteer_assignments" ("volunteer_membership_id", "status");`
3. **Optimistic Locking / Concurrency:**
   - In PostgreSQL, slot capacity updates and offers use a row-level lock on `service_requests`:
     `SELECT id, min_volunteers, preferred_volunteers FROM service_requests WHERE id = $1 FOR UPDATE;`
   - Partial unique index prevents duplicate active offers:
     ```sql
     CREATE UNIQUE INDEX "uq_active_volunteer_assignment"
       ON "volunteer_assignments" ("service_request_id", "volunteer_membership_id")
       WHERE "status" IN ('OFFERED', 'ACCEPTED', 'IN_PROGRESS');
     ```

---

## 4. State Machines & Lifecycle Transitions

### 4.1 Service Request State Machine

```
                              ┌───────────────────┐
                              │       DRAFT       │
                              └─────────┬─────────┘
                                        │ Beneficiary / Caregiver / Coordinator Submits
                                        ▼
                      ┌───────────────────────────────────┐
       ┌─────────────▶│          MATCHING_ACTIVE          │◀──────────────┐
       │              └─────┬───────────────────────┬─────┘               │
       │                    │                       │                     │
       │ Offer Accepted     │ Timeout / Exhaustion  │ All Slots Filled    │ Volunteer Withdraws
       │ (Slots < Min)      │                       │ (Count >= Min)      │ (Count Drops)
       │                    ▼                       ▼                     │
┌──────┴───────────────┐ ┌────────────────────┐ ┌────────────────────┐    │
│  PARTIALLY_ACCEPTED  │ │    ESCALATED_TO_   │ │   FULLY_MATCHED    ├────┘
└──────────────────────┘ │    COORDINATOR     │ └─────────┬──────────┘
                         └──────────┬─────────┘           │
                                    │ Coordinator Assigns │ Min Volunteers On-Site
                                    └────────────────────▶│ (Milestone 4 Start)
                                                          ▼
                                                ┌────────────────────┐
                                                │    IN_PROGRESS     │
                                                └─────────┬──────────┘
                                                          │ Verified
                                                          ▼
                                                ┌────────────────────┐
                                                │     COMPLETED      │
                                                └────────────────────┘

[Terminal & Exception States reachable from MATCHING / MATCHED / ESCALATED]:
 ├── CANCELLED (By Requester or Coordinator; logs hours_before_start)
 ├── RESCHEDULED (Start time shifted; existing assignments reset/rematched)
 └── EXPIRED_UNMATCHED (Start time passed with zero matches and no coordinator intervention)
```

### 4.2 State Transition Matrix: `ServiceRequest`

| Source State                             | Target State               | Triggering Action      | Allowed Actor                       | Validation Rules                                                   |
| ---------------------------------------- | -------------------------- | ---------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| `DRAFT`                                  | `MATCHING_ACTIVE`          | `SUBMIT_REQUEST`       | Beneficiary, Caregiver, Coordinator | Quotas checked; manual location required; urgency set              |
| `MATCHING_ACTIVE`                        | `PARTIALLY_ACCEPTED`       | `VOLUNTEER_ACCEPTED`   | Volunteer (via offer)               | Accepted count > 0 but < `min_volunteers`                          |
| `MATCHING_ACTIVE` / `PARTIALLY_ACCEPTED` | `FULLY_MATCHED`            | `VOLUNTEER_ACCEPTED`   | Volunteer (via offer)               | Accepted count >= `min_volunteers` (and <= `preferred_volunteers`) |
| `MATCHING_ACTIVE`                        | `ESCALATED_TO_COORDINATOR` | `EXPANSION_EXHAUSTED`  | System / Matching Engine            | Radius tier reaches max (Tier 3) without required acceptances      |
| `ESCALATED_TO_COORDINATOR`               | `FULLY_MATCHED`            | `COORDINATOR_DISPATCH` | Coordinator                         | Coordinator manually assigns verified volunteers                   |
| `FULLY_MATCHED`                          | `PARTIALLY_ACCEPTED`       | `VOLUNTEER_WITHDRAWN`  | Volunteer / Coordinator             | Volunteer withdraws; remaining count < `min_volunteers`            |
| Any pre-progress state                   | `CANCELLED`                | `CANCEL_REQUEST`       | Requester, Caregiver, Coordinator   | Writes to `request_cancellations`                                  |
| Any pre-progress state                   | `RESCHEDULED`              | `RESCHEDULE_REQUEST`   | Requester, Caregiver, Coordinator   | Shifts `scheduled_start_time`; writes history                      |
| `MATCHING_ACTIVE`                        | `EXPIRED_UNMATCHED`        | `SCHEDULE_LAPSED`      | System (Cron/Worker)                | Current time exceeds `scheduled_start_time` + grace period         |

### 4.3 Volunteer Assignment State Machine

```
              ┌───────────────┐
              │    OFFERED    │
              └───┬───────┬───┘
   Timeout / Auto │       │ Volunteer Accepts
   Expire         │       ▼
   ┌──────────────┼─▶┌──────────────┐
   │              │  │   ACCEPTED   ├───────────────────────────────┐
   │              │  └───┬──────────┘                               │
   │              │      │ Service Begins                           │ Volunteer Withdraws
   │              ▼      ▼                                          ▼
┌──┴────────┐  ┌───────────────┐ ┌───────────────┐          ┌───────────────┐
│ TIMED_OUT │  │    DECLINED   │ │  IN_PROGRESS  │          │   WITHDRAWN   │
└───────────┘  └───────────────┘ └───────┬───────┘          └───────┬───────┘
                                         │ Service Complete         │ Replaced by another
                                         ▼                          ▼
                                 ┌───────────────┐          ┌───────────────┐
                                 │   COMPLETED   │          │   REPLACED    │
                                 └───────────────┘          └───────────────┘
```

---

## 5. Permission & Multi-Tenant Authorization Matrix

Following ADR-003, ITB-006, and NFR-09, every request passes through the NestJS guard sequence: `AuthGuard` (JWT
validity) -> `OrganizationAccessGuard` (checks tenant membership) -> `RolesGuard` (checks scoped role grants).

| API Operation / Route                                    |  Super Admin  | Municipality Admin |    Coordinator     |    Volunteer    |  Beneficiary   |    Caregiver    |
| -------------------------------------------------------- | :-----------: | :----------------: | :----------------: | :-------------: | :------------: | :-------------: |
| `GET /catalogue/global` (Global catalogue)               |     Full      |        Read        |        Read        |      Read       |      Read      |      Read       |
| `POST /catalogue/global` (Create master service)         |     Full      |       Denied       |       Denied       |     Denied      |     Denied     |     Denied      |
| `PATCH /catalogue/global/:id` (Update service)           |     Full      |       Denied       |       Denied       |     Denied      |     Denied     |     Denied      |
| `POST /orgs/:id/catalogue/proposals` (Propose)           |     Full      |       Create       |       Create       |     Denied      |     Denied     |     Denied      |
| `PATCH /orgs/:id/catalogue/proposals/:pId`               | Full (Review) |       Denied       |       Denied       |     Denied      |     Denied     |     Denied      |
| `POST /orgs/:id/catalogue/enable` (Toggle)               |     Full      |       Manage       |       Manage       |     Denied      |     Denied     |     Denied      |
| `POST /orgs/:id/requests` (Create request)               |     Full      |       Create       | Create (On-Behalf) |     Denied      | Create (Self)  | Create (Proxy)  |
| `GET /orgs/:id/requests` (List requests)                 |   Cross-Org   |      Org-Wide      |      Org-Wide      | Assigned/Nearby |   Self-Only    | Authorized Only |
| `GET /orgs/:id/requests/:rId` (Request detail)           |     Full      |        Full        |        Full        |   If Assigned   | If Own Request |  If Authorized  |
| `POST /orgs/:id/requests/:rId/cancel`                    |     Full      |        Full        |        Full        |     Denied      | If Own Request |  If Authorized  |
| `POST /orgs/:id/requests/:rId/reschedule`                |     Full      |        Full        |        Full        |     Denied      | If Own Request |  If Authorized  |
| `POST /orgs/:id/requests/:rId/offers/:aId/accept`        |    Denied     |       Denied       |       Denied       |   Accept Own    |     Denied     |     Denied      |
| `POST /orgs/:id/requests/:rId/offers/:aId/decline`       |    Denied     |       Denied       |       Denied       |   Decline Own   |     Denied     |     Denied      |
| `POST /orgs/:id/requests/:rId/assignments/:aId/withdraw` |     Full      |        Full        |        Full        |  Withdraw Own   |     Denied     |     Denied      |
| `POST /orgs/:id/requests/:rId/dispatch` (Manual)         |     Full      |        Full        |        Full        |     Denied      |     Denied     |     Denied      |
| `POST /orgs/:id/caregivers/authorize`                    |     Full      |        Full        |      Approve       |     Denied      |   Authorize    |     Denied      |
| `POST /orgs/:id/volunteers/skills/verify`                |     Full      |        Full        |        Full        |     Denied      |     Denied     |     Denied      |

---

## 6. API Specifications & Data Transfer Objects (DTOs)

### 6.1 Catalogue & Proposal Endpoints

#### `POST /api/v1/catalogue/global` (Super Admin Only)

Creates a canonical global service definition.

```typescript
export class CreateGlobalServiceDefinitionDto {
  @IsUUID()
  @IsNotEmpty()
  categoryId!: string;

  @IsString()
  @Length(3, 60)
  @Matches(/^[A-Z0-9_]+$/, { message: 'Code must be uppercase alphanumeric snake_case' })
  code!: string;

  @IsString()
  @Length(3, 150)
  nameEn!: string;

  @IsString()
  @Length(3, 150)
  nameMl!: string;

  @IsString()
  descriptionEn!: string;

  @IsString()
  descriptionMl!: string;

  @IsInt()
  @Min(1)
  defaultMinVolunteers!: number;

  @IsInt()
  @Min(1)
  defaultPreferredVolunteers!: number;

  @IsBoolean()
  isHazardousPhysical!: boolean;

  @IsBoolean()
  requiresSkills!: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  requiredSkillCodes?: string[];
}
```

#### `POST /api/v1/organizations/:orgId/catalogue/enable` (Coordinator / Municipality Admin)

Enables or reconfigures a global service within an organization.

```typescript
export class ConfigureOrgCatalogueItemDto {
  @IsUUID()
  globalServiceId!: string;

  @IsBoolean()
  isEnabled!: boolean;

  @IsInt()
  @Min(1)
  minVolunteers!: number;

  @IsInt()
  @Min(1)
  preferredVolunteers!: number;

  @IsBoolean()
  @IsOptional()
  requiresCoordinatorDispatch?: boolean;

  @IsString()
  @IsOptional()
  customLabelEn?: string;

  @IsString()
  @IsOptional()
  customLabelMl?: string;

  @IsString()
  @IsOptional()
  localInstructionsEn?: string;

  @IsString()
  @IsOptional()
  localInstructionsMl?: string;
}
```

#### `POST /api/v1/organizations/:orgId/catalogue/proposals` (Coordinator / Municipality Admin)

Submits a municipal service proposal to Super Admin.

```typescript
export class CreateOrgServiceProposalDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @Length(3, 150)
  proposedName!: string;

  @IsString()
  description!: string;

  @IsString()
  justification!: string;

  @IsInt()
  @Min(1)
  suggestedMinVolunteers!: number;

  @IsBoolean()
  isHazardousPhysical!: boolean;
}
```

---

### 6.2 Service Request Endpoints

#### `POST /api/v1/organizations/:orgId/requests`

Submits a new assistance request (Beneficiary, Caregiver, or Coordinator).

```typescript
export class CreateServiceRequestDto {
  @IsUUID()
  serviceCatalogId!: string;

  @IsUUID()
  @IsOptional()
  beneficiaryMembershipId?: string; // Mandatory if submitted by Caregiver or Coordinator

  @IsUUID()
  @IsOptional()
  caregiverAuthorizationId?: string; // Mandatory if creationChannel is CAREGIVER_PROXY

  @IsEnum(UrgencyType)
  urgency!: UrgencyType; // IMMEDIATE | SCHEDULED

  @IsISO8601()
  scheduledStartTime!: string; // Current ISO time if IMMEDIATE; future date if SCHEDULED

  @IsInt()
  @Min(15)
  @Max(480)
  expectedDurationMinutes!: number;

  // Mandatory Manual Location Fields (D#59, FR-SVC-02)
  @IsString()
  @Length(5, 500)
  locationAddressText!: string;

  @IsString()
  @Length(1, 20)
  locationWardNumber!: string;

  @IsString()
  @IsOptional()
  locationLandmark?: string;

  @IsString()
  @Matches(/^[1-9][0-9]{5}$/, { message: 'Must be a valid 6-digit Indian PIN code' })
  locationPostalCode!: string;

  @IsNumber()
  @Min(8.0)
  @Max(38.0) // Valid Indian latitude range
  @IsOptional()
  locationLat?: number;

  @IsNumber()
  @Min(68.0)
  @Max(98.0) // Valid Indian longitude range
  @IsOptional()
  locationLng?: number;

  @IsString()
  @IsOptional()
  beneficiaryNotes?: string;

  @IsBoolean()
  @IsOptional()
  allowsCrossOrgVolunteers?: boolean;
}
```

#### `POST /api/v1/organizations/:orgId/requests/:requestId/cancel`

Cancels an active request.

```typescript
export class CancelServiceRequestDto {
  @IsString()
  @Length(3, 50)
  reasonCode!: string; // e.g. BENEFICIARY_UNWELL, SCHEDULE_CONFLICT, NO_LONGER_NEEDED

  @IsString()
  @Length(3, 500)
  notes!: string;
}
```

#### `POST /api/v1/organizations/:orgId/requests/:requestId/reschedule`

Reschedules an active or unfilled request.

```typescript
export class RescheduleServiceRequestDto {
  @IsISO8601()
  newStartTime!: string;

  @IsString()
  @Length(3, 500)
  reason!: string;
}
```

#### `POST /api/v1/organizations/:orgId/requests/:requestId/offers/:assignmentId/accept`

Called by a candidate volunteer to accept an offered task position.

```typescript
export class AcceptVolunteerOfferDto {
  // Client operation ID for offline retry idempotency (NFR-11)
  @IsUUID()
  clientOperationId!: string;
}
```

#### `POST /api/v1/organizations/:orgId/requests/:requestId/assignments/:assignmentId/withdraw`

Volunteer withdraws from an already accepted assignment.

```typescript
export class WithdrawVolunteerAssignmentDto {
  @IsString()
  @Length(3, 500)
  withdrawalReason!: string;
}
```

---

## 7. Matching Algorithm & Escalation Engine Design

### 7.1 Multi-Tier Proximity & Skill Matching Pipeline

Matching is triggered **immediately upon request creation** for both `IMMEDIATE` and `SCHEDULED` requests (D#60, D#61).

```
[Service Request Created]
           │
           ▼
[Filter Step 1: Membership & Account Health]
  ├── Hold approved membership in request org (ITB-005, ITB-007)
  │   (OR hold approved membership in any org if allows_cross_org_volunteers=true)
  ├── Global Account Status = ACTIVE
  └── Zero active global restrictions (D#79)
           │
           ▼
[Filter Step 2: Service & Skill Qualifications]
  ├── Service item enabled in local organization catalogue
  └── If service.requires_skills: volunteer has VERIFIED skill record for all required_skill_codes
           │
           ▼
[Filter Step 3: Availability & Conflicts]
  ├── If IMMEDIATE: volunteer.is_available_immediate = true
  └── Zero overlapping active assignments (IN_PROGRESS or ACCEPTED for overlapping time window)
           │
           ▼
[Filter Step 4: Spatial Distance (Haversine Formula)]
  ├── Target: request.location_lat, request.location_lng
  ├── Origin: volunteer.transient_lat/lng (if updated < 2h ago) ELSE verified residential address
  └── Distance d <= request.matching_radius_km
           │
           ▼
[Rank Candidates]
  ├── Priority 1: Same civic ward (location_ward_number match)
  ├── Priority 2: Closest physical distance (ascending km)
  └── Priority 3: Reliability score & active task balance
           │
           ▼
[Dispatch Offers]
  ├── Create volunteer_assignments with status = 'OFFERED'
  ├── Set offer_expires_at:
  │     - IMMEDIATE: 15 minutes
  │     - SCHEDULED: 4 hours (or start_time - 1 hour, whichever is shorter)
  └── Send push notification / SMS (D#48)
```

### 7.2 Radius Expansion & Escalation Schedule

```
Tier 1 (Initial Search):
  - Radius: 3.0 km (or same ward)
  - Duration before expansion:
      - IMMEDIATE: 15 minutes
      - SCHEDULED: 24 hours (or T - 12 hours)

Tier 2 (First Expansion):
  - Radius: 7.0 km (adjacent wards)
  - Emits: request.radius_expanded (tier: 2, radius: 7.0km)
  - Duration before next expansion:
      - IMMEDIATE: 30 minutes
      - SCHEDULED: 48 hours (or T - 4 hours)

Tier 3 (Full Municipal Expansion):
  - Radius: 15.0 km (entire municipality or corporation boundaries)
  - Emits: request.radius_expanded (tier: 3, radius: 15.0km)
  - Duration before escalation:
      - IMMEDIATE: 45 minutes from submission
      - SCHEDULED: T - 2 hours from scheduled_start_time

Tier 4 (Coordinator Escalation):
  - Status transitions to: ESCALATED_TO_COORDINATOR
  - Emits: request.escalated_to_coordinator
  - Dispatches high-priority notification to on-duty coordinator
  - Coordinator options:
      1. Direct phone call & manual volunteer dispatch (D#7, D#30)
      2. Contact beneficiary to reschedule or adjust requirements (D#62)
      3. Authorize community reserve / cross-organization drive
```

### 7.3 Concurrency & Race Condition Prevention

When multiple volunteers respond to an assignment offer simultaneously:

1. The transaction acquires a row-level lock:
   ```sql
   SELECT id, min_volunteers, preferred_volunteers, status
   FROM service_requests
   WHERE id = $1 FOR UPDATE;
   ```
2. Count currently accepted assignments:
   ```sql
   SELECT COUNT(*)::int AS accepted_count
   FROM volunteer_assignments
   WHERE service_request_id = $1 AND status = 'ACCEPTED';
   ```
3. If `accepted_count >= preferred_volunteers`:
   - Throw `ConflictException('All positions for this service have already been filled')`.
   - Update current volunteer assignment: `status = 'DECLINED'`, `decline_reason = 'SLOT_FILLED'`.
4. If `accepted_count < preferred_volunteers`:
   - Update volunteer assignment: `status = 'ACCEPTED'`, `accepted_at = NOW()`.
   - If `accepted_count + 1 >= min_volunteers`:
     - Update request status: `status = 'FULLY_MATCHED'`.
   - Else:
     - Update request status: `status = 'PARTIALLY_ACCEPTED'`.

---

## 8. Cross-Organization Participation Rules

To guarantee strict tenant isolation while enabling authorized civic cooperation:

1. **Standard Mode (Isolated):**
   - A request created in Kozhikode can only be seen and accepted by members holding approved Kozhikode memberships.
   - An API request to view or accept a Kozhikode task from a session lacking Kozhikode membership is rejected with
     `403 Forbidden` (`OrganizationAccessGuard`).
2. **Multi-Membership Citizen (ITB-005, D#40):**
   - A citizen holding approved memberships in both Kozhikode and Kottakkal can toggle active organization context.
   - When active context is Kozhikode, they receive Kozhikode offers; when switched to Kottakkal, they receive Kottakkal
     offers.
3. **Explicit Cross-Organization Drives (ITB-006, §3.1 item 6):**
   - If `allows_cross_org_volunteers = true`:
     - The matching query allows candidates whose membership is in _any_ active organization, provided their global
       identity is verified.
     - When accepted, the assignment is recorded with `organization_id` matching the hosting organization.
     - When verified (Milestone 4), the earned credits post to the volunteer's Universal Wallet with
       `originating_org_id` pointing to the hosting municipality (ITB-009).

---

## 9. Future Compatibility Hooks

Milestone 3 is designed to connect seamlessly with future milestones without requiring table rewrites or migrations that
break existing data:

| Future Milestone                                    | Requirement                                                           | Milestone 3 Architectural Hook                                                                                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Milestone 4** (Ledger & Universal Wallet)         | Service verification & atomic time credit issuance                    | `volunteer_assignments.id` is the stable anchor for `service_verifications.assignment_id`. Every request and assignment carries `organization_id` which will map directly to `time_credit_ledger.originating_org_id` (ITB-009). |
| **Milestone 4** (Service Timers)                    | Start/stop timers with manual correction                              | Entity schema reserves `volunteer_assignment_id` as the timer parent, ensuring each volunteer tracks time independently.                                                                                                        |
| **Milestone 5** (Multi-Volunteer Teams & Transfers) | Simultaneous multi-volunteer headcounts & sequential transfer rewards | `min_volunteers` and `preferred_volunteers` are established in DB. Assignment model supports sequential replacements via `replaced_by_assignment_id` (D#33, BR-06).                                                             |
| **Milestone 6** (Loyalty Coin Economy)              | Separate coin earnings & merchant offers                              | Service definitions flag hazardous/special ratings; completion events emit service codes used by the loyalty engine to calculate civic recognition coins.                                                                       |

---

## 10. PRD Ambiguities & Architectural Resolutions

During our inspection of PRD v2.0, the following ambiguities and conflicts were identified. We have established precise
architectural resolutions for review:

### Ambiguity 1: Exact Radius Expansion & Escalation Timeouts (D#7, D#13, FR-MATCH-04)

- **Problem:** PRD v2.0 mandates automatic expansion and coordinator escalation but omits fixed timer values for
  `IMMEDIATE` vs `SCHEDULED` requests.
- **Architectural Resolution:**
  - `IMMEDIATE`: Tier 1 (0–15 min, 3 km) -> Tier 2 (15–30 min, 7 km) -> Tier 3 (30–45 min, 15 km) -> Escalated to
    Coordinator at 45 min.
  - `SCHEDULED`: Tier 1 (Submission until $T - 24\text{h}$, 3 km) -> Tier 2 ($T - 24\text{h}$ to $T - 4\text{h}$, 7 km)
    -> Tier 3 ($T - 4\text{h}$ to $T - 2\text{h}$, 15 km) -> Escalated to Coordinator at $T - 2\text{h}$.
- _Status:_ Defined as default configuration in NestJS `MatchingConfigService`, overrideable per municipality.

### Ambiguity 2: Cross-Tenant Volunteer Lending Authorization (ITB-005 vs §3.1 item 6)

- **Problem:** ITB-005 & ITB-007 state that mobile app login and API access strictly require approved local membership.
  However, §3.1 item 6 allows cross-organization participation in "authorized community drives."
- **Architectural Resolution:**
  - Routine requests: Strict organization membership required (`allows_cross_org_volunteers = false`).
  - Community drives / emergency shortages: Request flags `allows_cross_org_volunteers = true`. The API authorization
    guard permits volunteers from neighboring organizations to view and accept the offer, without requiring separate
    municipal application paperwork.
- _Status:_ Implemented via `allows_cross_org_volunteers` flag and guard logic.

### Ambiguity 3: Beneficiary Quota vs. Caregiver Quota Attribution (D#26, FR-BEN-04)

- **Problem:** When an authorized caregiver submits requests on behalf of multiple beneficiaries (e.g., elderly parents
  and a disabled sibling), how are frequency limits enforced?
- **Architectural Resolution:**
  - The monthly frequency limit (e.g. 8 requests/month) is evaluated against the **Beneficiary's** eligibility record
    (`beneficiary_eligibilities.monthly_request_quota`).
  - The Caregiver is subject only to an anti-spam rate limit (max 5 submissions per hour).
- _Status:_ Attributed strictly to the beneficiary domain boundary.

### Ambiguity 4: Volunteer Cancellation Reliability Scoring (D#29, FR-SVC-04)

- **Problem:** PRD states "Progressive policy for cancellations/no-shows with incident logs, review, and warnings,"
  without defining quantitative thresholds.
- **Architectural Resolution:**
  - Withdrawals > 12 hours before start: Logged, but no penalty.
  - Late withdrawals (< 2 hours before start): Flagged as `RELIABILITY_INCIDENT`.
  - 3 late withdrawals in 30 days: Triggers automated coordinator review alert.
- _Status:_ Tracked via `RequestCancellation.hours_before_start`.

### Ambiguity 5: Boundary Between Medical Accompaniment & Prohibited Emergency Dispatch (D#26, §1.2)

- **Problem:** PRD §1.2 explicitly excludes emergency medical dispatch. However, hospital OP accompaniment and medicine
  collection are standard time bank services.
- **Architectural Resolution:**
  - Services like `HOSPITAL_ACCOMPANIMENT` and `MEDICINE_PICKUP` carry `is_emergency_prohibited = true`.
  - The UI and API enforce a mandatory disclaimer acknowledgment: _"Indian Time Bank does not provide emergency medical
    transport or acute medical care. For life-threatening emergencies, call 108 or 112."_
- _Status:_ Explicit boolean constraint and DTO validation.

---

## 11. Risks & Failure Modes

| Risk / Failure Mode                                          | Severity | Impact                                                          | Mitigation Strategy                                                                                                     |
| ------------------------------------------------------------ | :------: | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Concurrent volunteer slot exhaustion**                     |   High   | Two volunteers accept the final remaining slot simultaneously   | Row-level locking (`SELECT ... FOR UPDATE`) on `service_requests` table during acceptance; atomic count validation.     |
| **Silent location derivation**                               | Critical | Volunteer dispatched to wrong location (home instead of clinic) | Database constraint disallows empty `location_address_text`; API DTO enforces manual string entry per request (D#59).   |
| **Caregiver authorization revocation during active request** |  Medium  | Beneficiary revokes caregiver access while a request is pending | Revoking authorization cancels future proxy actions; active requests require coordinator sign-off to proceed or cancel. |
| **Unmatched immediate request abandonment**                  |   High   | Beneficiary left waiting without notice                         | Escalation engine alerts on-duty coordinator at 45 minutes; automated push/SMS update sent to beneficiary.              |
| **Stale GPS coordinates**                                    |  Medium  | Volunteer matched based on outdated location                    | Transient coordinates expire after 2 hours; matching engine falls back to verified residential address (D#58).          |

---

## 12. Traceability Register (PRD Decisions & ITB Amendments)

| Decision / Amendment | Requirement Summary                      | Milestone 3 Architectural Implementation                                         |
| -------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| **ITB-001**          | Platform title Indian Time Bank          | Standardized global naming across central catalogue tables.                      |
| **ITB-002**          | Independent municipality organizations   | Multi-tenant `organization_service_catalog` and `service_requests`.              |
| **ITB-004**          | One permanent verified identity          | `users` and `verified_identities` serve as global base actors.                   |
| **ITB-005**          | Organization membership gating           | `OrganizationAccessGuard` verifies membership before request access.             |
| **ITB-006**          | Organization-specific role grants        | Scoped roles evaluated per endpoint (`VOLUNTEER`, `COORDINATOR`, `BENEFICIARY`). |
| **ITB-007**          | Branded app tenant restriction           | Requests strictly bound to tenant slug/ID matching app build.                    |
| **ITB-008**          | Universal lifetime time-credit wallet    | Assignments record global `user_id` ready for Milestone 4 wallet credit.         |
| **ITB-009**          | Origin-organization audit reference      | `service_requests` and `volunteer_assignments` retain `organization_id`.         |
| **ITB-010**          | Central creation of organizations        | Proposals route from organizations to central Super Admin.                       |
| **D#6**              | Free assistance for beneficiaries        | Beneficiary requests consume zero credits; verified eligibility checked.         |
| **D#7, D#13**        | Proximity matching & escalation          | 4-tier matching engine: 3km -> 7km -> 15km -> Coordinator alert.                 |
| **D#8**              | Request initiators                       | Channels: `DIRECT_BENEFICIARY`, `CAREGIVER_PROXY`, `COORDINATOR_ON_BEHALF`.      |
| **D#9, D#11**        | Skills & location matching               | `volunteer_skills` verification filter; spatial proximity queries.               |
| **D#10**             | Service catalogue governance             | Global master items + tenant-specific activation and local rules.                |
| **D#12**             | Flexible volunteer acceptance            | Assignments created in `OFFERED` status; volunteers freely accept/decline.       |
| **D#24, D#25**       | Beneficiary eligibility & review         | `beneficiary_eligibilities` with review dates and ongoing/temporary tags.        |
| **D#26**             | Frequency limits & no emergency dispatch | Monthly request quota counter; acute medical emergency disclaimer.               |
| **D#29**             | Volunteer reliability tracking           | `RequestCancellation.hours_before_start` tracks late cancellations.              |
| **D#31–D#34**        | Volunteer transfer & replacement         | `replaced_by_assignment_id` models sequential transfers (BR-06).                 |
| **D#58**             | Transient GPS vs. residential            | Transient coordinates valid 2h; no persistent background tracking.               |
| **D#59**             | Mandatory manual service location        | `location_address_text` mandatory on every request; never prefilled.             |
| **D#60, D#61**       | Immediate & scheduled matching           | Candidate matching starts immediately upon submission for all requests.          |
| **D#62**             | Cancellation & rescheduling              | Full history tables (`request_cancellations`, `request_reschedules`).            |
| **D#64, D#66**       | Multi-volunteer team headcounts          | `min_volunteers` and `preferred_volunteers` defined per service.                 |

---

## 13. Acceptance Test Scenarios (Milestone 3 Quality Gate)

| Test ID      | Scenario                                           | Execution Steps                                                                      | Expected Outcome                                                                                  |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **AT-M3-01** | Super Admin creates global service definition      | Super Admin posts `HOSPITAL_ACCOMPANIMENT` to `/catalogue/global`.                   | Definition created with code, bilingual titles, and default volunteer counts; audit event logged. |
| **AT-M3-02** | Municipality Admin enables service in organization | Admin posts to `/orgs/:id/catalogue/enable` with `min_volunteers = 2`.               | Service appears in local organization catalogue with local rules; other orgs unaffected.          |
| **AT-M3-03** | Municipality proposes novel service                | Coordinator posts to `/orgs/:id/catalogue/proposals`.                                | Proposal stored in `PENDING_REVIEW`; Super Admin receives proposal in dashboard.                  |
| **AT-M3-04** | Approved beneficiary creates immediate request     | Beneficiary posts request with manual address `Taluk Hospital OP`.                   | Request created in `MATCHING_ACTIVE`; matching engine immediately dispatches candidate offers.    |
| **AT-M3-05** | Request missing manual location is rejected        | Caller attempts request submission with empty address.                               | API returns `400 Bad Request` (`locationAddressText must be a string`).                           |
| **AT-M3-06** | Caregiver creates request on behalf of beneficiary | Authorized caregiver submits request referencing valid authorization ID.             | Request accepted with `creation_channel = CAREGIVER_PROXY`; beneficiary notified.                 |
| **AT-M3-07** | Revoked caregiver attempts request creation        | Caregiver whose authorization was revoked attempts proxy submission.                 | API returns `403 Forbidden` (`Caregiver authorization is not active`).                            |
| **AT-M3-08** | Scheduled request initiates matching immediately   | Beneficiary books service 3 days in advance.                                         | Request status is `MATCHING_ACTIVE`; candidate volunteers receive offers in advance (D#61).       |
| **AT-M3-09** | Skill-dependent service matching                   | Request requires `FIRST_AID`; matching engine queries volunteers.                    | Volunteers without coordinator-verified `FIRST_AID` are excluded from candidate pool.             |
| **AT-M3-10** | Volunteer accepts offer; slot count increments     | Offered volunteer accepts assignment.                                                | Assignment becomes `ACCEPTED`; request becomes `PARTIALLY_ACCEPTED` or `FULLY_MATCHED`.           |
| **AT-M3-11** | Concurrent acceptance of final position            | Two volunteers attempt to accept the 1 remaining slot at the exact same millisecond. | First transaction succeeds (`ACCEPTED`); second transaction fails with `409 Conflict`.            |
| **AT-M3-12** | Volunteer declines offer without penalty           | Volunteer declines assignment offer.                                                 | Assignment becomes `DECLINED`; next candidate in queue is offered the position.                   |
| **AT-M3-13** | Immediate request radius expansion                 | Immediate request receives zero acceptances after 15 minutes.                        | Radius expands from 3 km to 7 km; tier 2 candidates receive offers.                               |
| **AT-M3-14** | Coordinator escalation upon timeout                | Request remains unfilled after max radius tier (45 minutes for immediate).           | Status becomes `ESCALATED_TO_COORDINATOR`; assigned coordinator receives urgent notification.     |
| **AT-M3-15** | Coordinator manual dispatch                        | Coordinator manually assigns volunteer after phone confirmation.                     | Assignment created with `assigned_by_coordinator_id`; request becomes `FULLY_MATCHED`.            |
| **AT-M3-16** | Requester cancels request                          | Beneficiary cancels request 3 hours before start.                                    | Request becomes `CANCELLED`; assigned volunteers notified; history logged.                        |
| **AT-M3-17** | Volunteer withdraws; auto-rematch initiated        | Accepted volunteer withdraws 24 hours before scheduled start.                        | Assignment marked `WITHDRAWN`; slot reopened in matching engine; coordinator notified.            |
| **AT-M3-18** | Multi-tenant data isolation                        | Coordinator of Kozhikode attempts to view Kottakkal service request.                 | API returns `403 Forbidden` (`Not a member of this organization`).                                |
| **AT-M3-19** | Cross-organization community drive                 | Request with `allows_cross_org_volunteers = true` posted in Kozhikode.               | Kottakkal volunteer can view and accept offer; assignment records Kozhikode as host.              |
| **AT-M3-20** | Monthly frequency limit exceeded                   | Beneficiary exceeds monthly quota (8 requests) without override.                     | API returns `403 Forbidden` (`Monthly assistance quota exceeded; contact coordinator`).           |

---

## 14. Architecture Review & Sign-Off Checklist

Before proceeding to code implementation and TypeORM migration generation:

- [ ] Central vs. Local Catalogue data model approved
- [ ] Beneficiary, Caregiver, and Coordinator request initiation rules confirmed
- [ ] Mandatory manual location entry validation approved
- [ ] Immediate candidate matching for both immediate and scheduled requests confirmed
- [ ] 4-Tier proximity expansion & coordinator escalation thresholds approved
- [ ] Concurrency locking mechanism (`FOR UPDATE`) on volunteer slots signed off
- [ ] PRD Ambiguity Resolutions (Section 10) confirmed by product owner
