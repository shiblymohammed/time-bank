# Service Request Form Screen (`LiveRequestFormScreen`)

## Purpose
Collects the scheduling, location, safety considerations, and specialized requirements needed to book a specific service from the catalog.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"Request details"*.
  - Scrollable `Form` containing organized form sections:
    - Service Overview & Local Guidelines.
    - Date & Time Picker Tile.
    - Service Location Fields (Address, Ward, Landmark, Pincode).
    - Special Notes & Instructions Field.
    - Submit / Review Navigation Button.

---

## Form Content & Controls

### 1. Service Context Header
- Displays selected service name, standard duration, and organization policies/guidelines (`instructions`).
- Target recipient summary (`recipient.label`).

### 2. Date & Time Selection
- **Interactive Schedule Tile:**
  - Displays formatted date and start time (e.g., *"Friday, Nov 14 at 10:00 AM"*).
  - Tapping opens native Material `showDatePicker` followed by `showTimePicker`.
  - Date limit: restricted between today and 90 days in advance.

### 3. Location & Address Fields
- **Street Address:** Multiline text field for street, house number, or building name.
- **Ward / Neighborhood:** Text field pre-populated with member's registered ward.
- **Landmark:** Optional text field for directions.
- **Postal Code / PIN:** 6-digit numeric input.

### 4. Notes & Special Accommodations
- **Special Instructions / Notes:** Multiline text area for requirements (e.g., accessibility needs, pet on premises, specific language preference).

---

## Action Buttons & Validation
1. **"Pick Date & Time" Action:** Initiates calendar and clock dialogs.
2. **"Review & Submit" Button:**
   - Primary full-width button.
   - Validates form fields (address presence, valid future timestamp).
   - Packages draft request data and pushes to `LiveReviewRequestScreen`.

