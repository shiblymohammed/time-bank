# Step 0: Intent Selection Screen ("How would you like to get started?")

## Purpose
The first interactive step of the member onboarding wizard (`LiveJoinScreen`). It captures the user's high-level intent within the Time Bank ecosystem—whether they want to give time (volunteer), receive assistance (help & support), or participate in both reciprocal capacities.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built inside `AppPage` with step progress indicator (`StepProgress(step: 1, of: 5)`).
  - Navigation header with top back button (`<-`) and progress line.
  - Centered vertical stack of action choice cards (`ChoiceCard`).
  - Warning notice panel at the bottom for members switching phone numbers.
  - Sticky bottom action row with **"Continue"** button.

---

## Content & Components Breakdown

### 1. Header & Step Indicator
- **Progress Line:** 5-step indicator showing Step 1 active.
- **Title:** *"How would you like to get started?"* (in codebase: *"What would you like to do?"*).
- **Subtitle:** *"You can give time, request help, or do both."*

### 2. Selection Cards (`ChoiceCard`)
1. **"I want to help others" / "I want to help"**
   - **Icon / Visual:** Volunteer illustration / `Icons.volunteer_activism_outlined`.
   - **Subtitle:** *"Volunteer, share skills and support my community."* (or *"Give an hour of your time and earn an hour of time credit."*).
   - **Selection Value:** `intent = 'VOLUNTEER'`.
   - **Navigation indicator:** Right arrow icon (`->`).

2. **"I need help & support" / "I need help"**
   - **Icon / Visual:** Beneficiary illustration / `Icons.favorite_border`.
   - **Subtitle:** *"Get support for myself or my family."* (or *"Ask volunteers for help, for you or someone you care for."*).
   - **Selection Value:** `intent = 'HELP'`.
   - **Navigation indicator:** Right arrow icon (`->`).

3. **"I want to do both"**
   - **Icon / Visual:** Reciprocal community illustration / `Icons.sync_alt_outlined`.
   - **Subtitle:** *"Give time and also request help when needed."*
   - **Selection Value:** Sets combined volunteer & beneficiary interest.

### 3. Existing Member Warning Notice (`Panel`)
- Text: *"Already a member, with an old number? Do not apply again. Ask your coordinator to move your account to this number."*
- Prevents creating duplicate orphan accounts after SIM swaps.

---

## Action Buttons & State Controls
1. **Selection Tap:** Selecting any card highlights the card and sets `intent`.
2. **"Continue" Button (`PrimaryAction`):**
   - Enabled when an option is selected.
   - Advances to **Step 1: Choose your community**.
3. **"Back" Button:** Returns to sign-in / welcome screen.
4. **"Log out" Button:** Clears session and returns to `WelcomeScreen`.
