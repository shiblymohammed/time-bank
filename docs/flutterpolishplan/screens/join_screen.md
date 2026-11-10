# Join Community / Onboarding Screen (`LiveJoinScreen`)

## Purpose
Guides a new or transferring member through a multi-step registration wizard. Gathers intent (volunteering vs requesting help), target organization/chapter, municipal ward, availability/skills, personal details, and final confirmation before sending the application to community coordinators for approval.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Scaffold containing an `AppPage` with custom back navigation handling step rollback.
  - Step progress indicator bar showing current position across 5 wizard stages:
    1. Intent Selection
    2. Community / Organization Selection
    3. Ward / Neighborhood Selection
    4. Details & Availability (or Recipient Category)
    5. Check & Send (Summary Review)
  - Scrollable content body with dynamic form controls, card selectors, and chip grids.
  - Fixed or sticky bottom navigation bar hosting "Back" and "Next" / "Submit" actions.

---

## Content & Steps Breakdown

### Step 1: "What would you like to do?" (Intent Selection)
- **Header:** Title and descriptive subtitle about mutual exchange.
- **Selection Cards (`ChoiceCard`):**
  - **Option A: "I want to volunteer & help others"** (Hands/heart icon, description).
  - **Option B: "I or my family need help & support"** (People/support icon, description).

### Step 2: "Choose your community" (Organization)
- **Header:** Organization selection instructions.
- **List of Available Organizations:** Radio card list of participating local time banks/chapters with locations.

### Step 3: "Choose your ward" (Locality / Ward)
- **Search Bar:** Ward filter input field (`search`).
- **Ward List:** Selectable cards for local municipal wards/sectors loaded dynamically from the backend for the chosen community.

### Step 4: "Tell us a little more" (Details & Preferences)
- **For Volunteers:**
  - **Availability Days:** Multi-select chips for days of the week (Monday through Sunday).
  - **Preferred Time Slots:** Multi-select chips (Morning, Afternoon, Evening).
  - **Travel Radius Slider:** Slider adjusting volunteer travel distance limit (km).
  - **Short Notice Help Toggle:** Switch/checkbox for emergency or short-notice requests.
  - **Skill Preferences:** Selectable skill tags fetched from the community catalog.
- **For Help Seekers:**
  - **Recipient Selection:** Options indicating if assistance is for self, senior parent, person with illness/disability, or child.
- **Common Details:**
  - Full Name text input.
  - Additional Notes / Introduction multiline text area.

### Step 5: "Check and send" (Review & Confirmation)
- **Review Panels:** Structured summary cards displaying selected intent, community, ward, name, and preferences.
- **Consent Notice:** Information confirming local coordinator review and community charter adherence.

---

## Action Buttons & Controls
1. **"Back" Button:**
   - In App Bar or Bottom Bar. Reverts to the previous wizard step or exits if on step 0.
2. **"Next" / "Continue" Button:**
   - Validates required selections for the active step (`blocker` checks) and advances forward.
3. **"Send Application" / "Submit" Button (Final Step):**
   - Posts registration payload to `/api/memberships` and transitions to `LiveMembershipScreen`.

