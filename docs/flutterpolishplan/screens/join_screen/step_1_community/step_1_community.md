# Step 1: Community Selection Screen ("Choose your community")

## Purpose
Enables new applicants to select which local Time Bank organization or municipal chapter they wish to join. Coordinators from the chosen community will be responsible for reviewing the application, verifying identity, and activating membership.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built within `LiveJoinScreen` wizard framework.
  - Step progress indicator (`StepProgress(step: 2, of: 5)`).
  - Search input field (automatically displayed when more than 4 organizations are available).
  - Scrollable vertical list of organization cards (`ChoiceCard`).
  - Bottom action bar with "Continue" and "Back" navigation buttons.

---

## Content & Components Breakdown

### 1. Header & Guidance
- **Title:** *"Choose your community"*.
- **Icon:** `Icons.place_outlined`.
- **Subtitle / Guidance:** *"Your community’s coordinators review your application."*

### 2. Search Field (Conditional)
- Text field with label: *"Search by name or district"*.
- Filters organization names and geographic districts in real time.

### 3. Community Selection Cards (`ChoiceCard`)
A list of available organizations loaded dynamically from `/api/organizations`:
- **Title:** Organization name (e.g., *"Kottakkal Time Bank"*, *"Malappuram Chapter"*).
- **Subtitle / Body:** District or locality (e.g., *"Malappuram District"* or *"Community"*).
- **Selection State:** Radio/checkmark indicator showing the currently active selection.
- **Selection Action:** Tapping updates `organization = o['id']`.

### 4. Empty States
- If no organizations exist: *"No communities yet — No community is taking new members right now. Try again later."*
- If search returns 0 matches: *"No match — Try a different name or district."*

---

## Action Buttons & Validation
1. **"Continue" Button (`PrimaryAction`):**
   - Validates that an organization is selected (`organization != null`).
   - Fetches the municipal wards for the selected organization via `/api/organizations/{id}/wards`.
   - Advances to **Step 2: Choose your ward** (or automatically skips to Step 3 if the chosen organization has no configured wards).
2. **"Back" Button:** Reverts wizard back to **Step 0: Intent**.
