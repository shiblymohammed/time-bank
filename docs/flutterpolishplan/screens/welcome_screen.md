# Welcome Screen (`WelcomeScreen`)

## Purpose
The entry landing screen displayed when an unauthenticated user opens the application. It introduces the Kottakkal Time Bank brand, communicates the core value proposition of mutual community service exchange, and provides entry points for either returning members or first-time registrants.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Full-screen scrollable layout centered within a responsive container (constrained to max width 480dp).
  - Vertical column containing header logo, heading text block, description, primary call-to-action, and secondary sign-up prompt.
  - Animated sequential reveal (`_Reveal`) on initial launch, fading in elements sequentially from top to bottom.

---

## Content & Visual Hierarchy

### 1. Brand Logo & Intro
- **Kottakkal Animated/Static Logo:** Displays the central Kottakkal community brand artwork with smooth intro reveal animation.

### 2. Headlines & Slogan
- **Main Heading:**
  - Text: *"Your Time Builds a Stronger Kottakkal."*
  - Two-tier typographic emphasis (bold header + gradient styled callout text).
- **Sub-headline / Value Proposition:**
  - Text: *"Give time, get help, share skills and grow our community."*

### 3. Primary & Secondary Actions (Buttons)
1. **"Continue with Phone" Button:**
   - **Type:** Full-width filled elevated stadium button.
   - **Content:** Left phone outline icon (`Icons.phone_outlined`), center text label *"Continue with Phone"*, right navigation forward arrow icon (`Icons.arrow_forward`).
   - **Action:** Triggers standard login mode (`onStart(false)`) and transitions user to `LiveSignInScreen`.
2. **"Create an Account" Button:**
   - **Type:** Text link button placed adjacent to *"New here?"* caption.
   - **Content:** Text label *"Create an Account"*.
   - **Action:** Sets new member registration flag (`onStart(true)`) and forwards user to `LiveSignInScreen` / registration flow.

---

## Navigation & State Transitions
- **`Continue with Phone` tap** $\rightarrow$ Routes to `LiveSignInScreen` in returning member mode.
- **`Create an Account` tap** $\rightarrow$ Routes to `LiveSignInScreen` in new member onboarding mode.

