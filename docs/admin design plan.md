# Indian Time Bank Admin Design Plan

**Status:** Proposed v1 design specification and rollout plan

## 1. Visual direction

Create a light and dark administrative workspace with compact navigation, restrained violet-blue accents, legible data, and depth created by surface contrast and borders. The solid sidebar is the strongest visual identifier. The Apple-inspired qualities are clear hierarchy, precise alignment, quiet surfaces, and predictable interactions. The branding and workflows should feel specific to Indian Time Bank.

Use blue-charcoal in dark mode and a slightly gray workspace beneath white cards in light mode. Keep routine surfaces flat and reserve strong color, elevation, and motion for places where they communicate state or help users act. Limit green to positive status and chart data. Replace the current gradient sidebar with a solid surface.

## 2. Design tokens

### Surface and text palette

| Token | Light | Dark | Where it appears |
| --- | --- | --- | --- |
| App background | `#F5F6FA` | `#25293C` | Main workspace |
| Sidebar | `#FFFFFF` | `#303347` | Primary navigation |
| Top bar | `#FFFFFF` | `#25293C` | Global utilities |
| Surface | `#FFFFFF` | `#2E3247` | Cards, panels, and tables |
| Secondary surface | `#F9F9FC` | `#35394F` | Supporting sections and raised dark surfaces |
| Elevated surface | `#FFFFFF` | `#35394F` | Menus, dropdowns, drawers, and dialogs |
| Border | `#E4E6EF` | `#44485E` | Component boundaries |
| Strong border | `#D8DAE5` | `#44485E` | Secondary buttons and stronger boundaries |
| Subtle divider | `#E4E6EF` | `#3A3E53` | Row separators and toolbar dividers |
| Primary text | `#171A27` | `#F5F6FA` | Titles, values, and labels |
| Secondary text | `#62677A` | `#A9AEC0` | Descriptions and supporting content |
| Muted text | `#8C91A3` | `#73798E` | Low-emphasis metadata |
| Input background | `#F5F6FA` | `#292D41` | Search and field surfaces |
| Hover | `#F0F0F7` | `#393D53` | Interactive feedback |

The dark surface layers are workspace `#25293C`, sidebar `#303347`, cards `#2E3247`, elevated surface `#35394F`, and selected control `#6C63E8`. In light mode, distinguish the white sidebar from the gray workspace with a subtle divider.

### Violet-blue accent

| Step | Hex | Typical use |
| --- | --- | --- |
| 50 | `#F1F0FF` | Light accent background |
| 100 | `#E6E4FF` | Soft selection |
| 200 | `#D2CEFF` | Accent border |
| 300 | `#B7B1FF` | Supporting accent |
| 400 | `#8D86F2` | Interaction tint |
| 500 | `#6C63E8` | Primary accent and selected navigation |
| 600 | `#5C54D8` | Pressed state |
| 700 | `#4B44BE` | Strong accent |
| 800 | `#393497` | Deep accent |
| 900 | `#29266E` | Deepest accent |

Start with violet-blue `#6C63E8` and white for the primary button and active sidebar selection. Verify text and focus-ring contrast in both themes. Use a stronger violet shade or stronger foreground where a specific pairing fails, especially for small text.

### Semantic status

| Status | Marker | Light text | Light fill | Light border |
| --- | --- | --- | --- | --- |
| Success | `#42B883` | `#228A5B` | `#E9F8F0` | `#C8EEDB` |
| Warning or waiting | `#E7A33E` | `#A96800` | `#FFF5DE` | `#F4DFAC` |
| Danger or problem | `#E45B64` | `#B8424C` | `#FDECEE` | `#F3CDD1` |
| Information | `#4D9DE0` | `#386DB7` | `#EAF2FF` | `#CEDDFA` |
| Neutral | Theme neutral | `#62677A` | `#F0F1F5` | `#E0E2E8` |

Define separate, contrast-tested dark-mode status fills, borders, and text. Give each status a readable label so it remains understandable without color. Violet indicates a product action or selection. Green, amber, red, and blue indicate status or data meaning.

### Typography, spacing, and elevation

| Element | Baseline |
| --- | --- |
| Typeface | Inter with system sans-serif fallback |
| Page title | 28px, weight 700, line-height 1.15 |
| Page description | 13px, weight 400, theme secondary text |
| Section title | 16px, weight 600 |
| Card title | 13px, weight 600 |
| KPI | 32px, weight 700, tabular numerals where available |
| Table body | 13px, weight 500 |
| Table header | 11px, weight 600, uppercase with restrained tracking |
| Metadata | 11–12px, contrast checked against its surface |
| Spacing | Proposed 4px base with 8px, 12px, 16px, 24px, and 32px steps. Start with 16px internal card padding and 24px desktop section gaps. |
| Icons | Lucide-style outline family, 1.75px stroke. Use 16px for navigation, 18px for controls, and 20px for section headers. |
| Radius | 4px tiny controls, 6px inputs, 8px buttons, 9px selected sidebar rows, 10px compact cards, 12px standard cards and large panels, 16px exceptional surfaces. Full rounding is reserved for true pills. |

| Shadow level | Value | Use |
| --- | --- | --- |
| 0 | None | Standard cards and tables |
| 1 | `0 1px 3px rgba(20, 24, 40, .05)` | Subtle separation when a border needs support |
| 2 | `0 8px 24px rgba(20, 24, 40, .08)` | Dropdowns and floating menus |
| 3 | `0 16px 40px rgba(20, 24, 40, .12)` | Drawers and dialogs |

## 3. Workspace shell

### Sidebar

- Use a 248px desktop sidebar with 16px padding, 38–40px rows, and 16–18px outline icons. Group links under Overview, Staff Console, Services, and Governance. Show links and counts according to the user’s role and allowed scope.
- Keep the logo and Indian Time Bank name together at the top. Place the account identity and sign-out action in the footer. Let the navigation list scroll independently when it exceeds the available height.
- Use 10–11px uppercase group labels at weight 600 and `0.08em` tracking. Use 13px, weight 500 for links and weight 600 for the active link. Dark-mode normal navigation text starts at `#D7D9E4` and hover at `#393D53`. Use a solid active fill and a visible keyboard focus ring. Reserve the muted foreground for disabled or low-emphasis items.
- Collapse navigation on narrow screens. Keep the active destination and municipality visible, and restore keyboard focus to the menu trigger on close.

### Top bar and municipality scope

- Use one 64px desktop utility bar. Place search on the left, then municipality scope, Refresh data, and Notifications. Keep the page title and supporting description in the content heading so the toolbar can remain compact. Let controls wrap naturally on small screens.
- Use the input surface and a thin border for search. Treat global search and its `Ctrl + /` shortcut as proposed functionality. Show the shortcut only after it works, and keep existing page-level filters available for finding records within a queue.
- Label the municipality selector as a data-scope control. Provide keyboard navigation and search for longer lists. Keep a locked read-only scope indicator for coordinators assigned to one municipality. Mark Overview metrics as platform-wide when changing the municipality only updates Recent Activity.
- Preserve the shared Refresh data action and the notification drawer’s focus return. Show an unread badge only when backed by unread state. Use a neutral notification icon when that data is unavailable.

## 4. Shared component rules

| Component | Design and behavior |
| --- | --- |
| Page heading | One title, a short description when needed, and one clear primary action. Show the current municipality, period, or filter scope beside data affected by it. |
| Buttons | Use 36–40px desktop buttons with an 8px radius. Primary uses violet-blue. Secondary uses the panel surface and a border. Ghost uses a transparent base and the theme hover surface. Keep destructive actions explicit and use their semantic danger treatment. |
| Cards and KPIs | Use a bordered, flat surface and one hierarchy of label, value, and clarification. Add a small marker only where it carries meaning. Interactive cards require a destination, keyboard focus, and a hover state. |
| Filters, selects, and tabs | Use simple selects for short option lists, searchable pickers for long lists, and aligned filter labels. Keep active filters visible and provide a clear reset. Tabs should switch related views without duplicating sidebar destinations. |
| Lists and tables | Use Memberships as the reference for the shared table. Use 56–64px rows, subtle horizontal dividers, and a stable order of record, status, key context, and action. Put secondary fields in the detail view at narrow widths while preserving labels and row access. Keep result counts and pagination visible. |
| Forms, drawers, and dialogs | Use a drawer for reviewing one record, a dialog for a focused decision, and a full workspace for a long editor. Keep labels, help, validation, and save states consistent. Preserve drafts after recoverable errors. Return focus on close and keep decision consequences visible before confirmation. |
| Charts and reports | Use functional series colors and thin gridlines. Keep scope, period, unit, and source beside the chart. Provide data tables for important figures and distinguish zero, unavailable, and withheld values. Keep existing report exports attached to their visible scope and period. |
| Loading, empty, and error states | Distinguish first load, refresh, empty queue, no filter matches, error, and inaccessible data. Keep safe existing rows visible during refresh, offer retry on failure, and avoid interpreting a failed fetch as a zero count. |
| Sign-in and verification | Apply the same theme, input, and focus treatments to mobile and staff email verification. Keep each step focused on the next action and preserve clear retry and error feedback. |

## 5. Page-by-page plan

| Destination | Target layout and priority |
| --- | --- |
| Overview | Show platform KPIs first, then work awaiting review, activity trends and readiness, and finally the scoped activity feed. Keep platform totals and municipality-specific events visibly distinct. |
| Needs Attention | Lead with urgent safety and review work. Use compact queues with count, state, and direct case links. Carry the selected queue filter when opening the longer Requests list. |
| Organizations / My Municipality | Use a directory for comparison and a municipality detail view for wards, branding, app builds, and roles. Give coordinators a direct route to their assigned municipality. |
| Memberships | Adopt the shared reference table and a review drawer with the next authorized decision above application, NOC, identity, documents, and history. Label page-only counts or use scoped totals. |
| Instant Help | Open to Awaiting review. Keep duration, evidence, and approval or rejection together in the case view, with history available as a secondary view. |
| Requests & Matching | Use a predictable queue, filter bar, and booking detail layout. Put the next action, assignment, and time reconfirmation first, with history below. Align status labels with API values and distinguish current-page counts from totals. |
| Community Updates | Keep Posts, Events, and Impact as related views. Give publishing and moderation separate entry points inside Posts. On Events, keep attendance and QR check-in accessible from the event detail. |
| Safety Alerts | Sort the scanning experience around urgency, ownership, and age. Put sensitive incident content and restart, end, or close decisions inside the case view. |
| Complaints | Use a case queue with level, status, owner, and age. Keep staff-only notes visibly separate from member-facing messages. |
| Service Catalogue | Make central definitions and local settings visually distinct. Keep common service fields first, with staffing rules, skill requirements, and proposals available when needed. |
| Service Operations | Give Bookings and Catalogue a single primary home each. Focus this workspace on eligibility, caregivers, zones, and volunteer operations. Move Session Profile into account utilities when navigation is reorganized. |
| Time Credits | Separate community pools, member wallets, transaction history, and credit reviews. Label available, held, frozen, and spent balances explicitly. Retain member and amount context through confirmations. |
| Loyalty & Merchants | Create role-specific entry views for central policy, municipality administration, and merchant tools. Put shop QR, redemption, offers, and receipts together for merchants. |
| Restrictions | Use a case view with current decision, scope, and next authorized action above appeal and history. Explain credit consequences before confirmation. |
| Account Closures | Clearly identify the account to close and the one to retain in duplicate cases. Keep closure and credit transfer as separate decisions with their own confirmations. |
| Reports | Use one period, scope, and export toolbar. Group metrics by topic and keep privacy withholding and definitions beside the figures they qualify. Keep saved sponsor reports discoverable. |
| Phone Number Changes | Show progress through opened, member confirmation, staff decision, and completion. Mask identifiers in lists and flag cases requiring Super Admin approval. |
| Audit Trail | Offer common event labels alongside exact technical event keys. Keep payloads collapsed by default and use a consistent time zone for displayed events. |

## 6. Implementation sequence and acceptance

| Phase | Work | Ready to move on when |
| --- | --- | --- |
| 1. Foundation | Define light and dark tokens, typography, spacing, and interaction states. Replace the sidebar treatment and apply the shared toolbar and scope semantics. | The shell works for central admin, municipality admin, and coordinator roles in both themes and at narrow widths. |
| 2. Core workflows | Build the shared table, filter bar, badges, drawer, and action dialog. Apply them to Needs Attention, Memberships, and Requests & Matching. | Staff can find and review a member or booking without losing the existing scope and filters. Counts and statuses match what they describe. |
| 3. Remaining workspaces | Bring the remaining destinations into the same visual system. Resolve duplicate navigation and verify every migrated action and permission boundary. | Every sidebar destination has a documented scope, primary action, and data display pattern. |
| 4. QA and clean-up | Check both themes, keyboard focus and dismissal, narrow layouts, contrast, loading and failure recovery, report exports, and representative role workflows. Review duplicate requests and hidden panels that continue to fetch. | Important workflows pass in the browser and existing automated checks pass. |

When implementing, keep the existing role boundaries, API contracts, and decision flows as the baseline. Treat navigation placement and global search as separate product decisions where they change behavior. The first review should compare the shell, Memberships table and review drawer, and Requests queue in both themes before applying the system across all 18 destinations.
