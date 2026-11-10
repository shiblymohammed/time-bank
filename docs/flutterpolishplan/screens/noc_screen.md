# Ward NOC Screen (`LiveNocScreen`)

## Purpose
Facilitates the mandatory local municipal Ward No Objection Certificate (NOC) requirement. Allows members to identify their specific ward, look up their designated ward councilor/representative, and upload photo/PDF documentation proving residence or authorization.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"Your ward NOC"*.
  - Vertical sequence of components:
    - Ward selector dropdown.
    - Ward representative contact panel.
    - Current NOC verification status card.
    - Media upload action buttons (Camera capture or File selector).

---

## Content & Components Breakdown

### 1. Municipal Ward Selector
- Dropdown menu of all wards within the community's municipality.
- Selecting a ward updates the user's membership locality in the database.

### 2. Ward Representative Info Panel
- Name and designation of the ward councilor / representative (`wardRepresentative`).
- Municipal office physical address and visiting hours.

### 3. NOC Verification Status
Displays status badge:
- `PENDING_UPLOAD`: Certificate not yet submitted.
- `IN_REVIEW`: Uploaded file awaiting coordinator validation.
- `APPROVED`: Verified certificate on file.
- `REJECTED`: File declined (with coordinator re-upload notes).

### 4. Upload Controls & Constraints
- Maximum file size limitation: 5 MB.
- Supports native camera capture or image/PDF document picker.

---

## Action Buttons & Upload Triggers
1. **"Take a photo" Button:** Launches device camera to capture certificate.
2. **"Choose a file" Button:** Opens system document picker to select an existing PDF or image.
3. **"Save Ward" Trigger:** Commits selected municipal ward to the server.

