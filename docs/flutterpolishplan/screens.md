# Flutter Screens Directory & Architecture Map

This directory contains functional specifications for each screen in the Flutter mobile application (`apps/mobile/time_bank_flutter`). Each document focuses on functional purpose, content hierarchy, input controls, buttons, dialogs, and navigation flows (excluding stylistic themes/colors).

> [!NOTE]
> For the visual sequence, branching logic, and lifecycle order of all screens, see the master [workflow.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/workflow.md).

---

## Master Workflow Document
- **[Application Workflow & Screen Transitions (`workflow.md`)](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/workflow.md)** – Comprehensive mermaid diagrams and step-by-step navigation map illustrating what screen comes first, what comes next, and how states branch.

---

## Screen Documentation Files

### 1. Onboarding & Authentication
- [welcome_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/welcome_screen.md) – `WelcomeScreen` (Brand intro, entry routing).
- [login_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/login_screen.md) – `LiveSignInScreen` (Phone number entry & 6-digit OTP verification).
- [join_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/join_screen.md) – `LiveJoinScreen` (5-step onboarding and community chapter registration).
- [membership_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/membership_screen.md) – `LiveMembershipScreen` (Application status, pending review, orientation gating).

### 2. Navigation & Dashboard
- [reference_shell.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/reference_shell.md) – `LiveReferenceShell` (Root scaffold with 4-tab bottom navigation).
- [home_dashboard_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/home_dashboard_screen.md) – `LiveHomeScreen` (Member dashboard, quick actions, balance summary, upcoming tasks).

### 3. Services & Requests
- [catalogue_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/catalogue_screen.md) – `LiveCatalogueScreen` (Service category exploration, recipient switcher, search).
- [request_form_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/request_form_screen.md) – `LiveRequestFormScreen` (Date/time selection, address, landmark, ward, special instructions).
- [request_review_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/request_review_screen.md) – `LiveReviewRequestScreen` (Pre-flight request confirmation and idempotent submission).
- [requests_list_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/requests_list_screen.md) – `LiveRequestsScreen` (Filterable request history: All, Active, History).
- [request_detail_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/request_detail_screen.md) – `LiveRequestDetailScreen` (Request lifecycle, volunteer tracking, check-ins, hour confirmations, reporting).

### 4. Time Bank Credits & Community
- [credit_history_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/credit_history_screen.md) – `LiveCreditHistoryScreen` (Universal wallet balance, transaction ledger, credit holds).
- [give_credits_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/give_credits_screen.md) – `LiveGiveCreditsScreen` (Direct peer-to-peer credit transfer & community pool gifts).
- [fund_help_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/fund_help_screen.md) – `LiveFundHelpScreen` (Optional post-service reciprocity contributions to community hours pool).

### 5. Member Profile & Volunteering
- [profile_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/profile_screen.md) – `LiveProfileScreen` (Account preferences, reading settings slider, chapter affiliations).
- [member_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/member_screen.md) – `LiveMemberScreen` (Official membership ID credential, roles, ID document reference submission).
- [volunteer_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/volunteer_screen.md) – `LiveVolunteerScreen` (Assignments, check-in/out timers, safety emergency alerts, availability settings).

### 6. Governance, Trust & Support
- [loyalty_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/loyalty_screen.md) – `LiveLoyaltyScreen` (Merchant discounts, live redemption codes with countdown timers, certificates).
- [nominee_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/nominee_screen.md) – `LiveNomineeScreen` (Credit inheritance beneficiary appointment with OTP step-up security).
- [complaints_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/complaints_screen.md) – `LiveComplaintsScreen` (Confidential grievance filing, committee findings, appeals).
- [noc_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/noc_screen.md) – `LiveNocScreen` (Municipal ward certificate lookup and document/camera upload).
- [phone_recovery_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/phone_recovery_screen.md) – `LivePhoneRecoveryScreen` (Account recovery flow for lost phones/SIMs).

### 7. System & Offline State Screens
- [outbox_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/outbox_screen.md) – `LiveOutboxScreen` (Offline mutation queue inspector and manual sync).
- [reconnect_screen.md](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/reconnect_screen.md) – `_ReconnectScreen` (Full-screen network outage / retry screen).
