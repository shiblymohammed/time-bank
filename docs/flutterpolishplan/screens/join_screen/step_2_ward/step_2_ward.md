# Step 2: Ward Selection Screen ("Choose your ward")

## Purpose
Identifies the applicant's specific local municipal ward or neighbourhood sector within their selected community. Setting the correct ward determines local coordinator assignment, local volunteer proximity matching, and designates which municipal councilor/member must issue the applicant's No Objection Certificate (NOC).

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built within `LiveJoinScreen` wizard framework.
  - Step progress indicator (`StepProgress(step: 3, of: 5)`).
  - Informational explanation regarding municipal ward boundaries and the required NOC document.
  - Vertical scrollable list of ward cards (`ChoiceCard`).
  - Action footer with "Continue" and "Back" controls.

---

## Content & Components Breakdown

### 1. Header & Instructions
- **Title:** *"Choose your ward"*.
- **Icon:** `Icons.map_outlined`.
- **Instructional Subtitle:** *"Choose the ward you live in. You will need a NOC (No Objection Certificate) signed by its councillor or ward member."*

### 2. Ward Selection Cards (`ChoiceCard`)
Dynamic list of wards loaded for the selected organization:
- **Title:** Ward number and localized name (e.g., *"Ward 12 - Changuvetty"*).
- **Subtitle / Body:** Assigned ward councilor or elected municipal representative name.
- **Selection State:** Active highlight border or checkmark when selected.
- **Selection Action:** Tapping updates `ward = w['id']`.

---

## Action Buttons & Validation
1. **"Continue" Button (`PrimaryAction`):**
   - Blocker check: Ensures `ward != null` before permitting advance.
   - If user selected volunteer intent: pre-loads skill choices (`/api/catalogue/skills`).
   - Advances forward to **Step 3: Tell us a little more**.
2. **"Back" Button:** Reverts to **Step 1: Choose your community**.
