# Peer Credit Transfer Screen (`LiveGiveCreditsScreen`)

## Purpose
Enables a member to donate or transfer their earned Time Credits directly to another verified community member (by membership number and organization) or to an established Community Donation Pool.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"Give credits"* and subtitle showing current available balance (`"You have X credits to give"`).
  - Form container with input controls, toggle options, and confirmation modal.
  - Sticky primary submission button at the foot of the view.

---

## Content & Form Controls

### 1. Transfer Destination Switcher
- **Toggle Choice:**
  - **Option 1: "To another member"** (Default peer transfer).
  - **Option 2: "To a community pool"** (Pool donation).

### 2. Recipient Inputs (When Transferring to Member)
- **Organization Dropdown:** Selects the recipient member's local chapter or community.
- **Membership Number Input Field:**
  - Text input for recipient's ID (e.g., `MEM-1042`).
  - Validation check ensuring recipient is verified by coordinators.

### 3. Pool Selection (When Donating to Pool)
- **Community Pool Dropdown:** Selects from active registered community relief pools (e.g., *"Emergency Medical Support Pool"*, *"Elderly Care Fund"*).

### 4. Credit Amount & Personal Note
- **Credit Amount Input:**
  - Numeric input field accepting credit amounts (e.g., `1.0`, `0.5`, `2.5`).
  - Validation rule: Must be greater than 0 and cannot exceed current available balance.
- **Personal Note Input:**
  - Optional message or note attached to the gift transaction.

---

## Dialogs & Confirmation
1. **Transfer Confirmation Modal (`AppDialog`):**
   - Triggered when tapping *"Give credits"*.
   - Displays recipient name/pool and warning: *"A gift cannot be taken back."*
   - Buttons: *"Go back"* (Cancel) and *"Yes, give credits"* (Execute).

---

## Action Buttons & Navigation
1. **"Give credits" Button:** Validates fields and triggers confirmation dialog.
2. **"Go back" Dialog Button:** Dismisses dialog without transferring.
3. **"Yes, give credits" Dialog Button:** Posts donation with unique idempotency key to `/api/donations` and returns to `LiveCreditHistoryScreen`.

