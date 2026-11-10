# Application Screen Workflow & Navigation Hierarchy

This document maps out the end-to-end screen transitions, lifecycle checkpoints, navigation flows, and branching logic across the Flutter application (`apps/mobile/time_bank_flutter`).

---

## 1. Top-Level Architectural Flowchart

```mermaid
flowchart TD
    AppLaunch([App Launch]) --> CheckSession{Session in Storage?}
    
    CheckSession -->|Yes| RestoringSession[Restoring Session...]
    CheckSession -->|No| Welcome[WelcomeScreen]

    RestoringSession -->|Network / Server Error| Reconnect[_ReconnectScreen]
    Reconnect -->|Try Again| RestoringSession
    Reconnect -->|Different Number| Welcome
    
    RestoringSession -->|Success| CheckAuth{User Logged In?}
    
    Welcome -->|Continue with Phone| SignInReturning[LiveSignInScreen - Returning]
    Welcome -->|Create an Account| SignInNew[LiveSignInScreen - New Member]
    
    SignInReturning -->|Verify OTP| CheckAuth
    SignInNew -->|Verify OTP| CheckAuth

    CheckAuth -->|Pending Phone Recovery| PhoneRecovery[LivePhoneRecoveryScreen]
    CheckAuth -->|No Membership Found| JoinWizard[LiveJoinScreen - 5 Steps]
    CheckAuth -->|Applied / In Review / Blocked| MembershipGate[LiveMembershipScreen]
    CheckAuth -->|Approved Active Member| MainShell[LiveReferenceShell]
    
    JoinWizard -->|Submit Application| MembershipGate
    MembershipGate -->|Coordinator Approves| MainShell
```

---

## 2. Phase 1: Entry, Authentication & Onboarding Flow

```mermaid
flowchart LR
    WelcomeScreen -->|"Continue with Phone"| LiveSignInScreen_Phone["LiveSignInScreen (Step 1: Phone)"]
    WelcomeScreen -->|"Create an Account"| LiveSignInScreen_New["LiveSignInScreen (Step 1: Phone + New Flag)"]
    
    LiveSignInScreen_Phone -->|"Send OTP"| LiveSignInScreen_OTP["LiveSignInScreen (Step 2: 6-Digit OTP)"]
    LiveSignInScreen_New -->|"Send OTP"| LiveSignInScreen_OTP
    
    LiveSignInScreen_OTP -->|"Wrong Number / Edit"| LiveSignInScreen_Phone
    LiveSignInScreen_OTP -->|"Success (New Member)"| LiveJoinScreen["LiveJoinScreen (Registration Wizard)"]
    LiveSignInScreen_OTP -->|"Success (Existing & Approved)"| LiveReferenceShell["LiveReferenceShell (Home)"]
    LiveSignInScreen_OTP -->|"Success (Pending Review)"| LiveMembershipScreen["LiveMembershipScreen (Gate)"]
```

### Stage Transitions:
1. **App Launch (`LiveApp`):**
   - Reads secure storage (`SecureSessionVault`).
   - If token exists and valid: bypasses welcome flow straight to membership checks.
   - If connection fails during restore: routes to `_ReconnectScreen` with options to retry or switch numbers.
2. **`WelcomeScreen`:**
   - Displays brand animation and value proposition.
   - User chooses between *"Continue with Phone"* (existing account) or *"Create an Account"* (new registrant).
3. **`LiveSignInScreen`:**
   - **Step 1:** User inputs 10-digit Indian phone number (`+91`).
   - **Step 2:** User inputs SMS OTP (or auto-filled dev code).
4. **`LiveJoinScreen` (Wizard):**
   - Traversed if a verified phone has no organization membership yet:
     - **Step 0:** Select Intent (*Volunteer* vs *Request Help*).
     - **Step 1:** Choose Local Community Chapter.
     - **Step 2:** Choose Municipal Ward / Locality.
     - **Step 3:** Preferences, skills, availability, and recipient setup.
     - **Step 4:** Review summary and send application.
5. **`LiveMembershipScreen`:**
   - Shown while the application status is `APPLIED`, `PENDING_REVIEW`, `ORIENTATION`, `REJECTED`, or `SUSPENDED`.
   - Offers real-time *"Check status"* button, coordinator contact details, orientation material, and ward NOC prompts.
   - Once coordinator approves $\rightarrow$ Automatically navigates into `LiveReferenceShell`.

---

## 3. Phase 2: Main Application Shell (`LiveReferenceShell`)

Upon approval, the member enters `LiveReferenceShell`, which hosts a persistent 4-tab bottom navigation bar:

```mermaid
flowchart TD
    Shell[LiveReferenceShell]
    
    Shell --> Tab0[Tab 0: Home Dashboard]
    Shell --> Tab1[Tab 1: Services / Catalogue]
    Shell --> Tab2[Tab 2: Activity / Requests]
    Shell --> Tab3[Tab 3: Account & Profile]
```

---

## 4. Workflows Accessible from Each Tab

### Tab 0: Home Dashboard Workflow
```mermaid
flowchart TD
    Home[LiveHomeScreen / Home Tab]
    
    Home -->|Tap Wallet Card| CreditHistory[LiveCreditHistoryScreen]
    Home -->|Tap 'Find Help' Tile| Catalogue[LiveCatalogueScreen]
    Home -->|Tap 'My Requests' Tile| RequestsList[LiveRequestsScreen]
    Home -->|Tap 'Give Time' Tile| Volunteer[LiveVolunteerScreen]
    Home -->|Tap 'Membership' Tile| MemberDetails[LiveMemberScreen]
    Home -->|Tap Upcoming Commitment| RequestDetail[LiveRequestDetailScreen]
    Home -->|Tap NOC Alert Banner| NocScreen[LiveNocScreen]
    Home -->|Tap Nominee Alert Banner| NomineeScreen[LiveNomineeScreen]
```

---

### Tab 1: Service Request & Booking Workflow
```mermaid
flowchart TD
    Catalogue[LiveCatalogueScreen] -->|Select Recipient & Service Category| ServiceSelect[Select Service Card]
    ServiceSelect --> RequestForm[LiveRequestFormScreen]
    
    RequestForm -->|Pick Schedule Date/Time| DateTimePicker[Date & Time Pickers]
    DateTimePicker --> RequestForm
    RequestForm -->|Enter Address, Ward & Notes| ReviewButton[Tap 'Review & Submit']
    
    ReviewButton --> ReviewScreen[LiveReviewRequestScreen]
    ReviewScreen -->|Confirm Idempotent Request| RequestDetail[LiveRequestDetailScreen]
    
    RequestDetail -->|Volunteer Completes Service| ConfirmModal[Confirm Hours Modal]
    ConfirmModal -->|Optional Reciprocity| FundHelp[LiveFundHelpScreen]
    FundHelp -->|Credits Donated to Pool| RequestDetail
```

---

### Tab 2: Activity & Request Tracking Workflow
```mermaid
flowchart TD
    ActivityList[LiveRequestsScreen / Activity Tab]
    
    ActivityList -->|Filter: All / Active / History| FilterView[Filtered List]
    FilterView -->|Tap Request Card| Detail[LiveRequestDetailScreen]
    
    Detail -->|Before Match| CancelAction[Cancel Request]
    Detail -->|During Visit| SafetyPanel[Visit Safety & Emergency Alert]
    Detail -->|If Issue Occurs| ReportProblem[_ProblemDialog -> Coordinator Report]
    Detail -->|After Completion| ConfirmHelp[Confirm Reported Hours Dialog]
```

---

### Tab 3: Account, Profile & Governance Workflow
```mermaid
flowchart TD
    Profile[LiveProfileScreen / Account Tab]
    
    Profile -->|Edit Display Name| NameModal[Inline Name Editor Dialog]
    Profile -->|Tap 'Time credit history'| CreditHistory[LiveCreditHistoryScreen]
    Profile -->|Tap 'Local loyalty coins'| Loyalty[LiveLoyaltyScreen]
    Profile -->|Tap 'Complaints'| Complaints[LiveComplaintsScreen]
    Profile -->|Tap 'Your nominee'| Nominee[LiveNomineeScreen]
    Profile -->|Tap 'Membership details'| Member[LiveMemberScreen]
    Profile -->|Adjust Reading Size| TextScale[Persisted Text Size Scaler]
    Profile -->|Sign Out| WelcomeScreen[WelcomeScreen]

    CreditHistory -->|Tap 'Give credits'| GiveCredits[LiveGiveCreditsScreen]
    GiveCredits -->|Choose Member or Pool| TransferModal[Confirmation Dialog -> Ledger Updated]
    
    Loyalty -->|Redeem Merchant Offer| RedemptionVoucher[Live PIN Voucher + Countdown Timer]
    Loyalty -->|Download Milestone Proof| CertificatePdf[Signed PDF Certificate Download]
    
    Complaints -->|Lodge New Grievance| ComplaintForm[Lodge Complaint Dialog]
    Complaints -->|Contest Committee Outcome| AppealForm[Challenge Decision / Appeal Dialog]
    
    Nominee -->|Add or Change Nominee| NomineeOTP[Phone Proof OTP Verification Dialog]
    Nominee -->|Delete Nominee| NomineeRemoveOTP[Confirm Removal OTP Dialog]
    
    Member -->|Submit Verification Proof| DocSubmit[Document Storage Key Reference Form]
```

---

## 5. Offline & Background Resiliency Workflows

These workflows operate independently across all member screens:

```mermaid
flowchart LR
    MemberAction[Volunteer Check-in / Check-out / SOS Alert] --> ConnectionCheck{Device Online?}
    
    ConnectionCheck -->|Yes| ApiServer[Dispatched Directly to Backend API]
    ConnectionCheck -->|No| LocalVault[Saved to Secure Offline Vault]
    
    LocalVault --> OutboxBanner[Offline Banner Appears in App Bar]
    OutboxBanner -->|Tap Banner| OutboxScreen[LiveOutboxScreen]
    
    OutboxScreen -->|Network Restores or 'Send Now' Tapped| FifoSync[FIFO Queue Synchronizer]
    FifoSync --> ApiServer
```

---

## 6. Summary: Complete Screen Order & Priority

| Priority / Stage | Screen Name | Class Name | Triggered By |
|---|---|---|---|
| **0. Error Guard** | Reconnect Screen | `_ReconnectScreen` | Failed session restoration handshake |
| **1. First Launch** | Welcome Screen | `WelcomeScreen` | Cold app launch (no session) |
| **2. Auth Entry** | Sign In / Login Screen | `LiveSignInScreen` | Welcome screen buttons |
| **3. Registration** | Join Community Wizard | `LiveJoinScreen` | First-time user after OTP verification |
| **4. Account Gate** | Membership Status Screen | `LiveMembershipScreen` | Logged in user pending verification/approval |
| **5. Migration Gate** | Phone Recovery Screen | `LivePhoneRecoveryScreen` | Account phone swap initiated by coordinator |
| **6. Main Shell** | Reference Navigation Shell | `LiveReferenceShell` | Approved active member root |
| **7. Dashboard** | Member Home Screen | `LiveHomeScreen` | Shell Tab 0 |
| **8. Discovery** | Service Catalogue Screen | `LiveCatalogueScreen` | Shell Tab 1 or *"Find Help"* tile |
| **9. Booking** | Service Request Form | `LiveRequestFormScreen` | Tapping service from catalogue |
| **10. Booking Review**| Request Review Screen | `LiveReviewRequestScreen` | Submitting booking form |
| **11. Pipeline** | Requests List Screen | `LiveRequestsScreen` | Shell Tab 2 or *"My Requests"* tile |
| **12. Operations** | Request Detail Screen | `LiveRequestDetailScreen` | Tapping any request item card |
| **13. Reciprocity** | Fund Help Screen | `LiveFundHelpScreen` | Voluntary credit gift on completed request |
| **14. Volunteer** | Volunteer Commitments Screen | `LiveVolunteerScreen` | Shell Tab 0 *"Give Time"* tile |
| **15. Wallet** | Credit History Screen | `LiveCreditHistoryScreen` | Tapping balance card on Home or Profile |
| **16. Peer Transfer**| Give Credits Screen | `LiveGiveCreditsScreen` | *"Give credits"* button inside Wallet screen |
| **17. Account** | Profile & Settings Screen | `LiveProfileScreen` | Shell Tab 3 |
| **18. Credential** | Member ID & Documents | `LiveMemberScreen` | *"Membership"* tile on Home or Profile |
| **19. Rewards** | Loyalty & Merchant Coins | `LiveLoyaltyScreen` | *"Local loyalty coins"* tile in Profile |
| **20. Security** | Nominee Management | `LiveNomineeScreen` | *"Your nominee"* tile in Profile or Home alert |
| **21. Governance** | Complaints & Disputes | `LiveComplaintsScreen` | *"Complaints"* tile in Profile |
| **22. Municipal** | Ward NOC Screen | `LiveNocScreen` | NOC alert banner on Home or Membership |
| **23. System** | Offline Outbox Screen | `LiveOutboxScreen` | Tapping offline banner when actions are queued |

