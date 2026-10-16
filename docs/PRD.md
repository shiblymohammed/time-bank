# Kottakkal Time Bank — Product Requirements Document (PRD)
**Version:** 1.0 — discovery baseline  |  **Status:** Product decisions confirmed; detailed engineering design proposed  |  **Date:** 12 October 2026

> **Source fidelity / numbering note:** This PRD consolidates the decisions documented in the conversation. Decisions 58–107 are individually traceable to the question-and-answer sequence. The earliest retained product-discovery summary does not preserve the exact question text or one-to-one numbering for some early funding-related questions (54–57); those rows are marked transparently instead of inventing historical questions. The underlying confirmed policy is stated accurately. This is a *summarized decision register*, not verbatim transcripts of the 107 questions.

## 1. Executive summary
Kottakkal Time Bank is a centrally governed, multi-municipality volunteer assistance platform. Eligible people request practical help; verified volunteers provide assistance and accumulate **lifetime universal time credits** for future eligible assistance or donation. Eligible beneficiaries receive approved assistance **without needing or spending credits**. A distinct **loyalty-coin** system provides merchant-funded offers. The platform is designed around trusted identity, eligibility checks, service verification, municipality administration, privacy, safety and auditable ledgers.

**Launch principle:** all confirmed functional systems target the *first public release*, built and verified incrementally by **one developer** using a milestone-driven quality-first schedule, not a fixed date. **Excluded:** a funding allocation/budget/spend management module; grant/CSR/government/NGO funding context and periodic external sponsor impact reports remain in scope.

### 1.1 Product outcomes
- Connect verified beneficiaries and volunteers efficiently by service eligibility, skills and geography.
- Maintain defensible, lifetime, cross-municipality time-credit accounting, and a separate loyalty-coin economy.
- Support routine, future, individual and team-based services with independent verification and controlled changes.
- Equip coordinators and administrators to monitor and govern services, while protecting vulnerable beneficiaries and private records.
- Operate reliably with offline field workflows, explicit synchronization outcomes, recoverable PostgreSQL data and auditable administration.

### 1.2 Scope and exclusions
**At launch:** Android Flutter member app; browser dashboards for coordinators, Municipality Admins, Super Admin and merchants; registration and verification; beneficiaries/caregivers; catalogue, matching, assignments, team services; time ledger and donations; loyalty and merchant offers; incident management, complaints, appeals, restrictions; bilingual UI; notifications; reports; offline field recording; infrastructure/security/operations.
**Future platform breadth:** Flutter iOS; web and mobile experiences for *all* roles. **Not in scope now:** formal funding allocation management, mandatory MFA, full in-app messaging/chat, persistent GPS tracking, dedicated sponsor portal, a stand-alone medical emergency-response service, Kubernetes and microservices.

## 2. Users, organizations and access rules
| Actor | Primary capabilities | Constraints |
|---|---|---|
| Volunteer | Register, select skills, accept/invite teammates, record time, verify work through third party, view credits/coins, donate/redeem, raise alerts | Skill/role approval; cannot self-verify service; wallet restrictions respected |
| Beneficiary | Request immediate/scheduled assistance, confirm service, raise safety alerts | Eligibility and service-frequency rules; eligible assistance free |
| Authorized caregiver/family | Submit request and verify completion on beneficiary’s behalf where authorized | Explicit beneficiary authorization; beneficiary privacy |
| Coordinator | Review identity/skills/beneficiaries, manage matches, investigate disputes, handle safety incidents, recommend suspensions/closures | Municipality scope; cannot finalize actions reserved for Municipality Admin |
| Municipality Admin | Approve merchants, handle local exceptions and coordinator complaints, approve suspension/reinstatement, closure, bans, ledger corrections | Decisions auditable; complaints against self go to Super Admin |
| Super Admin | Provision municipalities/admins, central catalogue/policies, organization-wide reporting, final internal appeals | Privileged audit controls; no internal appeal above Super Admin |
| Merchant | Manage draft offers, scan QR or enter one-time code, see business-specific redemption activity | Municipality Admin approval before publication; merchant funds promotional offers |
| Sponsor/funder | Receive periodic exported impact reports outside platform | No sponsor login/dashboard at launch |

One person has a **single permanent verified identity**, with multiple separately approved roles. One **primary municipality** determines administration while eligibility, volunteering and universal wallets may span municipalities. Permission checks must be enforced in backend services and at the database query boundary, not merely hidden in the user interface.

## 3. Functional requirements
### FR-IDENT: Identity, verification and account lifecycle
- **FR-IDENT-01:** OTP authentication using verified mobile number across all roles; rate limiting, single-use expiry and audit logs.
- **FR-IDENT-02:** Coordinator validates submitted identity/address documents; system flags phone or legally permissible identifier duplicates for human review.
- **FR-IDENT-03:** Permanent member identity supports approved role switching and relocation approved by destination coordinator.
- **FR-IDENT-04:** Coordinator-assisted phone/SIM recovery preserves the original identity.
- **FR-IDENT-05:** Member nominates a verified recipient for post-death credit transfer; nominee updates use OTP and disputed changes require review.
- **FR-IDENT-06:** Account closure after death prevents new operations, retires coins, resolves pending records and securely archives activity.
- **FR-IDENT-07:** Duplicate account closure requires coordinator investigation and Municipality Admin approval; never auto-merge; time and coin balances remain frozen in closed duplicate.

### FR-GOV: Organizations, roles and governance
- **FR-GOV-01:** Super Admin creates municipalities and appoints Municipality Admins; municipality admins appoint coordinators.
- **FR-GOV-02:** Central catalogue and service rules with municipality enablement and centrally approved new categories.
- **FR-GOV-03:** Role permissions and municipality scope checked on every privileged API operation.
- **FR-GOV-04:** Final internal appeal authority is Super Admin; preserve original case evidence and audit history.

### FR-BEN: Beneficiary eligibility and rights
- **FR-BEN-01:** Central eligibility standards, coordinator verification, Municipality Admin exceptions and appeals.
- **FR-BEN-02:** Long-term or temporary eligibility periods with individual review dates.
- **FR-BEN-03:** Approved beneficiaries receive eligible assistance free, irrespective of time-credit balance or volunteer suspension.
- **FR-BEN-04:** Coordinator-reviewed service frequency limits and exceptions.
- **FR-BEN-05:** Caregiver authorization is explicit and revokeable; no public exposure of vulnerable beneficiary information.

### FR-SVC: Catalogue and request lifecycle
- **FR-SVC-01:** Immediate and future dated service requests, created by beneficiary, authorized caregiver or coordinator.
- **FR-SVC-02:** Every request requires a manually entered service location, separate from residential address.
- **FR-SVC-03:** Future bookings begin volunteer matching immediately; volunteers accept ahead of time.
- **FR-SVC-04:** Flexible cancellation and rescheduling, with notifications, reacceptance for changed appointment and incident review.
- **FR-SVC-05:** Service timers with start/stop, manual correction and independent recipient/caregiver/coordinator confirmation.
- **FR-SVC-06:** Conditional base credit rates/bonuses defined by approved policy; actual duration determined by timer, not pre-fixed.

### FR-MATCH: Volunteer matching and availability
- **FR-MATCH-01:** Location matching defaults to verified address; opt-in current GPS may improve proximity, without continuous tracking.
- **FR-MATCH-02:** Apply skills, service permissions, municipality eligibility and request geography to candidate selection.
- **FR-MATCH-03:** No fixed volunteer weekly schedule; accept/decline requests individually.
- **FR-MATCH-04:** Expand matching radius when no one accepts, then escalate to coordinator; permit manual assignment.
- **FR-MATCH-05:** Assigned parties may make direct phone calls; no in-app chat required.

### FR-TEAM: Multi-volunteer services and transfers
- **FR-TEAM-01:** Service catalogue specifies minimum safe and preferred volunteer counts.
- **FR-TEAM-02:** Team positions filled by invited eligible volunteers or automatic matching.
- **FR-TEAM-03:** Equal general team responsibilities (not individually coordinator-assigned specialties).
- **FR-TEAM-04:** Team may start when minimum staffing met; each participant has own timer and verified completion.
- **FR-TEAM-05:** When a team falls below minimum mid-service, active assignment may continue with coordinator notification; unsafe tasks must stop.
- **FR-TEAM-06:** Each verified completing simultaneous team member earns eligible credits/coins.
- **FR-TEAM-07:** Sequential transfers permit replacement and coordinator review for sensitive cases; *only the finishing volunteer* earns that assignment’s service-related credits/coins.

### FR-TIME: Universal lifetime time-credit ledger
- **FR-TIME-01:** Cross-municipality single wallet, lifetime no routine expiration, separate from merchant loyalty.
- **FR-TIME-02:** Issue credits only after authoritative service verification and approved rates/bonuses.
- **FR-TIME-03:** Support eligible member future assistance requests, donations to verified persons and approved community pools.
- **FR-TIME-04:** Atomic ledger entries for awards, spends, donations, holds, corrections and restrictions; prevent double issuance/spend.
- **FR-TIME-05:** Temporary suspension, permanent ban and duplicate closure preserve balances/history but restrict relevant transactions.
- **FR-TIME-06:** Suspected fraud temporarily freezes disputed credits; coordinator investigation and Municipality Admin correction approval.
- **FR-TIME-07:** Fraud-linked traceable donated/transferred unspent credits temporarily restricted pending same review; no decided policy for already-consumed tainted credits.

### FR-LOY: Loyalty and merchants
- **FR-LOY-01:** Separate loyalty wallet, earned by verified service, performance, approved achievements and engagement.
- **FR-LOY-02:** Super Admin sets loyalty rules; local campaigns centrally approved.
- **FR-LOY-03:** Merchants propose offers; Municipality Admin approves publication.
- **FR-LOY-04:** Merchant QR scan with single-use manual code fallback; both redeem against one authoritative status.
- **FR-LOY-05:** Merchant funds discount and other promotional obligations; no platform reimbursement.
- **FR-LOY-06:** Use privacy-controlled badges/certificates, optional leaderboards and milestone rewards.

### FR-SAFE: Safety, complaints and restrictions
- **FR-SAFE-01:** Volunteer and beneficiary can raise safety alerts during active service to assigned coordinator only.
- **FR-SAFE-02:** Confidential incident reports, actual delivery/acknowledgment states, audit history; no guaranteed emergency dispatch.
- **FR-SAFE-03:** Reporter may pause/end service; assigned coordinator approval required to restart a safety-paused service.
- **FR-SAFE-04:** Coordinator handles routine complaints; complaint *against* coordinator goes to Municipality Admin; against Municipality Admin goes to Super Admin.
- **FR-SAFE-05:** Appeals go upward with evidence; Super Admin final internal decision.
- **FR-SAFE-06:** Coordinator recommends temporary suspension/reinstatement; Municipality Admin authorizes after review; wallet transactions frozen and balances preserved.
- **FR-SAFE-07:** Coordinator investigates permanent ban; Municipality Admin authorizes platform-wide ban; Super Admin appeal may overturn and trigger automatic restoration.

### FR-OFF: Offline and notifications
- **FR-OFF-01:** Coordinator can capture registration information offline; volunteer can record assignment timer/events offline.
- **FR-OFF-02:** Automatically sync supported offline operations on connectivity, with pending/success/failed state.
- **FR-OFF-03:** Every mutation uses client operation ID/idempotency protection, conflict resolution and server validation.
- **FR-OFF-04:** Final verification approvals, ledgers, merchant redemption and authorization actions remain online/server-authoritative.
- **FR-OFF-05:** Push, SMS and optional consented WhatsApp notifications; unsent offline safety alert must never say delivered.

### FR-REPORT: Analytics and sponsor reporting
- **FR-REPORT-01:** Municipality-admin scoped dashboards, reports and PDF/XLSX/CSV exports; Super Admin sees organization-wide summaries.
- **FR-REPORT-02:** Privacy-aware impact aggregation and role-restricted individual detail.
- **FR-REPORT-03:** Periodic downloadable impact reports shared externally with funders; no sponsor-facing login or dashboard.
- **FR-REPORT-04:** Funding allocation and spending management excluded.

### FR-UX: Localization and accessibility
- **FR-UX-01:** Malayalam and English at initial launch, localization architecture extendable to other Indian languages.
- **FR-UX-02:** Readable type, touch target sizing, contrast, semantic screen-reader labels, keyboard focus/navigation where applicable.
- **FR-UX-03:** Roles see relevant features in responsive mobile/web views; future all-role platform coverage preserved.

## 4. Key business rules and invariants
- **BR-01:** No member can earn time credits by self-verifying their own volunteer service.
- **BR-02:** Beneficiary free assistance eligibility and volunteer wallet privileges are independently administered.
- **BR-03:** No time-credit-for-shopping conversion; loyalty coins alone are used for merchant offers.
- **BR-04:** Every account has permanent identity and organization-scoped approved roles; no account resets to evade bans.
- **BR-05:** Lifetime credits are not routinely expired, forfeited on ban or transferred from closed duplicates.
- **BR-06:** A simultaneous team’s completing verified members may each earn rewards; a sequential transfer rewards only the finishing volunteer.
- **BR-07:** A service begins only when its minimum safe team is staffed. If staffing falls below minimum mid-service, assignment remains open and coordinator is notified, but unsafe work must cease.
- **BR-08:** Offline records are provisional until secure server processing; no offline awarding or QR coupon redemption.
- **BR-09:** Ledger transactions and corrections are append-only with auditability; never rewrite historical financial-like records.
- **BR-10:** A safety-paused service requires assigned coordinator authorization before resumption, and either participant may decline to continue.
- **BR-11:** A confirmed Super Admin reversal of permanent ban automatically removes that ban restriction without needing the original Municipality Admin to agree.
- **BR-12:** Central funding sources are part of institutional sustainability; no funding allocation management in current app.

## 5. End-to-end use cases
### UC-01 — New volunteer registration
- **Actors:** Applicant; Coordinator
- **Preconditions:** Applicant has reachable number and acceptable verification documents.
- **Main flow:** OTP registration → submit profile/address/identity → duplicate screening → coordinator document/skill approval → volunteer role enabled.
- **Success / postconditions:** Approved volunteer can browse and accept eligible tasks; suspected duplicates are held for review.

### UC-02 — New beneficiary enrollment
- **Actors:** Beneficiary/Caregiver; Coordinator; Municipality Admin
- **Preconditions:** Applicant identified, eligibility criteria available.
- **Main flow:** Register → apply as beneficiary → verify documents/eligibility → set review date → grant benefit role.
- **Success / postconditions:** Verified beneficiary can request eligible assistance without time-credit deduction; exceptions go to Municipality Admin.

### UC-03 — Caregiver submits request
- **Actors:** Authorized caregiver; Beneficiary
- **Preconditions:** Valid caregiver authorization.
- **Main flow:** Select beneficiary → service → manual location → immediate/future schedule → submit.
- **Success / postconditions:** Beneficiary-linked request created with authorization and audit trail.

### UC-04 — Immediate service request
- **Actors:** Beneficiary; Volunteer; Coordinator
- **Preconditions:** Approved beneficiary/service and frequency eligibility.
- **Main flow:** Create request → location/skills filtering → offer to volunteers → accept → verify completion.
- **Success / postconditions:** Assigned and verified service; no takers triggers radius expansion and escalation.

### UC-05 — Future booked service
- **Actors:** Beneficiary; Volunteer
- **Preconditions:** Valid future appointment and approved service.
- **Main flow:** Book future date/location → match immediately → accept in advance → reminders/changes → start at appointment.
- **Success / postconditions:** Assignment linked to scheduled start, with voluntary participation maintained.

### UC-06 — Volunteer withdrawal or cancellation
- **Actors:** Volunteer; Beneficiary/Caregiver; Coordinator
- **Preconditions:** Existing accepted assignment.
- **Main flow:** Authorized party cancels/reschedules or volunteer withdraws → notify affected parties → rematch/expand → review repeated incidents.
- **Success / postconditions:** Proper event history, no forced silent change to volunteer commitment.

### UC-07 — Single-volunteer service verification
- **Actors:** Volunteer; Beneficiary/Caregiver/Independent Coordinator
- **Preconditions:** Valid active assignment.
- **Main flow:** Start timer → stop timer → propose corrections if necessary → independent confirmation → server award.
- **Success / postconditions:** One verified service with time-credit and eligible loyalty postings exactly once.

### UC-08 — Team invitation and staffing
- **Actors:** Assigned volunteer; other volunteers; Coordinator
- **Preconditions:** Catalogue includes min/preferred headcount.
- **Main flow:** Invite eligible teammates → auto-match openings → accept individual positions → ensure min safe count.
- **Success / postconditions:** Team can start upon minimum; optional volunteers up to preferred count.

### UC-09 — Team completion with unequal presence
- **Actors:** Several volunteers; Verifier
- **Preconditions:** Team service active.
- **Main flow:** Each starts/stops own timer → verifier confirms each contribution → server computes separate awards.
- **Success / postconditions:** Completers rewarded individually; incomplete or unverified members not automatically rewarded.

### UC-10 — Team drops below minimum
- **Actors:** Team volunteer; Coordinator
- **Preconditions:** Team service active; staffing goes below minimum.
- **Main flow:** Record departures → notify coordinator → continue safe elements only; arrange replacement as needed.
- **Success / postconditions:** Service stays active subject to safety; individual timer history retained.

### UC-11 — Sequential service transfer
- **Actors:** Original and replacement volunteers; Coordinator
- **Preconditions:** Active assignment requires replacement.
- **Main flow:** Volunteer leaves/transfers → automatic matching or review of sensitive case → replacement accepts → completes → verification.
- **Success / postconditions:** Only finishing volunteer gets service-related time credits and coins.

### UC-12 — Cross-municipality time-credit use
- **Actors:** Member; Service system
- **Preconditions:** Verified account; usable balance and eligible transaction.
- **Main flow:** Accrue in municipality A → request eligible assistance or donate in B → validate ledger restrictions and permissions.
- **Success / postconditions:** Single lifetime wallet remains coherent across municipalities.

### UC-13 — Donate time credits
- **Actors:** Donor; Verified member or approved assistance pool
- **Preconditions:** Donor wallet active; recipient/pool eligible.
- **Main flow:** Choose recipient/amount → backend atomic transfer with idempotency → receipt.
- **Success / postconditions:** Audited donation, no double-spend or unauthorized recipient.

### UC-14 — Merchant rewards
- **Actors:** Member; Merchant; Municipality Admin
- **Preconditions:** Merchant approved; eligible published offer and sufficient coins.
- **Main flow:** Select offer → create redemption QR/code → merchant scans/enters → server validates one-time token → debit coins once.
- **Success / postconditions:** Merchant-funded offer redeemed at most once; cancelled/expired tokens handled safely.

### UC-15 — Volunteer safety alert
- **Actors:** Volunteer; Assigned coordinator
- **Preconditions:** Active service.
- **Main flow:** Trigger alert → optional pause/end → send to assigned coordinator → show delivery state → confidential report.
- **Success / postconditions:** No false delivery claims; safety-pause restart only after coordinator approval.

### UC-16 — Beneficiary safety alert
- **Actors:** Beneficiary; Assigned coordinator
- **Preconditions:** Active service.
- **Main flow:** Raise alert → pause/end if desired → coordinator follow-up.
- **Success / postconditions:** Protected beneficiary complaint trail and service state.

### UC-17 — Complaint involving coordinator
- **Actors:** Reporter; Municipality Admin
- **Preconditions:** Complaint subject is assigned coordinator.
- **Main flow:** Submit confidential case directly to Municipality Admin → investigate → decide → optional appeal to Super Admin.
- **Success / postconditions:** Reported coordinator cannot inspect/edit their own case.

### UC-18 — Complaint involving Municipality Admin
- **Actors:** Reporter; Super Admin
- **Preconditions:** Complaint subject Municipality Admin.
- **Main flow:** Confidential direct Super Admin complaint → investigation → final internal determination.
- **Success / postconditions:** Municipality Admin has no authority over their own case.

### UC-19 — Suspension and reinstatement
- **Actors:** Coordinator; Municipality Admin; Member
- **Preconditions:** Documented incident.
- **Main flow:** Investigate → recommend → Municipality Admin suspends → wallet freeze → coordinator case review → Municipality Admin reinstates or rejects.
- **Success / postconditions:** Ledger preserved; approved beneficiary assistance eligibility remains separate.

### UC-20 — Permanent ban and successful appeal
- **Actors:** Coordinator; Municipality Admin; Super Admin
- **Preconditions:** Confirmed severe violation; auditable evidence.
- **Main flow:** Coordinator investigation → Municipality Admin network-wide ban → Super Admin appeal → overturn → system restores permissions/wallet.
- **Success / postconditions:** No duplicate accounts bypass ban; restoration automatic on successful appeal.

### UC-21 — Duplicate account closure
- **Actors:** Coordinator; Municipality Admin
- **Preconditions:** Duplicate discovered after registration.
- **Main flow:** Identify existing permanent identity → review individual transactions → Municipality Admin approves closure.
- **Success / postconditions:** Separate ledgers preserved, duplicate’s credits and coins frozen without transfer.

### UC-22 — Fraudulent award review
- **Actors:** Coordinator; Municipality Admin
- **Preconditions:** Specific disputed earning or traceable downstream credit.
- **Main flow:** Mark disputed amount → freeze unspent traceable credits → investigate → Municipality Admin approves release/correction.
- **Success / postconditions:** No unapproved reversal or deletion; downstream already-consumed credits remain an open policy question.

### UC-23 — Phone change after SIM loss
- **Actors:** Member; Coordinator
- **Preconditions:** Lost access to original number.
- **Main flow:** Coordinator re-verifies identity → approves new verified phone → rotate sessions/OTP destination.
- **Success / postconditions:** Same permanent account and wallets retained.

### UC-24 — Nominee and deceased-account handling
- **Actors:** Member/Family/Nominee; Coordinator
- **Preconditions:** Registered nominee; verified death where applicable.
- **Main flow:** Nominee setup/update → death review → stop new activity → validate recipient → transfer time credits → retire coins.
- **Success / postconditions:** Secure archive and verified nominee benefit; statutory requirements respected.

### UC-25 — Offline service event synchronization
- **Actors:** Volunteer; Backend
- **Preconditions:** Offline assignment locally known.
- **Main flow:** Record start/stop events → encrypted durable queue → regain internet → auto-retry with operation ID → authoritative validation.
- **Success / postconditions:** One accepted operation despite retries; pending/success/failed clearly shown.

### UC-26 — Offline registration capture
- **Actors:** Coordinator; Backend
- **Preconditions:** Network absent; user consents to capture.
- **Main flow:** Save secure draft → reconnect → auto-upload → identity/eligibility approval online.
- **Success / postconditions:** No premature approval while still offline.

### UC-27 — Municipality impact reporting
- **Actors:** Municipality Admin; Super Admin
- **Preconditions:** Authorized report scope.
- **Main flow:** Choose filters → aggregate privacy-safe data → export PDF/XLSX/CSV.
- **Success / postconditions:** Municipality only sees authorized data; Super Admin can aggregate network-wide.

### UC-28 — External sponsor impact report
- **Actors:** Authorized administrator; Sponsor
- **Preconditions:** Approved reporting period.
- **Main flow:** Generate downloaded impact report → share externally using approved channel.
- **Success / postconditions:** Sponsor has no platform account or dashboard.

### UC-29 — Production backup recovery
- **Actors:** Developer/operator
- **Preconditions:** VPS incident/data corruption.
- **Main flow:** Quiesce affected services → restore encrypted off-server base backup → replay archived WAL to recovery point → validate ledgers → resume.
- **Success / postconditions:** Documented recovery test and reconciliation.

### UC-30 — Approved production release
- **Actors:** Solo developer/approver
- **Preconditions:** Tests pass, version reviewed.
- **Main flow:** GitHub Actions checks → build images → approval gate → Docker Compose deploy → health check/rollback.
- **Success / postconditions:** Known version deployed, monitored, and recoverable.

## 6. Non-functional requirements and technical baseline
| ID | Category | Requirement / target |
|---|---|---|
| NFR-01 | Architecture | NestJS TypeScript modular monolith, PostgreSQL database, versioned APIs; Flutter/Dart Android and Next.js/React/TypeScript web. |
| NFR-02 | Infrastructure | Development-team-managed Linux VPS, Docker Compose, GitHub Actions CI/CD with explicit production release approval. |
| NFR-03 | Capacity | Initial engineering target: approximately 10,000 registered users and 300 concurrent users; certify with workload-based load tests. |
| NFR-04 | Environment isolation | Development and production only, isolated databases and secrets; never test destructive functionality with actual member balances. |
| NFR-05 | Backup | Daily encrypted backups stored off-VPS plus continuous archival of PostgreSQL WAL for PITR; regular restore drills and backup-health alerts. |
| NFR-06 | Monitoring | VPS health, API errors/latency, database checks, queue/job status, backups and developer notifications; redact private user data. |
| NFR-07 | Identity security | Mobile OTP for all users and administrators; rate limit, short expiry, single use, session lifecycle, login audits; mandatory MFA *not selected*. |
| NFR-08 | Data security | Transport encryption, encrypted sensitive storage where feasible, least-privilege service credentials, secure secrets handling and key rotation. |
| NFR-09 | Access isolation | Backend-enforced role-based and municipality-scoped authorization, prevention of cross-tenant IDOR/data leaks, auditable privileged operations. |
| NFR-10 | Financial-like integrity | Transactional ledger with idempotency, append-only audit history, reconciliation, no double-spend/redeem, corrections by approved entries. |
| NFR-11 | Offline sync | Encrypted local storage where appropriate, durable queue, automatic retry on connectivity, conflict handling, server finality. |
| NFR-12 | Availability & recovery | Define measured service-level objectives, RPO and RTO through acceptance planning; do not imply guaranteed zero downtime on a single VPS. |
| NFR-13 | Accessibility | Malayalam/English launch, extensible translations, touch/contrast/reader/keyboard support. |
| NFR-14 | Privacy | Least-privilege access to beneficiary addresses, ID documents and incidents; redact exports, retention and lawful disclosure controls. |
| NFR-15 | Safety | No representation as emergency dispatch; queued offline alerts must show undelivered status; do not enable unsafe physical activity. |
| NFR-16 | Testing | Automated unit/integration/E2E tests, critical wallet concurrency tests, permission matrix tests, Android offline/low-connectivity field tests. |
| NFR-17 | Deployment reliability | Versioned container images, migrations with rollback plan, backups before risky schema changes, health verification and documented rollback. |
| NFR-18 | Development staffing | One developer with optional AI-assisted coding; human review required for access controls, audit ledgers, security and migrations. |
| NFR-19 | Release criterion | No fixed deadline; complete confirmed scope must pass acceptance criteria before initial public release. |

## 7. Engineering architecture and provisional data entities
**Client topology:** Flutter Android at launch for members; Next.js web dashboards for coordinators, municipality admins, Super Admins and merchants. Future Flutter iOS and comprehensive all-role mobile/web coverage remain planned. Both clients communicate with the same NestJS API and centrally governed authorization logic.

**Suggested NestJS modules:** `auth`, `identity`, `municipalities`, `roles`, `beneficiaries`, `volunteers`, `catalogue`, `requests`, `matching`, `teams`, `timers`, `verification`, `time-ledger`, `loyalty-ledger`, `merchants`, `notifications`, `safety`, `complaints`, `restrictions`, `reports`, `sync`, `audit`.

**Provisional PostgreSQL entities:** `users`, `profiles`, `phone_credentials`, `identity_checks`, `municipalities`, `member_municipalities`, `role_grants`, `caregiver_authorizations`, `beneficiary_eligibility`, `service_types`, `local_services`, `service_requests`, `service_assignments`, `team_members`, `timer_events`, `verifications`, `transfers`, `wallets`, `ledger_transactions`, `ledger_entries`, `wallet_holds`, `donations`, `merchants`, `merchant_offers`, `redemptions`, `incidents`, `complaints`, `appeals`, `account_restrictions`, `notifications`, `sync_operations`, `audit_events`, `nominees`. These are design proposals, not separately voted decisions.

**Ledger pattern:** maintain account/currency partitioning and immutable journal entries; process service verification and issuance in one transactional unit with unique event reference; use amount-level holds for suspected fraud; serialize balance-consuming operations safely; protect one-time coupon redemption with database uniqueness/locking.

**Geographic pattern:** geocode manually entered service location where possible; keep private location text; locate volunteers via verified residential coordinates and optional transient consent-based GPS, without storing permanent live trails. Use appropriate spatial indexing if later load tests justify it.

**Offline pattern:** durable locally encrypted queue with unique operation IDs; server returns accepted/duplicate/rejected/conflict status. A service clock captures events rather than assuming client-reported elapsed duration is authoritative; detect clock changes and impossible overlaps. Never allow offline wallet issuance or administrative final decisions.

**VPS deployment:** reverse proxy/TLS → Next.js and NestJS containers → PostgreSQL service and background workers; encrypted off-server backup/WAL target; role-limited operator access; monitoring and alerts. Prefer isolated services and safe networking even on single VPS. Final VPS sizing depends on workload benchmark, not merely number of registered users.

## 8. Data flows and interaction contracts
1. **Registration:** `POST OTP` → verify → register profile and supporting documents → duplicate screening → coordinator approval → role grant.
2. **Request:** authenticated beneficiary/caregiver/coordinator → entitlement and frequency checks → request with entered location and date mode → matching offers and assignment record.
3. **Completion:** timer events → independent authorized verifier → policy checks → ledger award and loyalty award → notifications; enforce exactly-once business effect.
4. **Donation:** donor permission/balance verification → atomic ledger debit/credit → audit record → recipient notification.
5. **Redemption:** merchant approved offer → ephemeral QR/code token → atomic single redemption → loyalty debit → merchant confirmation.
6. **Safety:** incident originating from active service → assigned-coordinator routing → delivery acknowledgment tracking → pause/end and restricted restart workflow.
7. **Reporting:** role + tenant scope → privacy-filtered aggregate → approved export → audit of sensitive report access.

## 9. Error states, privacy and security cases
- OTP brute force, SIM change, OTP replay and session hijacking: throttle OTP issuance/verification, rotate sessions on recovery, alert affected member where feasible.
- Duplicate service completion or queued sync replay: reject duplicate operation IDs and uniquely constrain credits per approved completion event.
- Two volunteers claim last team position simultaneously: transactionally claim available slot; prevent over-allocation.
- Volunteer location permission denied: fall back to verified residential location without blocking ordinary service usage.
- Manually entered location cannot be resolved: retain user text, request correction/clarification before dispatch if necessary.
- Caregiver authorization revoked: immediately block future representative actions, preserving prior auditable history.
- Safety alert created offline: show *not sent* until delivery acknowledgment; direct user to appropriate emergency assistance if immediate danger.
- Team falls below safe minimum: coordinator notified; potentially hazardous physical tasks halted despite assignment remaining active.
- Safety-related pause: preserve per-member time entries, refuse restart until assigned coordinator authorizes.
- Suspected fraudulent credits already in another wallet: restrict available traceable unspent amount pending review; do not automatically create negative balances.
- Duplicate account closure: freeze both wallets, retain distinct ledger; closing must not undo existing global ban.
- Deceased nominee verification conflicts, unresolved transfers or legal constraints: hold transfer until verified case resolution.
- VPS failure/backups lost: restore from independently held encrypted backup and WAL, prove wallet consistency before re-opening writes.
- Over-privileged admin account or cross-municipality enumeration: check authorization on each resource and query; capture alertable audit events.
- Merchant presents QR and manual fallback simultaneously: only one atomic redemption can succeed.

## 10. Acceptance scenarios (testable checks)
| ID | Scenario | Expected result |
|---|---|---|
| AT-01 | Verified beneficiary creates free approved service request | No time credits required or deducted. |
| AT-02 | Request has valid entered service address different from profile address | Matching uses request location, not forced home address. |
| AT-03 | Volunteer declines request | No penalty for ordinary decline; candidate matching continues. |
| AT-04 | No candidate accepts within defined workflow | Search radius expands, then coordinator alerted. |
| AT-05 | Future appointment booked | Candidate offers generated immediately; assignment may be accepted in advance. |
| AT-06 | Scheduled time changed after acceptance | Volunteer receives update and need not silently accept revised timing. |
| AT-07 | Team min=2, preferred=4, two accepted | Permitted to begin if service otherwise eligible. |
| AT-08 | Team member leaves and count drops to 1 | Coordinator informed and safe portion may continue; hazardous parts blocked by policy. |
| AT-09 | Three team participants complete with independent verification | Three individualized auditable awards, no duplicate awards. |
| AT-10 | Transferred service finishes with replacement | Only finishing replacement receives related service credits and coins. |
| AT-11 | App offline during authorized field timer | Events stored locally, then auto-synced once; pending/failure clearly visible. |
| AT-12 | Local offline event reuploaded after timeout | Server processes event at most once. |
| AT-13 | Volunteer self-confirms own timer without verifier | No wallet award issued. |
| AT-14 | Member donates credits across municipalities | Universal wallet debited and verified recipient credited transactionally. |
| AT-15 | Same merchant redemption token used twice | First valid request succeeds; second fails without extra coin debit. |
| AT-16 | Suspended member views balances | Existing credits/coins preserved but wallet-changing operations blocked. |
| AT-17 | Confirmed ban appealed successfully to Super Admin | Global ban restriction lifted automatically; previous balances accessible subject to other valid holds. |
| AT-18 | Duplicate account with 20 credits and 500 coins closed | Both balances remain frozen in duplicate; original not automatically enriched. |
| AT-19 | Fraudulent credit transaction under review | Affected unspent amount restricted; correction requires Municipality Admin approval. |
| AT-20 | Complaint against assigned coordinator | Complaint goes to Municipality Admin without subject coordinator access. |
| AT-21 | Complaint against Municipality Admin | Complaint goes directly to Super Admin; no subject access. |
| AT-22 | Volunteer safety alert issued offline | App accurately reports undelivered until network/server acknowledges. |
| AT-23 | Safety-paused service tries to resume without coordinator approval | Server rejects restart; stored timer time unchanged. |
| AT-24 | Malayalam and English selected | Core workflows legible and accessible in chosen language. |
| AT-25 | Municipality admin exports report | Only authorized municipality data included; user-sensitive details protected. |
| AT-26 | Load test 300 concurrent representative users | Meets response/error targets agreed before go-live; numbers recorded, not assumed. |
| AT-27 | Production restore exercise | Database and ledger checks pass after restore + WAL replay. |
| AT-28 | Unauthorized cross-municipality API request | Server denies data and writes audit log. |
| AT-29 | Sponsor asks for metrics | Approved external impact report available; no sponsor login. |
| AT-30 | Funding officer attempts budget allocation | No funding management module is presented as implemented. |

## 11. Delivery strategy for solo developer
**Full public scope ≠ build everything simultaneously.** Deliver working integrated slices in a dependency-aware order; each milestone ends with tests and documented limitations.
1. **Foundation:** Repository/CI, isolated dev+prod config, migrations, API conventions, Flutter/Next.js shells, OTP, audit foundation.
2. **Identity and municipality administration:** Verification, role grants, municipality setup, beneficiary eligibility, caregivers, permissions, account recovery.
3. **Core services:** Catalogue, request creation, location, immediate and scheduled matching, assignment, timers, independent verification.
4. **Universal time-credit ledger:** Atomic awards, redemption for assistance, cross-municipality donations, freeze/correction rules.
5. **Team and transfer workflows:** Team-size rules, invitation matching, separate timers, transfer rewards, cancellations.
6. **Loyalty and merchants:** Coin rules, offers, publication approval, QR/manual redemption, recognition.
7. **Governance and reporting:** Alerts, complaints, suspensions, bans, appeals, account closure, analytics/exports, external sponsor reports.
8. **Offline reliability:** Local secure queue, automatic sync, conflict handling, delivery states, on-device field tests.
9. **Production hardening:** Pen-test/review, realistic load tests, back-up restoration, PITR drill, admin audit review, accessibility and Malayalam validation.

**AI assistance boundaries:** AI may generate boilerplate, test cases, UI drafts, SQL reviews and docs. Solo developer owns security review and end-to-end validation. No production schema migration, wallet correction, role change or authorization-rule change should be adopted solely from unchecked AI output.

## 12. Decision traceability register — all 107 outcomes
The descriptions below state the **confirmed final decisions**, including explicit reversals, without claiming the historical exact wording of each question.
| # | Topic | Confirmed resolution |
|---:|---|---|
| 1 | Multi-municipality platform | One centrally administered platform supports multiple municipalities/cities. |
| 2 | Administrative hierarchy | Super Admin creates municipalities and appoints Municipality Admins; Municipality Admins appoint Coordinators; Coordinators verify member and merchant applicants. |
| 3 | Separate wallet types | Time credits are distinct from loyalty coins; time credits cannot be redeemed at shops. |
| 4 | Loyalty earning policy | Hybrid earning from verified service, performance, achievements and eligible community engagement. |
| 5 | Service completion assurance | Recipient confirmation with coordinator oversight for risky or disputed services; later refined to multichannel verification. |
| 6 | Free assistance to beneficiaries | Verified eligible beneficiaries receive approved assistance without spending time credits. |
| 7 | Volunteer assignment | Hybrid volunteer acceptance plus coordinator manual assignment and intervention. |
| 8 | Request initiators | Beneficiaries, coordinators, and authorized family members/caregivers can submit requests. |
| 9 | Location-driven matching | Match using location, skills and eligibility rather than rigid coordinator-controlled volunteer zones. |
| 10 | Service catalogue governance | Centrally standardized catalogue; municipalities enable services and propose new types for central approval. |
| 11 | Volunteer skills approval | Volunteers select proposed services/skills; coordinators approve participation, with extra checks for sensitive categories. |
| 12 | Volunteer availability | No compulsory recurring schedule; accept/decline requests individually. |
| 13 | Unfilled request handling | Expand geographic search automatically then escalate to municipality coordinator. |
| 14 | Service duration accounting | Start/stop timer, manual correction and recipient verification; variable actual duration. Approved base credit rates and conditional bonuses, not fixed service duration. |
| 15 | Time-credit use | Hold for future need, use for eligible assistance, donate to verified members or community pools. |
| 16 | Volunteer-to-beneficiary transition | Volunteers can later gain beneficiary eligibility; free approved assistance does not consume their saved credits. |
| 17 | Universal time-credit wallet | One time-credit wallet usable/donatable across all participating municipalities. |
| 18 | Lifetime credit validity | No routine expiration; narrowly justified fraud, error, security or legal corrections. |
| 19 | Donation recipients | Both verified individuals and approved community assistance pools. |
| 20 | Merchant offer approval | Merchants propose/manage offers; Municipality Admin approves publishing. |
| 21 | Merchant redemption | QR merchant scan with one-time manual redemption code fallback; shared redemption state prevents double use. |
| 22 | Merchant-funded discounts | Merchants bear costs of their offers, not municipality/platform reimbursement. |
| 23 | Loyalty policy ownership | Super Admin sets central earning policy; local bonus campaigns need central approval. |
| 24 | Beneficiary eligibility standards | Central eligibility rules, coordinator verification, Municipality Admin exceptions/appeals. |
| 25 | Eligibility review periods | Differentiated review dates for ongoing versus temporary beneficiary eligibility. |
| 26 | Service usage frequency | Central service-specific frequency limits, exception requests and coordinator prioritization. No emergency medical dispatch. |
| 27 | Completion verifier options | Beneficiary, authorized caregiver, or independent coordinator may verify; volunteer cannot self-verify; sensitive/disputed work receives extra review. |
| 28 | Routine complaints | Coordinator handles routine disputes, with independent handling where conflict of interest exists. |
| 29 | Volunteer reliability | Progressive policy for cancellations/no-shows with incident logs, review, warnings/restrictions where warranted. |
| 30 | Service communication | Assigned parties can use direct phone calls; in-app chat is not required. |
| 31 | Volunteer transfer request | Assigned volunteer can leave or request a replacement. |
| 32 | Transfer authorization | Routine transfers rematch automatically upon replacement acceptance; sensitive/urgent/disputed ones need coordinator review. |
| 33 | Time-credit award on transfers | Only the volunteer finishing a sequentially transferred assignment receives service time credits. |
| 34 | Loyalty award on transfers | Only the finishing volunteer receives service-related loyalty coins for sequential transfers. |
| 35 | Volunteer performance inputs | Blend beneficiary feedback, verified completions, reliability incidents and coordinator-reviewed issues. |
| 36 | Volunteer recognition | Levels, badges, certificates and loyalty milestone bonuses. |
| 37 | Recognition privacy | Achievement visibility is privacy-controlled; leaderboards opt-in; beneficiary data not public. |
| 38 | Long-term client coverage | Mobile and web experiences for every role in the long-term product. |
| 39 | Unified multi-role identity | One permanent verified human identity with separately approved role permissions; businesses are merchant entities. |
| 40 | Primary municipality | One administrative home municipality, but eligible cross-municipality participation and a universal wallet. |
| 41 | Relocation | Member requests primary municipality change; destination coordinator approves, preserving history and wallets. |
| 42 | Initial login and identity check | Mobile OTP with coordinator-reviewed identity/address documents and separate role approval. |
| 43 | Lost phone/SIM recovery | Coordinator-assisted identity verification and phone-number change preserve the original account. |
| 44 | Death nominee | Verified nominated recipient can receive remaining time credits following required verification and applicable law. |
| 45 | Nominee changes | Member self-selects or updates nominee using OTP; suspect/disputed changes reviewed by coordinator. |
| 46 | Deceased member handling | Close/restrict new activity, verify nominee transfer, retire unused loyalty coins, securely archive history and resolve pending work. |
| 47 | Offline-first operations | Field registration and service timer recording offline with later synchronization; wallet posting, redemption and final approval online/server-authoritative. |
| 48 | Notifications | Push, SMS and optionally opt-in WhatsApp. |
| 49 | Analytics and exports | Municipality-scoped dashboards plus PDF/Excel/CSV reports; Super Admin organization-wide reporting and privacy-safe aggregation. |
| 50 | Languages | Malayalam and English at launch; extensible for more Indian languages. |
| 51 | Accessibility | Standard accessible interface: contrast, readable text, usable targets, screen readers and keyboard access. |
| 52 | Municipality creation | Super Admin manually provisions municipalities in a secure dashboard; no self-service municipal onboarding. |
| 53 | Funding model | Government, NGO, CSR sponsorship and grants; no compulsory municipality subscription. |
| 54 | Sponsor reporting scope | Sponsors receive periodic externally shared downloadable impact reports; no sponsor login or dashboard. This is the revised final decision. |
| 55 | Sponsor access boundary | External funders consume exported impact reporting, not privileged municipality/member accounts. This is a consolidated consequence of the revised sponsor-reporting decision, not a separately evidenced exact original question. |
| 56 | Funding operations boundary | Funding sources are informational/business-model context, not merchant reimbursement. Precise original question wording unavailable in retained record; preserve established funding model only. |
| 57 | Final sponsor reporting revision | Periodic downloadable impact reports shared externally; dedicated sponsor accounts/dashboard were explicitly rejected. Numbering around prior funding questions is not fully recoverable. |
| 58 | Funding management scope / volunteer matching | Funding allocation module explicitly deferred. Volunteer location matching uses verified residential address by default and optional permission-based current GPS; no continuous tracking. |
| 59 | Service request location | Manually entered service location for every request, independent of registered residence. |
| 60 | Request timing | Both immediate assistance requests and future scheduled requests. |
| 61 | Scheduled matching | Start matching immediately after scheduled request creation; volunteers accept future assignments ahead of time. |
| 62 | Cancellation and rescheduling | Authorized requesters can cancel/reschedule; volunteer withdrawal triggers rematching; late/repeated incidents reviewed by coordinator. |
| 63 | Multi-volunteer assignments | Service-defined teams supported; each completing verified team member receives individual eligible rewards. |
| 64 | Partial team staffing | Each service has minimum safe and preferred team sizes; can start when minimum met. |
| 65 | Team recruitment | Volunteer invitations for eligible teammates plus automatic matching of open positions. |
| 66 | Team verification | Each volunteer has separate timer and completion verification. |
| 67 | Team responsibilities — revised | All team members share equal general responsibilities; prior coordinator-assigned individual duties choice is superseded. |
| 68 | Team start | Volunteers may begin independently once minimum safe team staffing confirmed, subject to eligibility and general safety controls. |
| 69 | Staffing reduction mid-service | If active team drops below minimum, assignment may continue and coordinator is notified; dangerous tasks still cannot proceed unsafely. |
| 70 | Volunteer safety | Coordinator safety alerts plus confidential incident reporting. |
| 71 | Safety-alert routing | Send ordinary safety alerts only to assigned coordinator; no automatic escalation to management. |
| 72 | Beneficiary safety | Both volunteers and beneficiaries can raise alerts during active service; caregiver alert privileges were not selected. |
| 73 | Safety response | Person raising an alert can pause or end service, with coordinator notification. |
| 74 | Safety restart | Assigned coordinator must authorize restarting a safety-paused service; participants remain free to decline. |
| 75 | Coordinator complaints | Confidential complaints against assigned coordinator go directly to Municipality Admin. |
| 76 | Municipality Admin complaints | Confidential complaints against Municipality Admin go directly to Super Admin. |
| 77 | Appeals hierarchy | Appeal complaint decisions to next higher administrative authority, with case history/evidence. |
| 78 | Final appeal | Super Admin is final *internal* authority; external statutory/legal rights unaffected. |
| 79 | Temporary suspension wallets | Preserve balances but freeze earning, spending, donations and redemption; independently approved free beneficiary assistance is separately assessed. |
| 80 | Suspension authority | Coordinator recommends; Municipality Admin approves temporary suspension and reinstatement. |
| 81 | Reinstatement review | Coordinator reviews and recommends; Municipality Admin approves; never auto-reinstate merely on expiry. |
| 82 | Permanent ban authority | Municipality Admin may permanently ban after coordinator investigation; appeal to Super Admin. |
| 83 | Permanent ban scope | Municipality Admin-authorized permanent ban applies platform-wide across participating municipalities. |
| 84 | Banned member wallets | Preserve both wallet balances and histories while permanently freezing wallet operations during ban. |
| 85 | Overturned ban | Successful Super Admin appeal automatically restores affected permissions and preserved wallet operations, unless separate restrictions remain. |
| 86 | Duplicate detection | Automated phone and legally permissible identity matching; coordinator reviews potential duplicates. |
| 87 | Post-registration duplicates | Close duplicate accounts after individual wallet/transaction review; no automatic merge. |
| 88 | Duplicate closure authority | Coordinator investigates and Municipality Admin approves duplicate-account closure. |
| 89 | Duplicate time credits | Preserve verified time-credit balance frozen inside closed duplicate account, without transfer. |
| 90 | Duplicate loyalty coins | Preserve loyalty-coin balance frozen inside closed duplicate account, without transfer. |
| 91 | Suspected credit fraud | Temporarily restrict disputed credits, investigate through coordinator, Municipality Admin approves auditable corrections. |
| 92 | Fraud-tainted transferred credits | Temporarily restrict traceable transferred credits pending coordinator investigation and Municipality Admin decision. |
| 93 | First-release interfaces | Flutter mobile for volunteers/beneficiaries; Next.js-compatible web dashboards for staff/merchants. Long-term web and mobile for all roles. |
| 94 | Mobile launch OS | Android first, iOS later using Flutter. |
| 95 | Backend stack | NestJS + TypeScript + PostgreSQL; initially modular monolith. |
| 96 | Web frontend stack | Next.js + React + TypeScript role-aware dashboards. |
| 97 | Hosting | Development-team-managed VPS. |
| 98 | Capacity target | Approximately 10,000 registered users and 300 concurrent users at initial launch. |
| 99 | Offline sync behavior | Automatic secure synchronization on regained connectivity; pending/success/failed states; server-authoritative final records. |
| 100 | Database backup and recovery | Daily encrypted off-server PostgreSQL backups with WAL archiving for point-in-time recovery. |
| 101 | Deployment pipeline | Docker Compose on VPS + GitHub Actions CI/CD + approved production releases. |
| 102 | Production monitoring | Server, API errors, database, jobs and backup status with development-team alerts. |
| 103 | Login model | Mobile-number OTP for members and *all* administrator roles; no mandatory MFA at launch. |
| 104 | Deployment environments | Development and production only; no dedicated staging environment. |
| 105 | Public launch scope | Complete confirmed platform at initial public launch, including teams, loyalty, advanced reports and governance. |
| 106 | Release timing | Milestone-driven, quality-first launch with no fixed public deadline. |
| 107 | Development team | One developer, potentially assisted by AI coding tools. |

## 13. Gaps and unresolved engineering details (not new discovery questions)
The following details should be specified during implementation/design review. They are **not** confirmed 107-question outcomes; choosing defaults must not silently rewrite confirmed requirements.
- **Earliest funding-related numbering:** Retained context cannot reconstruct the exact historical wording/sequence of Q54–Q57; the final sponsor-report and no funding-management decisions are authoritative.
- **Fraud after downstream consumption:** Q93 about already-spent suspicious donated credits was proposed but *never answered* in the retained conversation; no negative-balance/recovery policy is confirmed.
- **Wallet unit semantics:** Exact definition/rounding of one time-credit unit, transfer fees (if any), bonus formulas, caps, approval thresholds and accounting details.
- **Reconciliation policy:** Managing unspent vs already consumed traceable disputed credits, especially when innocent recipients are involved.
- **Emergency and serious-risk policy:** Minimum-safe staffing and the permission to keep an understaffed *assignment* open must not imply unsafe work is lawful or acceptable.
- **Administrator OTP residual risk:** Mobile OTP alone is confirmed; elevated compromise risk requires safeguards, and may warrant documented risk acceptance.
- **Hosting specifics:** VPS operating system/provider, CPU/RAM, RPO/RTO, monitoring vendors, SMS/WhatsApp providers, object storage, TLS termination and secrets manager.
- **Personal data compliance:** Appropriate Indian data-protection requirements, valid identity-document handling, retention schedules, nominee legality, age eligibility and consent requirements require legal review.
- **KPI and nonfunctional thresholds:** API p95 latency, availability target, notification latency, maximum sync backlog, maximum allowable data loss and time-to-recover must be quantified before acceptance.
- **Report definitions:** Exact municipality KPIs, performance score formula, certificate design, export columns and privacy thresholds.
- **SRS/API/ERD:** Detailed screen inventory, fields, error codes, role-action matrix, relational constraints and migration sequence to be elaborated from this PRD.

## 14. Change-control guidance
1. Treat this PRD and its 107-outcome decision register as the **baseline**; later requirements changes must be recorded with date, rationale, impacted modules and affected acceptance tests.
2. Distinguish **confirmed policy** from **engineering recommendation** (especially table names, infrastructure helpers, exact limits and defaults).
3. Resolve conflicting phrasing by the most recent explicit user choice: Q57 external sponsor reports; Q67 equal responsibilities; Q14 start/stop actual duration; Q103 OTP-only for admins; Q105 full first public launch.
4. Do not silently reintroduce funding allocation management.
5. Prioritize safety, accessibility, authorization, time-credit ledger consistency and recoverability even if they require more internal milestones.

---
**End of PRD v1.0.** Companion deliverables to follow from this source of truth: detailed SRS with requirement IDs and fields, permission matrix, sequence diagrams, ERD/PostgreSQL schema, OpenAPI specification, UI screen map, QA test plan and production operations runbook.
