# Phone Recovery Screen (`LivePhoneRecoveryScreen`)

## Purpose
Guards the account migration workflow when a member has lost their phone/SIM and coordinator-assisted phone recovery has been initiated. Ensures that the holder of the new phone verifies ownership with an OTP and matches a coordinator reference number before existing account data, balances, and history are transferred.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"Move your account to this number"* or *"Waiting for approval"*.
  - Reference number verification card.
  - Informational instructions explaining the transfer process.
  - Action button stack (Confirm, Decline/Reject, Check status, Log out).

---

## Content & Components Breakdown

### 1. Recovery Reference Card (`Panel`)
- Displays unique administrative recovery case reference (e.g., `REC-9941`).
- Security instruction advising the member to ensure this matches the exact reference provided by their verified community coordinator.

### 2. State-Specific Information Copy
- **Unconfirmed State:** Informs user that an account transfer has been requested for this phone number and requires OTP verification.
- **Confirmed State:** Informs user that the number is verified and awaiting coordinator sign-off, after which they will sign in with this number to resume their account.

---

## Action Buttons & Dialog Triggers
1. **"Confirm with a code" Button (`PrimaryAction`):**
   - Requests phone proof OTP for current number and completes transfer confirmation.
2. **"This is not me" / Decline Button:**
   - Opens security warning modal (`AppDialog`) confirming that this device does not belong to the claimant. Cancels recovery case immediately.
3. **"Check status" Button (When confirmed):**
   - Refreshes member profile to detect if final coordinator approval has been granted.
4. **"Log out" Action Button:** Exits the flow.

