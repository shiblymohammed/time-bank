# Step 3: Details & Preferences Screen ("Tell us a little more")

## Purpose
Collects tailored operational parameters based on whether the applicant intends to volunteer their time or request assistance. Volunteers specify mobility radius, availability schedule, and practical skills; help-seekers designate whether support is for themselves or a family dependent.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built within `LiveJoinScreen` wizard framework.
  - Step progress indicator (`StepProgress(step: 4, of: 5)`).
  - Dynamically renders one of two distinct view layouts based on user intent:
    - **Volunteer Branch (`_volunteerStep`)**
    - **Help Seeker Branch (`_helpStep`)**
  - Multi-line notes text area (`_noteField`).
  - Action footer with "Continue" and "Back" buttons.

---

## Content & Branching Breakdown

### Branch A: When Volunteering (`intent == 'VOLUNTEER'`)
1. **Travel Distance Selector:**
   - Section Title: *"How far can you travel?"*
   - Choice Chips: Horizontal options for radius (`1 km`, `3 km`, `5 km`, `10 km`, `20 km`).
2. **Short Notice Help Toggle:**
   - Switch Tile: *"I can help at short notice"*.
   - Subtitle: *"Coordinators may call you for urgent needs."*
3. **Availability Schedule:**
   - Section Title: *"When are you usually free?"*
   - Days of Week Filter Chips: `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`.
   - Time Slots Filter Chips: `Morning`, `Afternoon`, `Evening`.
4. **Skills & Capabilities:**
   - Section Title: *"What can you do?"*
   - Guidance: *"A coordinator checks each skill before you are matched for it."*
   - Dynamic Skill Tags: Filter chips loaded from backend catalog (e.g., *Companionship*, *Elder Care*, *Gardening*, *Reading*, *Tutoring*).
5. **Additional Notes:**
   - Multiline text field: *"Anything else? (optional)"* (up to 500 characters).

### Branch B: When Requesting Help (`intent == 'HELP'`)
1. **Recipient Selection Cards (`ChoiceCard`):**
   - **Option 1: "For me"**
     - Subtitle: *"I will ask for help for myself."*
     - Sets role: `BENEFICIARY`.
   - **Option 2: "For someone I care for"**
     - Subtitle: *"A coordinator links you to the person you look after."*
     - Sets role: `CAREGIVER`.
2. **Help Description:**
   - Multiline text field: *"What would help? (optional)"* (up to 500 characters).

---

## Action Buttons & Validation
1. **"Continue" Button (`PrimaryAction`):**
   - Validates that help-seekers have selected either Beneficiary or Caregiver role.
   - Advances forward to **Step 4: Check and send**.
2. **"Back" Button:** Reverts to **Step 2: Choose your ward** (or Step 1 if wards were skipped).
