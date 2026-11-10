# Sign-In / Login Screen (`LiveSignInScreen`)

## Purpose
Handles user phone authentication through SMS OTP (One-Time Password) or automatic development codes. Accommodates both returning users signing in and new members setting up their primary phone account.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Responsive single-child vertical scroll view with drag-to-dismiss keyboard behavior.
  - Centered card container (max width 480dp).
  - Upper navigation/header area with back navigation and branding.
  - Interactive two-step state switcher inside a unified card:
    - **Step 1:** Mobile Phone Entry Step.
    - **Step 2:** 6-Digit OTP Verification Step.

---

## Content & Components

### Common Header
- **Back Button:** Circular back arrow icon button.
  - On Step 1: Navigates back to the Welcome Screen (`onBack`).
  - On Step 2: Cancels current OTP session and returns user to Step 1 (`_changeNumber`).
- **Brand Badge:** Small brand indicator icon.

### Step 1: Mobile Number Entry
1. **Headings:**
   - Title: *"Phone Login"*
   - Subtitle: *"Enter your mobile number. We'll send you a 6-digit code."* (or dev OTP explanation).
2. **Input Section:**
   - Field Label: *"Mobile number"*
   - Country Code Prefix: Static `+91` badge with Indian flag icon.
   - Text Field:
     - Placeholder: `98765 43210`
     - Formatter: Indian 10-digit telephone spacing formatter.
     - Keyboard type: Phone keypad.
     - Autofill hint: National telephone number.
3. **Contextual Alerts & Legal Copy:**
   - New member notice (if registering): *"New here? This number becomes your account."*
   - Validation errors / API problem text block.
   - SMS carrier disclosure (Google Firebase processing note).
   - Terms of Service & Privacy Policy clickable legal links.
4. **Action Buttons:**
   - **"Send OTP" Button:** Primary full-width button. Validates phone regex `^[6-9]\d{9}$` and requests verification code from backend/Firebase.

### Step 2: OTP Verification
1. **Headings:**
   - Title: *"Enter OTP"*
   - Subtitle: Dynamic copy showing *"We've sent a 6-digit code to +91 XXXXX XXXXX"*.
2. **"Change number" Link Button:**
   - Allows correcting the phone number without exiting the flow.
3. **OTP Inputs:**
   - 6 individual numeric digit boxes with automated focus advance and backspace handling.
   - Hidden or autofilling input listener supporting SMS retrieval and dev OTP auto-populate.
4. **Action Buttons & Utilities:**
   - **"Resend Code" Button:** Timer-based text button allowing users to request a fresh OTP after timeout.
   - **"Verify & Continue" / "Sign In" Button:** Full-width primary action button verifying code against authentication session.

---

## Navigation & State Transitions
- **Back Button Tap:** Returns to Welcome Screen or resets back to Phone Entry step.
- **Successful OTP Verification:** 
  - If member registration is incomplete / pending approval $\rightarrow$ transitions to `LiveMembershipScreen` or `LiveJoinScreen`.
  - If approved active member $\rightarrow$ transitions to `LiveReferenceShell` (Home Dashboard).

