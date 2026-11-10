# Request Review Screen (`LiveReviewRequestScreen`)

## Purpose
Provides the pre-flight verification stage where members review all parameters of their service request (service type, recipient, exact appointment time, address details, and special instructions) before generating an idempotent server commitment.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Built on `AppPage` framework with header title *"Check before sending"*.
  - Step progression indicator (`JourneyStep`).
  - Central review summary card (`Panel`).
  - Sticky or bottom-docked confirmation action button.

---

## Content & Summary Breakdown

### 1. Verification Notice & Step Indicator
- **Progress Indicator:** Step 2 of 2 (*"Check and send"*).
- **Instructional Notice:** Text clarifying that nothing is sent or booked until the confirmation button is tapped.

### 2. Comprehensive Details Card (`Panel`)
Structured key-value breakdown displaying:
- **Service Name:** Title of the requested help.
- **Recipient:** Name or membership label of who will receive assistance.
- **Service Location:** Street address, landmark, Ward number, and PIN code.
- **Appointment Schedule:** Formatted date and start time with clock icon.
- **Special Notes:** Additional instructions or accessibility requirements (if entered).
- **Credit Policy Badge:** Reassurance badge: *"Free community help / 1:1 hour reciprocity"*.

### 3. Submission Security
- Uses an in-memory unique idempotency key to prevent accidental double-booking on double taps or flaky connectivity.

---

## Action Buttons & Navigation
1. **"Confirm request" / "Send Request" Button (`PrimaryAction`):**
   - Transmits HTTP POST to `/api/requests`.
   - On success, pops the wizard stack and navigates directly to `LiveRequestDetailScreen` for the newly created request.
2. **Back Button (App Bar):**
   - Returns to `LiveRequestFormScreen` allowing the member to adjust dates or address details without losing form entries.

