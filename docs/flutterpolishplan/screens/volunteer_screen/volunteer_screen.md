# Volunteer Commitments Screen (`LiveVolunteerScreen`)

## Purpose
The operational hub for volunteer members. Manages incoming service offers, scheduled volunteer assignments, check-in/check-out timers (supporting full offline queuing), emergency safety escalation, completed hours reporting, availability schedule management, and preferred skill sets.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"Volunteering"* and icon `volunteer_activism`.
  - Offline-first mutation capability (`saveVisitChange`).
  - Vertical layout organized into distinct sections:
    - New Assignment Offers (`OFFERED`).
    - Upcoming / In-Progress Visits (`ACCEPTED`, `IN_PROGRESS`).
    - Completed / History Visits.
    - Volunteer Availability & Schedule Settings.
    - Registered Skills & Locality Zones.

---

## Content & Components Breakdown

### 1. New Service Offers (`OFFERED`)
For each newly assigned service opportunity:
- Service name, time, location ward, and requester notes.
- Direct dual action buttons:
  - **"Accept" Button:** Commits to the assignment.
  - **"Decline" Button:** Releases the offer back to coordinators.

### 2. Active & Upcoming Assignments
- Date/time banner with time-until-visit countdown.
- Full beneficiary address, contact notes, and landmark.
- **Offline-capable Visit Actions:**
  - **"Start Visit" Button:** Initiates check-in timestamp (queued locally if no connectivity).
  - **"Finish Visit" Button:** Opens hours/minutes reporting modal.
  - **"Safety / Need Help" Action (`VisitSafetyPanel`):** Immediate emergency alert trigger.

### 3. Time Reporting Modal
- Interactive minute/hour slider or input confirming actual time spent providing assistance.

### 4. Availability & Settings Panels
- **Availability Toggle:** Switch controlling whether the volunteer is currently accepting new requests.
- **Preferred Days & Times:** Checkboxes/chips for weekday and morning/evening slots.
- **Skills & Badges:** List of active skills registered with the chapter coordinator.

---

## Action Buttons & Triggers
1. **"Accept Offer" / "Decline Offer" Buttons:** Responds to new match proposals.
2. **"Start Visit" Button:** Records arrival time.
3. **"Complete Visit" Button:** Opens completion and minutes confirmation dialog.
4. **"Safety" Trigger (`_RaiseAlertDialog`):** Triggers safety assistance alert.
5. **"Save Availability" Button:** Commits updated schedule preferences.

