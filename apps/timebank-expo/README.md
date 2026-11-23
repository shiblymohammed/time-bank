# Indian Timebank UI preview

A standalone Expo / React Native / TypeScript implementation of the supplied Indian Timebank design brief. Uses Expo Router, Reanimated, Gesture Handler, FlashList masonry, Zustand, local Google font assets, SVG, blur, gradients and native haptics.

## Run locally

Requires Node 22+ and npm. From this directory:

```sh
npm ci
npx expo start
```

Press `w` for web, or open the Expo development URL on a compatible device. For the review server:

```sh
npx expo start --web --port 8090
```

On the current workstation, use `http://[::1]:8090`. An existing IPv4 listener on this port returns a proxy response, so the verification script uses the Expo IPv6 listener. On other computers, the usual `http://localhost:8090` URL works.

## Structure

```text
src/app/                   Expo Router screens and root layout
src/theme/tokens.ts         Palette, category gradients, type, spacing, radii, motion
src/components/ui.tsx       Shared primitives, sheets, counters, SVG, skeleton, toast
src/components/Shell.tsx    Safe-area layout, blurred header, floating navigation
src/components/Feed.tsx     Memoized cards, FlashList feed, details, swipe actions
src/components/ExchangeControls.tsx  Animated segments, snap ruler, confetti
src/data/items.ts           30 fictional Indian-context listings and contributions
src/store/useStore.ts       Session state for listings, saves, interest and searches
scripts/check-web.cjs       Browser smoke checks and screenshot capture
docs/screens/              Actual 393 × 852 web screenshots
```

## Implemented flows

- Home with an editorial headline, full-screen search, category filters, request/offer filters, stats strip, masonry cards, initial skeleton and refresh.
- Exchange with Give/Request modes, multiple skills, 30-minute time increments, progress ring, snapping ruler, description validation and count, availability and location choices, live preview, sticky publication action and success confetti. Publishing adds a listing to the feed.
- Requests with Today/This week, urgency/area/distance filters, masonry/list switch, list swipe actions, long-press preview, details, save, interest and platform sharing. Swipe toward acceptance opens details so the user can review before recording interest.
- Profile with sample time statistics, count-up animation, SVG balance sparkline, contributions, badges, saved listings, sample review and community impact.
- Spring press feedback, staggered feed entrances, animated segmented control, pulsing create action, reduced-motion handling and native selection haptics.

## Theme

The light theme uses the requested palette in `src/theme/tokens.ts`. Six category palettes and urgency have individual gradients, surfaces and darker accessible text accents. Primary actions use the darker purple accent for readable white labels. Display type is Bricolage Grotesque, UI is Inter, and emphasized words use Instrument Serif italic. Fonts ship with the app and require no external image or font service at runtime. Avatars use initials and category gradients.

Palette, spacing, radii, type scales and shared sizes are centralized. Some screen-specific dimensions still live beside their layouts. Dark mode needs a second semantic palette and visual verification.

## Demo boundaries

All people, distances, listings, trust scores, notifications, reviews, badges and time-credit statistics are fictional. State lives in memory and resets on reload. Accepting records local interest only. Messaging displays an explicit demo message. The area panel is a location placeholder. This app uses the Indian Timebank name and SVG mark from the supplied brief. It is a separate Expo preview alongside the existing Kottakkal Flutter application.

## Verification

```sh
npm run typecheck
npm run lint
node scripts/check-web.cjs
```

The browser script uses installed Microsoft Edge. It checks all four screens at 393 × 852, horizontal document overflow, saving, publishing and finding a new listing through search. It captures screenshots and listens for runtime errors. TypeScript and lint pass. Web smoke checks pass.

Native builds, device haptics, keyboard behaviour and sustained 60fps performance remain unverified. Advanced motion from the brief still needs a dedicated pass: collapsing large titles, profile parallax, a true shared-element detail expansion, card-to-feed publication transition, morphing tab icons and a custom pull-to-refresh animation. Skeletons currently pulse rather than shimmer. The bottom sheet uses the platform modal slide transition. These limits should be resolved before treating the preview as release-ready.

The installed Expo dependency tree reports a moderate minimatch advisory through tooling. The suggested automatic fix downgrades Expo across major versions, so it was not applied. Review an SDK-compatible dependency patch before release.

## Five next features

1. Municipality-scoped authentication and membership.
2. Real request and offer APIs with durable saved listings.
3. Member messaging and notifications.
4. Verified exchanges, coordinator approval and a time-credit ledger.
5. Malayalam/Hindi localization and device accessibility testing.
