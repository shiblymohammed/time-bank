# Firebase Android phone authentication — 2 November 2026

Android now verifies the mobile number with Firebase, then exchanges the Firebase ID token at `POST /api/auth/firebase`
with JSON `{ "idToken": "..." }`. The API verifies Google's signature, project audience, issuer and expiry, requires the
phone provider, an Indian mobile number and authentication within five minutes. Caller-supplied phone numbers and roles
are never trusted. Missing project configuration and authentication-emulator configuration fail closed.

The verified phone uses the existing Time Bank account, wallet, account restrictions, memberships and permissions. A
first login creates an account and wallet, without granting administrator or member roles. Concurrent first logins
serialize account provisioning. Time Bank issues its own access/refresh tokens; Firebase tokens do not authorize
application endpoints directly.

## Firebase project

Since 8 November 2026 every app uses one Firebase project owned by the Indian Time Bank team:

- Project ID: `indian-time-bank`, number `556720690661`.
- One Android, one iOS and one Web app are registered **per organization**, all in this project. Package and bundle IDs
  follow `com.indiantimebank.<organization>`; the first is `com.indiantimebank.kottakkal`.
- Staff panels use `<organization>.indiantimebank.com`; add each one under Authentication → Settings → Authorized
  domains.

Setup checklist for the project (once):

- [ ] Phone provider enabled (Authentication → Sign-in method).
- [ ] SMS region policy: allow India only.
- [ ] Blaze plan with a budget alert, so real SMS is delivered beyond the small free allowance.
- [ ] Service-account key generated for push and stored only in the server's `FIREBASE_SERVICE_ACCOUNT_JSON`.

Per organization:

- [ ] Android app with the debug, release and Play app-signing SHA-1 and SHA-256 fingerprints.
- [ ] iOS app and its APNs key under Cloud Messaging.
- [ ] Web app for the staff panel, and the panel's domain in Authorized domains.

The earlier project `time-bank-34a1c` belonged to another account and is no longer used. Never commit private signing
keys or the service-account key.

## Deployment

Set `FIREBASE_PROJECT_ID=indian-time-bank` on the deployed API and deploy the new endpoint. Allow outbound HTTPS to
Google's public signing-certificate endpoint. Development Compose supplies this project ID and attaches only the API to
an outbound bridge; PostgreSQL remains on the internal network. No Firebase service-account private key is needed for
this public-key verification flow.

The current test API origin is `https://phone-richard-should-group.trycloudflare.com`. Flutter and its CI default to
this origin. Override using `--dart-define=API_BASE_URL=<HTTPS origin without /api>` or the GitHub repository variable
`API_BASE_URL`; legacy `API_URL` remains supported. Quick Tunnel URLs may change after restart. Live checks returned 200
for `/api/health/live` and `/api/health/ready` (database up) and 401 for an invalid token sent to `/api/auth/firebase`;
real signed-token exchange remains untested.

Firebase Admin token verification here does not query revocation/disabled-user state. Disabling a Firebase user does not
revoke existing Time Bank sessions. Enforce suspensions and permissions through Time Bank, which checks its own account
state. Legacy server OTP endpoints remain for the dashboard and disposable QA; their production SMS gateway is still
unimplemented. Android does not silently fall back to mock OTP.

Billing was not changed. The console currently shows a 10 SMS/day warning for new projects on Spark, while the published
[Firebase limits](https://firebase.google.com/docs/auth/limits) describe verification SMS as Blaze-only. Treat real
delivery and available quota as unverified until tested; billing changes require the project owner's action.

## Validation and limits

472 backend tests, 62 real PostgreSQL workflow/concurrency tests and 68 Flutter tests passed. API build, TypeScript/lint
checks, Flutter analysis and Android debug/release APK builds passed. Tests cover verified-phone identity/roles,
suspended accounts, concurrent provisioning, invalid token rejection, automatic/manual verification, cancellation,
resend cooldown, duplicate callbacks and backend/profile retry recovery.

No Android device was connected for this change. Real SMS delivery, native app verification and a deployed API exchange
have not been exercised. Existing native QA reports used injected legacy server-OTP stores and do not validate Firebase.

See [Android phone authentication](https://firebase.google.com/docs/auth/android/phone-auth),
[Flutter phone authentication](https://firebase.google.com/docs/auth/flutter/phone-auth) and
[ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

## iOS configuration follow-up

The Flutter repository includes the Xcode project, background modes and iOS phone gateway. Each organization's iOS app
needs its own `GoogleService-Info.plist` and encoded-app-ID callback from the `indian-time-bank` project. Apple Team ID,
signing and APNs credentials are still unset. See the Flutter repository's `IOS_SETUP.md`.

## Audit hardening follow-up

Legacy server OTP now requires explicit private-QA opt-in; production and default development configurations fail
closed. Firebase phone token exchange is unaffected. See [the full audit](FULL_APPLICATION_AUDIT_2026-11-02.md) for
deployment and dashboard sign-in work still required.
