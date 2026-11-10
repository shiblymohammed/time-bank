# Request Detail Screen (`LiveRequestDetailScreen`)

## Purpose
Provides complete management, tracking, and post-service confirmation for a specific service request. Enables members to inspect matching progress, view assigned volunteers, communicate safety check-in status, report issues, confirm completed hours, and optionally contribute time credits into the community pool.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title reflecting service name or request number.
  - Pull-to-refresh enabled.
  - Multi-card vertical layout organizing:
    - Status & Lifecycle Pill (`LiveStatusPill`).
    - Schedule and Location Panel.
    - Volunteer Assignment Details.
    - Safety & Check-in Tracker (`VisitSafetyPanel`).
    - Post-Service Hour Confirmation Panel.
    - Voluntary Credit Contribution Card (`LiveFundHelpScreen` trigger).
    - Administrative and Cancellation Actions.

---

## Content & Components Breakdown

### 1. Request Summary & Status
- **Status Pill:** Visual stage badge (`SUBMITTED`, `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`).
- **Date, Time & Duration:** Displays scheduled start time and estimated length.
- **Service Address:** Complete physical location where service is performed.
- **Requester Notes:** Instructions or beneficiary requirements submitted during booking.

### 2. Assignment & Volunteer Details (When Matched)
- Volunteer name, profile badge, and contact action.
- Status of assignment acceptance.
- Reschedule notes if volunteer requested a time adjustment.

### 3. Safety Monitoring (`VisitSafetyPanel`)
- Check-in / Check-out timestamps during in-person visits.
- Emergency / safety concern reporting button (`_RaiseAlertDialog`).

### 4. Hour Confirmation & Problem Reporting
- **"Confirm Help Received" Card:**
  - Appears after volunteer reports completed minutes.
  - Prompts member to verify that the reported time was accurate.
  - Dialog modal with confirmation prompt before credits release.
- **"Report a Problem" Dialog (`_ProblemDialog`):**
  - Allows flagging no-shows, incomplete service, or behavioral issues.

### 5. Voluntary Help Funding (`helpFunding()`)
- Appears on completed requests: *"Want to give some of your credits for this help? You do not have to. The help is free."*
- Button opening `LiveFundHelpScreen`.

---

## Action Buttons & Dialogs
1. **"Confirm help was given" Button:** Opens confirmation modal and releases credits to volunteer.
2. **"Report a problem" Button:** Opens issue dialog and notifies community coordinator.
3. **"Cancel request" Button:** Allows withdrawing an open or unfulfilled request.
4. **"Give credits for this help" Button:** Navigates to `LiveFundHelpScreen`.
5. **"Visit Safety" Check-in / SOS Triggers:** Emergency escalation options.

