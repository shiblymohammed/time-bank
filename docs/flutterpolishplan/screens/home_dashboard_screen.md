# Member Dashboard Screen (`LiveHomeScreen`)

## Purpose
The primary home screen rendered for an approved member. Presents an overview of the member's account status, universal time credit wallet balance, rapid one-tap navigation tiles to core workflows, reminders (such as nominee or profile completion), and a summary of active or upcoming commitments.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with top title *"Welcome back"* and subtitle stating current organization/chapter name.
  - Pull-to-refresh data reloading.
  - Responsive multi-column grid layout for quick action tiles (2 columns on mobile, 4 on tablet/desktop).
  - Vertical stack of status banners, balance cards, quick actions grid, and active request cards.

---

## Content & Components Breakdown

### 1. Header & Profile Prompts
- **Greeting & Community Name:** Dynamic welcome text referencing current active chapter.
- **Organization Switcher (if multi-chapter):** Dropdown menu to change current organization context.
- **Action Prompts:**
  - "Add your full name" action tile (if incomplete profile).
  - "Name Nominee Again" reminder tile (if nominee requires update).
  - "No Objection Certificate" (NOC) transfer tile (if transferring chapters).

### 2. Time Credit Wallet Card (`BalanceCard`)
- **Available Balance:** Big numeric display of available Time Credits (hours/minutes).
- **Credits on Hold:** Shows credits currently escrowed for active pending commitments.
- **Interactive Action:** Tap gesture opens the full `LiveCreditHistoryScreen`.

### 3. Quick Actions Grid (`QuickAction`)
Role-aware 2x2 or 4x1 grid of shortcut tiles:
1. **"Find Help" Tile:** (For Beneficiary/Caregiver roles) Opens `LiveCatalogueScreen`.
2. **"My Requests" Tile:** Opens `LiveRequestsScreen`.
3. **"Give Time" Tile:** (For Volunteer roles) Opens `LiveVolunteerScreen`.
4. **"Membership" Tile:** Opens member profile card (`LiveMemberScreen`).

### 4. Active Commitment / Next Task Card
- Displays the immediately upcoming active request (if any) with:
  - Title and category icon.
  - Scheduled date & time badge.
  - Participant name & status chip (`MATCHED`, `IN_PROGRESS`).
  - Tap gesture opening `LiveRequestDetailScreen`.

---

## Action Buttons & Navigation Triggers
1. **Wallet Card Tap:** Routes to `LiveCreditHistoryScreen`.
2. **"Find Help" Tap:** Routes to `LiveCatalogueScreen`.
3. **"My Requests" Tap:** Routes to `LiveRequestsScreen`.
4. **"Give Time" Tap:** Routes to `LiveVolunteerScreen`.
5. **"Membership" Tap:** Routes to `LiveMemberScreen`.
6. **Active Request Card Tap:** Routes to `LiveRequestDetailScreen`.

