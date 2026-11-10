# Service Catalog Screen (`LiveCatalogueScreen`)

## Purpose
Enables members (beneficiaries, caregivers, or proxies) to browse, search, and discover the community's catalog of available services and support activities. Members can choose whom they are requesting for and initiate a service request directly from a catalog entry.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"How can we help?"* and subtitle *"Free community help"*.
  - Vertical layout with:
    - Recipient selector dropdown (if user manages caregiver authorizations).
    - Search input field.
    - Horizontally scrollable category filter chips.
    - Vertically scrolling list/grid of service cards.

---

## Content & Components Breakdown

### 1. Recipient Selector (Caregiver / Beneficiary Context)
- Dropdown menu allowing selection between:
  - *"Myself"* (Own beneficiary account).
  - *"Member [ID]"* (Authorized dependents/seniors assigned to this caregiver).

### 2. Search & Category Filters
- **Search Field:** Text input with search icon and clear button, filtering service titles, descriptions, and keywords in real-time.
- **Horizontal Category Filter Bar:** Selectable filter chips (`All`, `Companionship`, `Elder Care`, `Home Support`, `Tutoring`, `Errands`, etc.).

### 3. Service Cards List
Card for each catalog item containing:
- Service title and localized description.
- Category tag / badge.
- Estimated standard duration / credit requirement indicator.
- Arrow icon indicating tap target.

### 4. Empty State
- Displays an empty state banner if no services match search criteria, or if the user has no registered beneficiary recipient profile.

---

## Action Buttons & Navigation Triggers
1. **Search Input & Clear Button:** Updates query filter on typing.
2. **Category Chip Tap:** Toggles category filter.
3. **Service Card Tap:** Selects the service and recipient, navigating forward to `LiveRequestFormScreen`.

