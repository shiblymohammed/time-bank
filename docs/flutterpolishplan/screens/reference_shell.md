# Reference Shell Screen (`LiveReferenceShell`)

## Purpose
Serves as the primary authenticated root container and navigation backbone for active members. Hosts the persistent bottom navigation bar, manages background data reloads, offline status banners, and renders the 4 core member destination views (Home, Exchange/Services, Requests/Activity, and Profile).

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Scaffold with safe-area handling and a central content column constrained to a max width of 600dp.
  - Pull-to-refresh (`RefreshIndicator`) triggering global live data synchronization (`reload()`).
  - Persistent bottom navigation bar with 4 interactive tabs.
  - Global status banner slot at the top (offline indicator banner, critical error messages, nominee confirmation alerts, and NOC reminders).

---

## The 4 Navigation Tabs

### Tab 0: Home (`home()`)
- Member greeting and community chapter identifier.
- Time credit balance badge and quick wallet access.
- Quick action buttons (Request Help, Offer Skills, Give Credits).
- Active commitments, upcoming appointments, and pending confirmations.
- Notification cards and community announcements.

### Tab 1: Exchange / Services (`exchange()`)
- Service category browser and search input bar.
- Direct entry into the service creation form or service catalog.
- Interactive time duration selector (hour increments).

### Tab 2: Activity / Requests (`requestList()`)
- Tabbed filters (All, Active, In Progress, Completed).
- List of open service requests and volunteer assignments.
- Status cards with coordinator contacts and time remaining.

### Tab 3: Account & Profile (`profilePage()`)
- Compact member profile header with avatar and membership tier.
- Shortcuts to Wallet, Loyalty Rewards, Complaints/Support, Nominee Management, and Community Guidelines.
- Accessibility controls (font size slider).
- Log out action.

---

## Persistent Bottom Navigation Bar
Fixed bottom bar with 4 primary navigation items:
1. **Home Tab:** Home icon + *"Home"* label.
2. **Services / Exchange Tab:** Swap/Compass icon + *"Services"* label.
3. **Activity / Requests Tab:** List/Calendar icon + *"Activity"* label.
4. **Account Tab:** Person/User icon + *"Account"* label.

---

## Global Notification Tiles & Headers
- **`OfflineBanner`:** Appears when device is offline, indicating queued actions.
- **`NameNomineeAgainTile`:** Appears when account nominee needs re-confirmation or renewal.
- **`NocReminderTile`:** Displays prompt if a No Objection Certificate is required for community transfer.
- **Linear Progress Indicator:** Runs along the top edge whenever network syncing is active.

