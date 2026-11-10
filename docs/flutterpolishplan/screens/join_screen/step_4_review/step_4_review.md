# Step 4: Review & Send Screen ("Check and send")

## Purpose
The final confirmation step of the onboarding wizard (`LiveJoinScreen`). The applicant inputs their legal full name as shown on their government identification, inspects a consolidated summary of their membership choices, and submits their application to chapter coordinators for review.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built within `LiveJoinScreen` wizard framework.
  - Step progress indicator (`StepProgress(step: 5, of: 5)`).
  - Prominent Full Name input field.
  - Comprehensive Summary Card (`Panel`) compiling all selections from Steps 0–3.
  - Coordinator review notice.
  - Bottom action footer featuring the final **"Send application"** button and "Back" button.

---

## Content & Components Breakdown

### 1. Legal Name Input Field
- **Text Field:**
  - Key: `join-full-name`.
  - Label: *"Your full name, as on your ID"*.
  - Helper text: *"Volunteers and coordinators see this name."*
  - Capitalization: Words.
  - Max length: 100 characters.
  - Validation: Requires at least 2 characters.

### 2. Consolidated Summary Card (`Panel`)
Displays a structured key-value list of all selected settings:
- **Requested Role:** e.g., *"Volunteer and give time"*, *"Get help for myself"*, or *"Get help for someone I care for"*.
- **Selected Community:** Organization name.
- **Selected Ward:** Municipal ward number and title.
- **For Volunteers:**
  - Travel limit: e.g., *"Up to 5 km away, at short notice"*.
  - Preferred Days & Times: e.g., *"Days: Mon, Wed, Sat. Times: Morning, Evening."*
  - Skills: Formatted list of selected capability tags.
- **Applicant Notes:** Displays any custom requirements or availability notes entered in Step 3.

### 3. Review Guidance
- Explanatory note:
  *"A coordinator reviews every application and may call you. You can use services once they approve it."*

---

## Action Buttons & Submission Triggers
1. **"Send application" Button (`PrimaryAction`):**
   - Validates name length $\ge 2$ characters.
   - Compiles complete registration JSON payload.
   - Dispatches HTTP POST request to:
     `/api/organizations/{orgId}/memberships/apply`
   - Updates local store session and refreshes member profile.
   - Sets notification: *"Application sent. Next, add the NOC signed by your ward councillor or ward member."*
   - Transitions user immediately into **`LiveMembershipScreen`** (waiting/orientation state).
2. **"Back" Button:** Reverts to **Step 3: Tell us a little more**.
