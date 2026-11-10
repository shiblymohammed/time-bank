# Requests List Screen (`LiveRequestsScreen`)

## Purpose
Displays a filterable history and active pipeline of all service requests submitted by or on behalf of the member. Allows monitoring progress from matching through to completion.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"My requests"* and subtitle *"Your requests and updates"*.
  - Top filter chips bar (`ChoiceChip` row).
  - Vertically scrolling list of request cards (`Panel`).
  - Pagination controls footer (Previous / Next page buttons if item count exceeds page size).

---

## Content & Components Breakdown

### 1. Status Filter Bar
Three interactive filter chips:
- **"All" Chip:** Shows all historical and pending service requests.
- **"Active" Chip:** Filters for unfulfilled or ongoing requests (`SUBMITTED`, `MATCHED`, `IN_PROGRESS`).
- **"History" Chip:** Filters for completed, cancelled, or closed requests (`COMPLETED`, `CANCELLED`).

### 2. Request Card (`Panel`)
Each request item displays:
- **Service Name:** Title of requested service (e.g., *"Companionship & Reading"*).
- **Status Pill (`LiveStatusPill`):** Visual badge indicating current workflow lifecycle (`SUBMITTED`, `BROADCASTED`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`).
- **Schedule Time:** Formatted start date and time.
- **Reference Identifier:** Unique human-readable request code (e.g., *"Request REQ-2026-089"*).

### 3. Empty & Loading States
- Shows `EmptyState` with helper message when no requests match the chosen filter.
- Shows `LinearProgressIndicator` when fetching updates from the server.

### 4. Pagination Footer
- If total records exceed 20 items:
  - "Previous page" button.
  - Page counter label (e.g., *"Page 1 of 4"*).
  - "Next page" button.

---

## Action Buttons & Navigation Triggers
1. **Filter Chip Selection:** Filters in-memory/retrieved items.
2. **Request Card Tap:** Opens `LiveRequestDetailScreen` for the selected request.
3. **Pagination Buttons:** Increments/decrements page counter and reloads data.

