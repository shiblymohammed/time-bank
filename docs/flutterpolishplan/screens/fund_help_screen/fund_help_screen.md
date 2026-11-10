# Fund Help Contribution Screen (`LiveFundHelpScreen`)

## Purpose
Allows a beneficiary or caregiver to voluntarily contribute their earned Time Credits back into the community time bank pool for a completed service request. Re-emphasizes that service is strictly free and that contributions are entirely optional acts of community reciprocity.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"Give credits for help"*.
  - Explanatory guidance text emphasizing optional reciprocity.
  - Form container featuring credit amount calculation, note field, and confirmation dialog.
  - Primary bottom submission action.

---

## Content & Form Controls

### 1. Educational & Policy Context
- Prominent informational text:
  *"You do not have to give anything. The help is free. If you would like to, you can give some of your credits back to the time bank for this help."*
- Explains that the volunteer has already been credited from the community system, so this gift replenishes the collective pool rather than paying the individual.

### 2. Available Balance & Limit Notice
- Subtitle: *"You have X credits to give"*.
- Maximum funding ceiling capped to the verified hours of the completed service (`limit`).

### 3. Form Inputs
- **Credit Amount Field:**
  - Prefilled or user-adjusted number of credits.
  - Validation check ensuring amount does not exceed verified hours or user's wallet balance.
- **Reason / Appreciation Note:**
  - Text input pre-populated with *"Thank you for the help"*.

---

## Dialogs & Confirmation
1. **Voluntary Contribution Modal (`AppDialog`):**
   - Title: *"Give X credits?"*
   - Explanatory text warning that the transaction is final and can only be performed once per completed request.
   - Buttons: *"Go back"* and *"Yes, give credits"*.

---

## Action Buttons & Navigation
1. **"Give credits" Button:** Opens review dialog.
2. **"Yes, give credits" Dialog Button:** Posts transaction payload to `/requests/{id}/credit-spending` and pops back to `LiveRequestDetailScreen`.

