# Membership Gate Screen (`LiveMembershipScreen`)

## Purpose
Acts as the intermediate security and status checkpoint for signed-in members who are not yet approved, under review, suspended, revoked, or subject to account-level restrictions. Prevents unauthorized access to operational time-banking features while clearly explaining why access is currently held.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` with an app bar showing title *"Your membership"* and badge icon.
  - Multi-state view branching based on account condition:
    - **Restricted / Suspended State**
    - **Pending Phone Recovery State**
    - **Under Review / Applied State**
    - **Rejected / Needs Attention State**
  - Vertical list of informational cards, status indicators, orientation checkboxes, and administrative actions.

---

## Content & Status Variants

### 1. Account Restricted State
- **Information Panel:** Explains that the member cannot give or request help and needs to contact their coordinator.
- **`RestrictionNotices`:** Displays detailed policy or penalty notices if the account has limitations.
- **Action Buttons:**
  - *"Check status"* (Outlined button to refresh profile).
  - *"Log out"* (Text button).

### 2. Application In-Review State
- **Organization Switcher (if multi-chapter):** Dropdown selector allowing the user to view other memberships if associated with multiple organizations.
- **Feature Status Card:**
  - Icon: Hourglass or status badge.
  - Heading: *"Your application is in review"*.
  - Detail: Explains that local coordinators review each submission and may contact the applicant.
- **Progress Line:** Shows stages (`Applied` $\rightarrow$ `Under Review` $\rightarrow$ `Orientation` $\rightarrow$ `Approved`).
- **Contact Coordinator Panel:** Phone and email details for the community coordinator handling the review.
- **Orientation / Preparation Checklist:** Step items or documents new members can read while waiting.

### 3. Application Rejected / Action Needed State
- **Alert Banner:** Warning message explaining why the application was declined or needs modifications.
- **"Update Application" Button:** Re-opens the application form with pre-filled fields.

---

## Action Buttons & Controls
1. **"Check status" Button:**
   - Triggers an immediate API profile refresh to check if approval has been granted.
2. **"Update Application" Button (if rejected):**
   - Launches `LiveJoinScreen` in edit mode.
3. **"Contact Coordinator" Call / Message Buttons:**
   - Initiates a direct dial or email action to the chapter's coordinator.
4. **"Log out" Action Button:**
   - Clears credentials and returns to `WelcomeScreen`.

