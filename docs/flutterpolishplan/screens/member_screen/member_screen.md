# Member ID & Documents Screen (`LiveMemberScreen`)

## Purpose
Displays the member's official Time Bank membership credentials, unique membership number, granted community roles, and provides an interface for submitting verification document references (such as government ID tokens or ward letters) to community coordinators.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"Your membership"*.
  - Membership Credential Card (`Panel`).
  - Document Reference Submission Form.
  - Organization contact and guidelines references.

---

## Content & Components Breakdown

### 1. Membership Credential Card (`Panel`)
- Verified badge icon.
- Congratulatory title: *"You're part of the community."*
- Community chapter name (e.g., *"Kottakkal Time Bank"*).
- Membership Number line: e.g., *"Membership number MEM-1042"*.
- Active Roles line: e.g., *"Volunteer, Caregiver"*.

### 2. Supporting Documents Submission Section
- **Contextual Note:** Explains that document proofs (e.g., Aadhaar / Voter ID / Ward letter) are verified via storage reference keys by coordinators for privacy.
- **Document Type Dropdown:**
  - *"Government identity card"*
  - *"Letter from your ward"*
  - *"Proof of residence"*
- **Storage Reference / Key Input Field:**
  - Text field accepting the reference number or document token provided during document handoff.

---

## Action Buttons & Validation
1. **"Send document reference" Button (`PrimaryAction`):**
   - Validates non-empty reference string.
   - Posts document token to `/api/memberships/{id}/documents`.
   - Clears input and shows confirmation snackbar upon successful delivery.

