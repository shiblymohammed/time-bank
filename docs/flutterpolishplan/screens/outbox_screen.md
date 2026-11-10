# Offline Outbox Screen (`LiveOutboxScreen`)

## Purpose
Provides a transparent viewer and sync manager for all mutations (check-ins, check-outs, hours logged, safety notifications) captured on the device while offline or under intermittent network conditions. Guarantees that actions are dispatched in strict FIFO sequence when connectivity is restored.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"Waiting to send"* and cloud upload icon.
  - Offline status alert banner.
  - Immediate manual sync action button ("Send now").
  - List of queued outbox cards (`card`).
  - Empty state when queue is fully synchronized.

---

## Content & Components Breakdown

### 1. Offline Header Notice
- Informs the user when the app was last online: *"Offline: showing what you had at [time]"*.
- Safety warning if an emergency SOS event is waiting in queue: *"Your coordinator has not been told yet. In immediate danger, call 112."*

### 2. Queued Item Cards (`card`)
Each queued mutation displays:
- **Action Label:** Clear description of the operation (e.g., *"Started visit for Companionship"*).
- **Status Chip (`StatusChip`):**
  - `Waiting`: Stored in local vault, awaiting internet signal.
  - `Sent`: Successfully acknowledged by backend.
  - `Refused`: Rejected by server (e.g., conflicting schedule or validation error).
- **Action Type & Original Tap Timestamp:** Exact local time the member performed the action.
- **Server Reason (If Refused):** Detailed explanation why the action was rejected.

---

## Action Buttons & Triggers
1. **"Send now" Button (`PrimaryAction`):**
   - Manually forces an immediate outbox synchronization attempt (`store.syncNow`).
2. **"Remove from this list" Button (On refused items):**
   - Dismisses an unresolvable or rejected item from the local queue (`store.outbox.dismiss`).

