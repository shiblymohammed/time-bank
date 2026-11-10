# Reconnect & Network Error Screen (`_ReconnectScreen`)

## Purpose
Displayed in place of the standard sign-in screen when the app opens with an existing stored session but cannot establish contact with the backend API. Prevents users from erroneously believing their account has been logged out during temporary network outages or server maintenance.

---

## Layout Architecture & Structure
- **Container / Presentation:**
  - Full-screen centered scaffold with safe-area padding.
  - Centered vertical card/column containing:
    - Network error illustration / icon.
    - Title and reassuring explanatory description.
    - Vertical stack of retry and account recovery actions.

---

## Content & Components Breakdown

### 1. Connection Error Messaging (`EmptyState`)
- **Icon:** Large error outline icon (`Icons.error_outline`).
- **Title:** *"Can't reach the server"*.
- **Description:** *"You're still signed in. Check your connection and try again."*

---

## Action Buttons & Triggers
1. **"Try again" Button (`PrimaryAction`):**
   - Retries the session restoration handshakes and endpoint ping (`store.retryRestore`).
2. **"Use a different number" Button (`SecondaryAction`):**
   - Forfeits the cached session restoration attempt (`store.skipRestore`) and redirects user to `LiveSignInScreen` to sign in under another phone number.

