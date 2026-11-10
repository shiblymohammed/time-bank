# Account Profile Screen (`LiveProfileScreen`)

## Purpose
Provides the overarching account overview, settings, preferences, chapter affiliations, and links into sub-modules (such as Wallet, Loyalty, Disputes, Nominee management, and Accessibility text-scaling).

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"Profile"*.
  - Vertical sequence of cards, action tiles, preference sliders, and account management buttons:
    - User Identity Card.
    - Mini Balance Card.
    - Navigation Action Tiles.
    - Text Accessibility Slider (`TextSizeSettings`).
    - Chapter Memberships Overview.
    - Administrative Action Buttons (Sync, Logout).

---

## Content & Components Breakdown

### 1. Identity & Verification Card (`Panel`)
- Large user icon badge / profile avatar.
- Member full name and registered E.164 phone number.
- Account status tag (`Account active`, `Account suspended`, etc.).
- Government/Physical identity verification status pill (`ID verified in person`, `Pending ID check`).

### 2. Time Credit Overview Card (`BalanceCard`)
- Displays current balance and holds with note explaining separation of Time Credits and local merchant coins.

### 3. Action Navigation Tiles (`ActionTile`)
1. **"Your name" Tile:** Allows inline correction or addition of user's display name.
2. **"Time credit history" Tile:** Launches `LiveCreditHistoryScreen`.
3. **"Local loyalty coins" Tile:** Launches `LiveLoyaltyScreen`.
4. **"Complaints" Tile:** Launches `LiveComplaintsScreen`.
5. **"Your nominee" Tile:** Launches `LiveNomineeScreen`.
6. **"Membership details" Tile:** Launches `LiveMemberScreen`.

### 4. Accessibility / Reading Settings (`TextSizeSettings`)
- Text font scaling slider with real-time preview (Small, Normal, Large, Extra Large). Persisted in local secure store.

### 5. "Your communities" Section
- List of cards detailing every chapter/organization the member is enrolled in, showing chapter name, approval status, and granted roles (`BENEFICIARY`, `VOLUNTEER`, `CAREGIVER`).

---

## Action Buttons & System Operations
1. **"Refresh Profile" Button:** Outlined button fetching latest server profile and membership permissions.
2. **"Sign out" Button:** Destructive text/outlined action clearing local session vault and returning to `WelcomeScreen`.

