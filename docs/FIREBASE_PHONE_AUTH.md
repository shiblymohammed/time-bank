# Firebase Android phone authentication — 2 November 2026

Android now verifies the mobile number with Firebase, then exchanges the Firebase ID token at `POST /api/auth/firebase` with JSON `{ "idToken": "..." }`. The API verifies Google's signature, project audience, issuer and expiry, requires the phone provider, an Indian mobile number and authentication within five minutes. Caller-supplied phone numbers and roles are never trusted. Missing project configuration and authentication-emulator configuration fail closed.

The verified phone uses the existing Time Bank account, wallet, account restrictions, memberships and permissions. A first login creates an account and wallet, without granting administrator or member roles. Concurrent first logins serialize account provisioning. Time Bank issues its own access/refresh tokens; Firebase tokens do not authorize application endpoints directly.

## Console configuration completed

- Project: `time-bank-34a1c`, number `154706594127`.
- Android package: `com.kottakkal.timebank`.
- Firebase app: `1:154706594127:android:9771c1393c2d18981a9d3a`.
- Phone provider enabled with the user's approval of the displayed Google Play Integrity terms.
- SMS region policy: allow India only.
- This workstation's debug SHA-1: `F5:7F:A8:96:87:2F:12:10:4D:97:06:B2:58:86:F3:6D:6A:A0:C7:BD`.
- This workstation's debug SHA-256: `7B:16:A2:35:C4:02:58:63:4F:8B:36:6A:30:7C:4E:63:07:94:CB:D3:BD:CC:F2:4E:39:3A:44:BC:24:5C:C2:10`.

The refreshed Android client configuration is in the separate Flutter repository. CI and production signing certificates must be registered separately: their keys differ from this workstation's debug key. Never commit private signing keys.

## Deployment

Set `FIREBASE_PROJECT_ID=time-bank-34a1c` on the deployed API and deploy the new endpoint. Allow outbound HTTPS to Google's public signing-certificate endpoint. Development Compose supplies this project ID and attaches only the API to an outbound bridge; PostgreSQL remains on the internal network. No Firebase service-account private key is needed for this public-key verification flow.

The current test API origin is `https://phone-richard-should-group.trycloudflare.com`. Flutter and its CI default to this origin. Override using `--dart-define=API_BASE_URL=<HTTPS origin without /api>` or the GitHub repository variable `API_BASE_URL`; legacy `API_URL` remains supported. Quick Tunnel URLs may change after restart. Live checks returned 200 for `/api/health/live` and `/api/health/ready` (database up) and 401 for an invalid token sent to `/api/auth/firebase`; real signed-token exchange remains untested.

Firebase Admin token verification here does not query revocation/disabled-user state. Disabling a Firebase user does not revoke existing Time Bank sessions. Enforce suspensions and permissions through Time Bank, which checks its own account state. Legacy server OTP endpoints remain for the dashboard and disposable QA; their production SMS gateway is still unimplemented. Android does not silently fall back to mock OTP.

Billing was not changed. The console currently shows a 10 SMS/day warning for new projects on Spark, while the published [Firebase limits](https://firebase.google.com/docs/auth/limits) describe verification SMS as Blaze-only. Treat real delivery and available quota as unverified until tested; billing changes require the project owner's action.

## Validation and limits

472 backend tests, 62 real PostgreSQL workflow/concurrency tests and 68 Flutter tests passed. API build, TypeScript/lint checks, Flutter analysis and Android debug/release APK builds passed. Tests cover verified-phone identity/roles, suspended accounts, concurrent provisioning, invalid token rejection, automatic/manual verification, cancellation, resend cooldown, duplicate callbacks and backend/profile retry recovery.

No Android device was connected for this change. Real SMS delivery, native app verification and a deployed API exchange have not been exercised. Existing native QA reports used injected legacy server-OTP stores and do not validate Firebase.

See [Android phone authentication](https://firebase.google.com/docs/auth/android/phone-auth), [Flutter phone authentication](https://firebase.google.com/docs/auth/flutter/phone-auth) and [ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).
