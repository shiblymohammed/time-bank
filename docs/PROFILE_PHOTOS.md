# Optional member profile photos

## Where the option appears

**Join → Review**, above the full-name field, shows “Profile photo (optional)”. Volunteers, recipients and applicants
choosing Both can use the camera or gallery, or continue without a photo. An upload failure does not block applying.

**Profile settings** offers the same add/change/remove controls after joining. The saved photo also appears in the
member profile header. Photos belong to the global account, so joining another community does not create another copy.

Photos are currently private to the account owner. They are not identity verification and are not exposed through a
public URL or another member's profile. Staff membership approval and recipient eligibility remain independent.

## API

All routes require the existing authenticated, active-account guard; no approved membership is needed. The caller is
always the authenticated owner. A supplied user ID or organization never selects the photo account.

| Route                       | Result                                                                          |
| --------------------------- | ------------------------------------------------------------------------------- |
| `PUT /api/auth/me/photo`    | Multipart field `file`; add or replace. Returns `{profilePhotoVersion: UUID}`.  |
| `GET /api/auth/me/photo`    | Current owner's JPEG, or 404 if absent; private/no-store, nosniff headers.      |
| `DELETE /api/auth/me/photo` | Remove; idempotent, returns `{profilePhotoVersion: null}`.                      |
| `GET /api/auth/me`          | Includes nullable `profilePhotoVersion`, never a filesystem key or photo bytes. |

Accepts real, non-animated JPEG, PNG and WebP images up to 5 MB and 25 million decoded pixels. The server fully decodes,
orients, crops/resizes to at most 512 × 512, and re-encodes as JPEG without original EXIF/GPS metadata. Filenames and
client MIME types are not trusted. Processing uses the pinned `sharp` dependency; see its
[constructor](https://sharp.pixelplumbing.com/api-constructor/) and
[resize documentation](https://sharp.pixelplumbing.com/api-resize/).

The nullable `users.profile_photo_id` column comes from migration **28 — ProfilePhoto**. Files use the existing private
`DocumentStorage` with generated keys. Replacement/removal lock the user row, audit the change, and remove superseded
files. Failed database transactions retain the old photo and clean the new file. Cleanup errors are logged without
turning a committed save into a misleading failure.

Flutter loads JPEGs through `ApiClient`, including access-token renewal. Images and failed picks are kept in widget
memory, not public image URLs or the offline visit queue. Session/account checks prevent a delayed pick, retry or image
response from copying/displaying an old account's photo in a new account.

## Deployment

1. Apply migration 28 using the normal migration process before running the updated API.
2. Configure `UPLOADS_DIR` to a persistent, private directory writable by the API user. Both Compose files now mount a
   dedicated upload volume; the production image prepares its directory for the non-root API user.
3. Back up the upload volume together with the database. If a deployment already has private NOC files in another
   directory, copy those files to the configured root, preserving relative keys and API-user ownership, before switching
   the configuration. Verify reads before removing any old copies.
4. The development reverse proxy allows multipart overhead above the API's 5 MB limit. Apply an equivalent request-size
   allowance to any separately managed public proxy.

The iOS usage descriptions cover camera/gallery access for optional photos and existing ward NOC photographs. Physical
device permission prompts and camera behavior still need an Android/iOS device check; widget tests use injected pickers.

## Validation

Server regression: **53 suites / 845 tests pass**. Focused Flutter photo, Join and API-client tests: **63 pass**.

- Real image processing and HTTP tests cover decoding, metadata removal, invalid/oversized files, multipart limits,
  authenticated owner access, add/read/replace/remove, rollback cleanup and unchanged restricted-account policy.
- Three disposable PostgreSQL cases exercise migration 28, nullable defaults, simultaneous replacements, replacement vs
  removal, and rollback. The shared database fixture now includes migrations 27 and 28. Its Windows launcher uses a
  hidden process with isolated output handles so redirected QA runs finish and clean up properly.
- Flutter tests cover camera/gallery choices, previews, replacement/removal, cancellation, permission failures,
  oversized picks, retry, account changes, token renewal, rejected binary responses and optional Join submission. Join
  layout tests render widths 320/390/430 at text scales 1/1.5/2. Preview PNGs are under `output/profile-photo-qa/`.
- Focused Flutter analysis passes. The full Flutter run passes 249 tests and retains the same 19 previously identified
  failures. No new failing case was introduced. Additional focused cases cover joining after a failed upload and delayed
  photo responses after an account change.

No production database migration or deployment has been performed. Work is uncommitted.
