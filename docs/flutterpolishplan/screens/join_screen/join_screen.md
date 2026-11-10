# Join Community Wizard (`LiveJoinScreen`)

## Purpose
Guides a new or transferring member through a 5-step onboarding wizard. Gathers intent (volunteering vs requesting help), target organization/chapter, municipal ward, availability/skills, personal legal name, and final confirmation before sending the application to community coordinators for approval.

---

## Architecture: Wizard Steps Breakdown

The `LiveJoinScreen` is implemented as an animated multi-step wizard (`StepProgress(step: n, of: 5)`). Rather than pushing separate navigation routes, each step renders within this shell, updating the step index in response to the user's choices.

Each step has its own detailed breakdown file in its dedicated subfolder:

1. **[Step 0: Intent Selection ("How would you like to get started?")](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/join_screen/step_0_intent/step_0_intent.md)**
   - Capture high-level motivation: *"I want to help others"*, *"I need help & support"*, or *"I want to do both"*.
   - Includes legacy account reminder for users who changed SIM cards.

2. **[Step 1: Community Selection ("Choose your community")](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/join_screen/step_1_community/step_1_community.md)**
   - Searchable list of local Time Bank chapters / organizations.
   - Automatically selected if only 1 organization exists.

3. **[Step 2: Ward Selection ("Choose your ward")](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/join_screen/step_2_ward/step_2_ward.md)**
   - Selection of local municipal ward and display of the assigned ward councilor / representative.
   - Sets the target office for the required No Objection Certificate (NOC).

4. **[Step 3: Details & Preferences ("Tell us a little more")](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/join_screen/step_3_details/step_3_details.md)**
   - **For Volunteers:** Travel radius slider, short-notice toggle, free days/times chips, skill preferences tags.
   - **For Help Seekers:** Recipient selection (*"For me"* or *"For someone I care for"*).
   - Optional notes field.

5. **[Step 4: Review & Send ("Check and send")](file:///c:/Users/shibi/Documents/dev/TIMEBANK/docs/flutterpolishplan/screens/join_screen/step_4_review/step_4_review.md)**
   - Legal full name input.
   - Consolidated summary panel of all selected attributes.
   - Final **"Send application"** button that registers the application and forwards the user to `LiveMembershipScreen`.

---

## Action Buttons & Wizard Controls
- **"Continue" Button (`PrimaryAction`):** Advances forward after validating that required inputs for the current step have been provided (`blocker` checks).
- **"Send application" Button (Final Step):** Dispatches POST request to `/api/organizations/{orgId}/memberships/apply`.
- **"Back" Button:** Reverts to the previous step.
- **"Log out" Button:** Clears session and returns to `WelcomeScreen`.
