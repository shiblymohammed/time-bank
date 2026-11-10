# Nominee Management Screen (`LiveNomineeScreen`)

## Purpose
Enables a member to appoint, modify, or remove a designated beneficiary/nominee who inherits their accumulated Time Credits upon death or permanent incapacitation. Features high-security step-up verification (OTP sent to user's registered phone) before any changes or removals can be executed.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"Your nominee"*.
  - Educational legal explanation outlining the inheritance verification protocol.
  - Active Nominee Information Card (if designated) or Empty State Prompt.
  - Action buttons triggering 2-phase step-up security dialogs.

---

## Content & Components Breakdown

### 1. Educational & Inheritance Policy Notice
- Explains that upon death, staff verify identity before releasing frozen credits.
- Explains that changes require phone OTP confirmation to prevent unauthorized tampering on unlocked devices.

### 2. Active Nominee Card (When Assigned)
- Nominee Full Name.
- Nominee Registered Phone Number (masked/formatted).
- Designation Date & Verification Status.

### 3. Step-Up Verification Flows
1. **Nomination Dialog Phase 1:** Collects nominee full name and phone number.
2. **Security Verification Phase 2:** Sends OTP to the member's authenticated device to sign the nomination request (`_nomineePath`).

---

## Action Buttons & Dialog Triggers
1. **"Name someone" / "Change your nominee" Button:** Opens the nomination dialog flow.
2. **"Remove nominee" Button:** Sends OTP verification prompt and permanently deletes the designation upon confirmation.

