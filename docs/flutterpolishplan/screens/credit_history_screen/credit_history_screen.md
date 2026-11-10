# Time Credit Wallet Screen (`LiveCreditHistoryScreen`)

## Purpose
Acts as the member's financial ledger for Time Credits. Displays universal wallet balances, holds/escrows, and chronological transaction history (credits earned via volunteering, spent on help, gifted to peers, or donated to the community hours pool).

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"Time Credits"* and icon `account_balance_wallet_outlined`.
  - Top aggregate balance card (`BalanceCard`).
  - Action shortcut row ("Give credits" to peer).
  - Chronological transaction feed of credit cards (`Panel`) ordered newest first.
  - Infinite scroll / "Load more transactions" pagination footer.

---

## Content & Components Breakdown

### 1. Wallet Balance Hero Card (`BalanceCard`)
- **Total Available Credits:** Displayed in prominent numerical typography.
- **Credits On Hold / Escrow:** Explains any credits locked for pending requests or under dispute review (`FRAUD_HELD`, active service escrow).
- **Wallet Status:** Active, locked, or restricted indicator.

### 2. Transaction List Entries
Each transaction item displays:
- **Transaction Title:** Descriptive headline (`"Volunteered help"`, `"Help received"`, `"Donation sent"`, `"Donation received"`).
- **Amount Badge:** Positive or negative formatted credit amount (e.g., `+2.00 credits`, `-1.50 credits`).
- **Duration Reference:** Exact recorded minutes (e.g., `"90 minutes of help"`).
- **Associated Chapter / Community:** Name of the contributing or receiving organization.
- **Associated Request ID:** Link to the specific service request (if service-related).
- **Notes:** Optional transfer message or donation note.
- **Timestamp:** Formatted transaction date and time.
- **Hold Status Warnings:** Displays shield icon if amount is currently held pending administrative review.

---

## Action Buttons & Navigation Triggers
1. **"Give Credits" Button:**
   - Positioned beneath wallet summary. Launches `LiveGiveCreditsScreen` to initiate a peer transfer.
2. **"Load more transactions" Button:**
   - Appears at the bottom of the ledger when pagination has additional pages available.
3. **Transaction Item Tap:**
   - Navigates to linked request details (if transaction references a service request).

