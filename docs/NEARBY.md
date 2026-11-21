# Nearby: area discovery and expiring availability

Implemented on 2026-11-12. Entry: **Home → Nearby** in both Flutter Home layouts. This adds community discovery
alongside the existing Home; the proposed social feed, public member profiles and achievement redesign are separate
work.

## Member experience

- Nearby opens on a map of open help requests shared by the requester. Tap a pin to see the service, ward, and scheduled
  time. Overlapping pins open a chooser with each request shown separately. List and Home still use published
  operational areas. No device GPS, background tracking, or moving person markers are used.
- In **Ask for help**, the written location is required. A service pin is optional. The requester must explicitly opt in
  to show its approximate location to approved volunteers in the same municipality. Exact pins remain in authorized
  request details and booked or in-progress volunteer assignments. Existing requests stay private until explicitly tagged.
- Pin coordinates are rounded to two decimal places. The discovery feed includes up to 100 eligible requests, soonest
  first, and drops pins when a request is filled, cancelled or closed. Area availability remains a separate opt-in.
- Activity is grouped into `0`, `1-4`, `5-9`, and `10+`. These are ranges rather than exact headcounts; they do not
  guarantee anonymity in a small community. The response contains no direct request/member identifiers, people's names,
  photos, addresses, private notes, phone numbers or exact coordinates.
- Open needs are requests in `MATCHING_ACTIVE`, `PARTIALLY_ACCEPTED`, or `ESCALATED_TO_COORDINATOR`, scheduled from one
  hour ago through the next 24 hours, for active, unrestricted, approved recipients in the area's wards. The one-hour
  grace window includes recently due requests. Areas may overlap: never sum their counts.
- Approved volunteers choose one area, explicitly consent, then share availability for **15, 30, 60, or 120 minutes**.
  They can stop sharing immediately. This is discovery sharing; it does not accept visits or change existing matching
  preferences. “View my volunteer offers” and “Ask for help” use the existing protected workflows.

## Live updates and failure handling

The app polls the authenticated snapshot every **15 seconds** while Nearby is the visible route and the app is in the
foreground. It refreshes on foreground resume. This is polling, not WebSocket/SSE delivery; other users see changes on
their next refresh.

Failed refreshes retain a clearly marked last-known snapshot with its age; retries back off to 30, 60, then 120 seconds.
Manual refresh remains available. Expiry uses server time plus elapsed time and still hides the owner's expired
availability without a successful refresh. Account/community/session changes discard old data and delayed responses.
Access refusals clear the snapshot and trigger the app's existing account recheck. Failed writes remain visible,
including an unconfirmed stop. Nearby does not persist a snapshot or queue availability writes offline.

## Backend and lifecycle

All routes use `/api/organizations/:id/community` and require a live authenticated session plus current organization
access:

| Method and suffix          | Purpose                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| `GET nearby`               | Coarse snapshot plus the caller's own availability; `private, no-store` |
| `PUT availability`         | `{areaId, minutes, consent:true}`; ownership comes from the session     |
| `DELETE availability`      | Idempotently withdraw the caller's availability                         |
| `PUT nearby/areas/:areaId` | `{visible:boolean}`; coordinator or organization administrator          |

The API checks current approval, volunteer role, restrictions, session validity and same-community area ownership.
Sharing is rejected when an accepted/in-progress visit conflicts with the chosen interval, using the existing reschedule
history rules. There is at most one availability row per membership. Expiry is enforced on reads; logout/session expiry,
restrictions, membership/role changes and area edits invalidate previous sharing. Hiding an area deletes its
availability. Expired/revoked-session rows are also removed in bounded batches every minute. Changes are audited inside
the same transaction. No push/location permission is required.

## Coordinator setup and deployment

1. Apply migrations through **`1729118400037-NearbyRequestPins`** before deploying this API version. Migration 29 adds
   published areas and timed availability. Migration 37 adds per-request consent and defaults existing records to private.
2. In the web dashboard, open **Service operations → Operational zones**. Check the ward coverage and area name. **Set
   approximate area map centre** adds coordinates and radius using the existing zone editor. Use an area centre, not a
   person's home.
3. Choose **Show in Nearby**. All existing/new zones default to hidden. An area can be published without coordinates and
   will work in the list. **Hide from Nearby** withdraws it and its shared availability. Editing an area requires fresh
   consent.
4. Verify the list/map and a short availability session on a real device against the deployed environment before wider
   rollout. No production migration or deployment was performed during implementation.

The snapshot supports up to 200 published active areas per community. Exceeding this returns an explicit configuration
error rather than silently dropping areas.

## Map tiles

`flutter_map` 8.3.2 and `latlong2` 0.10.1 render request pins. Tile requests start when Nearby opens in Map view.
Set `--dart-define=NEARBY_MAPTILER_KEY=<browser map key>` to enable MapTiler raster tiles. The default MapTiler style is
`dataviz-v4-light`. Set `--dart-define=NEARBY_MAPTILER_STYLE=<map ID>` to use a custom style. For the web preview, restrict
the browser key to the preview hostname in MapTiler Cloud and use an account with raster tile access.

Without a MapTiler key, or when MapTiler tiles fail, the fallback is a grayscale rendering of
`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, with an identified application user agent, the library's built-in
caching and visible linked OpenStreetMap attribution. There is no bulk download/offline prefetch feature. Tiles receive
the coarse viewport, not app credentials or participant locations.

`--dart-define=NEARBY_TILE_URL=...` can select another compatible raster endpoint. Any replacement must also have its
required attribution configured in the map widget; changing the URL alone does not cover a provider's licensing or
authentication requirements. Review expected traffic and provider requirements before broad public rollout; no paid
provider was provisioned and the public OSM service has no application SLA.

References: [flutter_map OSM guidance](https://docs.fleaflet.dev/tile-servers/using-openstreetmap-direct),
[raster tile layer](https://docs.fleaflet.dev/layers/raster-tile-layer),
[OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Verification

- Full API regression: **867 tests / 54 suites passed**.
- Nearby HTTP/DTO/session checks plus schema contract: **22 passed**.
- Disposable PostgreSQL Nearby integration: **9 passed**, including cross-community boundaries, consent/expiry,
  revocation, restrictions, area edits, busy visits and audit rollback.
- Web lint, type checking and existing tests: **37 passed**.
- Flutter web production build: **passed**, including the WebAssembly dry run.
- Focused Flutter regression: **67 passed**, including all **19 Nearby tests**, Home, membership status and Ward NOC.
  Nearby tests cover consent, stop/failure, expiry, stale-data/backoff, route and app lifecycle, account/store changes,
  list/map filtering and layouts at widths 320/390/430 with text scales 1 and 2. The separate existing reference-shell
  check still fails its old Home-heading assertion at text scale 2, as it did before Nearby. Focused analysis reports no
  issues.
- Previews: `output/nearby-qa/`. Widget map previews intentionally disable external basemap tiles; they validate area
  overlays, not native network tile delivery.

Physical-device/network validation remains a rollout check. The wider Flutter test suite has pre-existing failures;
focused results must not be presented as a completely green Flutter suite.

## Exchange request list (2026-11-20)

**Exchange → Nearby** now lists individual available requests directly. Home and the map retain the coarse snapshot described above. The new list uses `GET nearby/requests`, with 20 rows per page and bounded search, ward, service category, today/week and soonest/newest filters. It covers the next seven days and excludes filled, closed, expired, unshared or blocked requests. Only approved local volunteers can browse.

Cards show the service, public service description, shared display name/avatar, ward and approximate area, schedule, duration, open helper places and estimated credits per volunteer. Names and avatars follow existing community visibility preferences, including consent for the current photo version. Exact addresses, contact details, private notes and exact coordinates are excluded. Own requests and the caller’s own current assignment may link to their protected workflows; discovery never creates or accepts an assignment.

Request creation accepts an optional `file` upload (JPG/PNG/WebP, maximum 5 MB). It is re-encoded as JPEG without source metadata and saved atomically with the booking; matching/credit failures roll it back. A retry with different photo bytes is rejected. Apply migration **46 — ServiceRequestPhotos**. `GET nearby/requests/:token/photo` and `.../member-photo` recheck access, sharing and blocks on every download and return private, no-store JPEGs. `GET requests/:requestId/photo` remains limited to authorized request viewers or current assigned volunteers.

The Exchange list loads on tab activation, refreshes on foreground return, and checks for changes every 60 seconds while visible. Search is debounced, list rows are lazy-built, and further pages use “More requests”. No pull-to-refresh or header loading bar is added. Photos and list data remain in memory and are cleared when the account or access changes.
