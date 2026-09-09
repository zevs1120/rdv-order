# Design Guidelines

## Product experience refinement (2026-09-09, local review)

Web/native now distinguish draft, table bill and order history. Table bill sits beside editable guest count; the bottom dock retains draft/submit with a prominent quantity badge and short local feedback. Plain add does not open the cart. Current-visit details return to the table; checkout quotes and protects drafts; return quantity is explicit. Printers hides technical controls in Advanced diagnostics. The ordering settings drag area excludes the submit dock. Preserve existing typography, category/menu layout and dependency footprint. A6 reverse-checkout and A7 default charge behavior are explicitly deferred. Scope, UI evidence and deployment boundaries: `pending-product-experience.md`.

Menu choices (2026-09-08, pending rollout): preserve the existing order screen and sheet patterns in web/native. Number search is exact across sections; never prefix dish names/tickets with codes. Configurable dishes open a scrollable required-selection sheet with concrete drink names, a visible selected state, and disabled Add until complete. Free unit prices are blank; the cart still shows a zero total. Distinct choices remain separate cart lines with readable labels. Desktop/mobile fixture screenshots: `outputs/menu-september-2026/`; rollout and check boundaries: `menu-september-2026.md`.

1.0.0 release refinement: remove the redundant Settings instruction in both languages on web and native; module entries stand on their own. User-facing update notes state the actual interface, navigation and performance changes without promises of zero crashes. See `release-1.0.0.md`.

## Performance cleanup (2026-09-08 local batch)

Removed/trimmed 127 obsolete global rule blocks anchored to old ordering classes after verifying no references in app/components/lib code. Current CSS-module layout and interactions remain intact; a local screenshot confirmed the current breakfast screen. Translations load with the initial shared code instead of a dynamic-import waterfall; hydration snapshots use the same English dictionary as SSR. Native ordering memoizes its menu/search/category index and cart quantity lookup; selection/search semantics have regression tests. Measurements and batch evidence: `performance-2026-09-08.md`.

## Ordering tonal refinement (2026-09-08, local batch)

Web and native retain the existing one-screen ordering layout, main/subcategory selection order, search, add-to-cart, cooking/quantity, notes and submission callbacks. Main categories sit on a gray strip with deep-brand selected states; subcategories use a slightly darker gray surface, white selection and a brand leading rule. Dish rows are white on a light-gray canvas, without rounded borders or shadows. Web subcategories can scroll within their existing pane when short screens require it. Add is now a round 44px web / 48dp native button with an official plus vector and a localized dish-specific accessible name; search and quantity glyphs use official vectors too. The new vendored Lucide search SVG is 247 bytes, with no runtime dependency.

Order sheets (cart, cooking, notes, actions, custom dishes and bill) share square surfaces, tonal bodies and rectangular action buttons. Selected cooking options remain clearly marked. Web hides the floating settings entry while a sheet is open so it cannot cover modal controls; native sheets already occupy a higher modal window. Settings/Updates styling is not changed by the order-only theme. Language restoration and translation loading use React transitions; each translation consumer also retains the initial English/fallback server snapshot during its own hydration, including delayed Suspense toolbar boundaries.

Focused local web preview covered the main screen, cart, notes and cooking sheet. Preview additions were removed and table 06 returned to an empty cart; no order was submitted and no printer/API business write was made. Type checking and diff checks are the only automated checks for this pass; native build/device and full verification remain deferred to the batch. No APK was built or published.

## Settings navigation and version information (2026-09-08, local batch)

Report/management simplification: Orders, Revenue and Hot Items share one six-column date preset row (no wrapping or horizontal scrolling). Compact bilingual labels retain full accessible names and the existing date calculations; targets are 44px on web and 48dp on native. Redundant body titles and Orders' section collapse are removed. The manual table-number input/search is removed; links from ordering to a specific table's orders still show that table context with an All orders action. Revenue Export sits beside the custom-date action and keeps its existing range/CSV flow. Device Retry Print now sits beside deployment readiness, replacing the collapse action; readiness stays visible. Access opens directly on role switches, without the explanatory/collapse panel or its divider; actual permissions and audit writes are unchanged. Updates is deliberately unchanged in this refinement.

Menu creation: three explicit entries (New dish, New main category, New subcategory) replace the scattered expand/add controls. New dish uses a sheet with name, price, menu group and category first; type, sort and allergens remain available in optional fields. Closing/reopening retains unfinished input within the current page/screen, and successful additions retain the selected menu/category for consecutive entry. Category and existing-dish sections stay visible without whole-section collapse buttons; category creation/deletion, existing-dish edits, confirmations and batch-save semantics remain. No menu/printer/permission writes were performed for preview. Native UI/device acceptance and full batch verification remain deferred.

Latest toolbar clarification: every global topbar action is an unboxed vector icon (back retains its text label), with no persistent fill, border or shadow. Body actions keep the square thin-border treatment. On Tables only, title plus network status form a left-aligned two-line group; Refresh, Multi-select/Done and Language occupy a separate right-hand layout track. All three remain directly available with unchanged callbacks. Refresh supports manual synchronization, merging is an operating action, and language switching serves shared bilingual devices. Web targets remain 44px with 8px gaps; native Tables targets are 48dp with 8dp gaps. The standard toolbar height and table content layout are preserved. State has a colored vector mark plus readable text, not just a small dot: web distinguishes its existing online/weak/offline signals, and native retains its existing online/offline source. These indicators are not a backend/printer health check. This refinement received web type checking and current/narrow English preview; Android build/device checks remain deferred with the batch.

Settings and all eight modules use a scoped linear presentation on web and native: open section groups with 1px/1dp bottom rules, underline fields, square sheets/dialogs, and no card shadows. Per the user's follow-up, actual body actions (including module entries, secondary buttons, filters and dialog actions) have complete square thin borders, not just underlines; primary actions remain filled. True navigation tabs retain underline selection. Topbar tools are the explicit unboxed exception on both clients. Existing entry order, responsive columns, button hit areas, filters, expand/collapse, edit/save, export and confirmation sequences are preserved. Toggles and native date pickers retain their familiar control shapes. Web scope covers /manage, /admin and /summary including nested overlays; menu category rows have matching local styles. Native scope uses LocalLinearSettings through the shared components and Material shapes. Login, table cards, ordering and the mandatory update gate keep their own presentation.

This visual batch receives type checking, diff review and a brief local web preview only; Android build/device and full batch verification remain deferred at the user's request. Web pointer dragging and subsequent navigation were exercised without business writes. Native gesture/device acceptance remains pending; no new APK is published.

Local preview note: the existing service worker cached development bundles under stable URLs and could restore the old UI on navigation. On loopback hosts or when explicitly registered by a development build, it now activates immediately, deletes only old rdv-static-/rdv-runtime- preview caches, and lets requests use the development server. Sessions, drafts and menu caches are untouched. Registration bypasses HTTP cache for the worker update check; production asset caching remains unchanged. Do not delete production hashed chunks needed by active pages. Language initialization now matches the server on the first render, then restores the saved preference without overwriting it, avoiding a hydration-triggered rerender.

Web and native remove the fixed Tables/More bar. A 60px/60dp round settings button opens the existing role-filtered management modules. It can be dragged within the content safe area, below the toolbar and inside the screen edges. A movement threshold separates dragging from tapping; completing a drag does not navigate. Both clients store a normalized position, preserving it across page changes/restarts and adapting to screen size. Web uses pointer capture and arrow-key movement (Home resets); native uses Compose drag gestures, arrow keys and accessibility move actions. Position storage is separate from sessions/drafts and written only after moving, not on every pointer event.

Web graphical action/status icons use individual official Lucide SVGs in `public/icons/`: settings, refresh, globe, grid, check, ellipsis, back, plus, minus, close, loader and circle. All twelve total 3,342 bytes before compression; only used assets are requested locally. `SvgIcon` uses the SVG as a current-color mask, retaining accessible labels on controls. Source: https://github.com/lucide-icons/lucide/tree/main/icons; the complete upstream ISC/Feather MIT notice is beside the assets. Native reuses official Material vectors, including replacing text-glyph steppers/close and the drawn status dot; no SVG parsing dependency is added. Gear size stays 28px/28dp. Branding retains its canonical SVG; system date/toggle controls are not custom icons.

Managers have Orders, Revenue, Fees, Hot Items, Devices, Access, Menu, and Updates. Waiters retain Orders and gain Updates. Settings returns to Tables; its child screens return to Settings.

Updates shows the web package version and retrieves the latest public Android release through `/api/app-release`. A browser cannot detect an installed APK version. Native shows its actual BuildConfig version and the result of the process-start check; explicit manual checks use the existing mandatory update controller. Check failure is unknown, not “up to date.” Internal debug builds display their version without contacting distribution. These edits remain in the local batch; web type checking passed, Android build/device/update checks are deferred to batch verification.

## Native Android

Cold-start updates use the same native theme, a scrollable safe-area page, bilingual text, version, progress and one download/install action. Every confirmed newer release blocks ordering; there is no skip action. Permission/installation cancellation returns to the same page. Foregrounding during service does not trigger another check. See `android-in-app-updates.md`.

Compose uses the existing brand/background/text colors, rounded bordered cards, centered global titles, the three physical table columns, left menu categories and fixed bottom actions. System safe areas, keyboard and back behavior are native adaptations. Components are in `android/app/src/main/java/com/rdv/order/ui/Components.kt`; shared translations are generated from web sources. Do not replace these screens with a stock Material navigation redesign. See `android-acceptance.md` for the remaining visual comparisons on actual devices.

## Principles
1. Mobile-first, one-hand operation.
2. Keep business flow fast (open table -> add dish -> submit).
3. Visual style: restrained iOS-like glass, high readability.
4. No business behavior inside style-only changes.

## Layout Rules
- Global AppShell only:
  - fixed TopBar
  - scrollable content region
  - round settings action on Tables/Order; no fixed bottom navigation bar
- Respect safe areas (`env(safe-area-inset-*)`).
- Avoid duplicate nav/action bars in page content.

## Spacing & Sizing
- 8px scale for spacing.
- Minimum touch target: 44px.
- Button heights should not drop below 44px on mobile.

## Visual Tokens
Source: `styles/tokens.css`.

- Radius: 12/16
- Shadows: very light
- Glass:
  - `--glass-blur`
  - `--glass-sat`
  - `--glass-surface`
  - `--glass-border`
- Brand accent: deep red for primary CTA
- Table semantic colors preserved:
  - green = idle
  - red = in service

## Component Rules
Source: `components/ui/*` + `styles/ui.css`.

- `Button`
  - `primary`: key action (submit/save)
  - `secondary`: regular action
  - `ghost`: low-priority text/icon action
- `BottomSheet`
  - use for mobile action groups and form tasks
  - supports backdrop close + drag dismiss
- `Toast`
  - anchored above tab bar
  - must not block tab bar touches
- `AppBar`
  - title + optional left/right actions + subline

## State Feedback
- Pressed: subtle scale/brightness change
- Loading: spinner + disabled guard
- Error: clear inline message or toast
- Success: lightweight toast

## Do / Don't
### Do
- Keep primary action obvious.
- Keep control density moderate.
- Keep text and amounts readable first.

### Don't
- Don't add floating dropdowns that overlap core ordering region.
- Don't use heavy shadows or saturated gradients outside required table status blocks.
- Don't add extra overlays if existing BottomSheet can solve the interaction.

## APK download page (2026-09-07)

The independent download page is a single-screen team app selector. Use the hotel's real RDV wordmark (optimized locally from `rdv-website/public/rdv-logo.png`), warm cream `#f4ecdf`, deep green `#21483d`, and system serif typography. The lightly raised top bar and segmented capsule borrow the restrained surface treatment of the Taboo website; only hover transitions remain, respecting reduced motion.

Show only the brand bar, Ordering app / Staff app tabs, app icon/name, download button and release metadata. The staff panel is an unpublished placeholder labelled “制作中 / In the making” with no download link. Per the user's explicit direction, omit feature introductions, account/PIN/backend explanations, platform disclaimers and installation steps. English/Chinese switching preserves the selected app. Arrow keys, Home and End operate tabs with a single tab stop and associated hidden panels. Allow zoom or unusually short screens to scroll rather than clipping controls; ordinary desktop and portrait mobile layouts fit one screen. Backend, APK and native screens are unchanged.

## Pending connectivity UI revision (2026-09-08, source only)

App-level Online/Offline/Weak labels and status dots are removed globally from web/native headers. Table titles use a single vertically centered line; other header titles reserve the space occupied by their tools. Printer/device management state remains visible as business information.

Confirmed connection failures use one centered modal with a Retry button and automatic background retries while the app is in the foreground. The modal closes on successful connectivity, does not dismiss on outside tap/Back/Escape, and uses the app's Chinese/English selection. Normal operation and brief recovered interruptions show no network UI. Do not replace this modal with a header banner. Implementation and deliberately deferred UI checks: `docs/pending-connection-recovery.md`.

## Settings list navigation (2026-09-08, pending batch)

Web `/manage` and native `MoreScreen` now render one full-width entry per row, replacing the two-column button grid. Labels align to the start edge, with a muted trailing chevron and one fine divider per row. Each row is at least 60px/60dp tall and the page scrolls on shorter screens. Existing module order, labels, role filtering and navigation destinations are preserved. No new requests, dependencies, fonts, image packages, timers or animation loops were added; web reuses the existing chevron SVG and native uses the installed vector icon set. Obsolete grid styles were removed.

The local development page at `http://127.0.0.1:3105/manage` was opened through the normal manager login and visually inspected in Chinese and English, with all eight entries present. It is left open in the Codex browser for user confirmation. This is a web preview, not a native APK preview; Android source parity is implemented but no Android build/device check was performed. No automated tests, type check, packaging, version change, commit or publishing in this pass. An existing Orders read failed during the post-login redirect; no business write or printing was performed and this unrelated backend/query issue remains for the combined batch.

2026-09-09 follow-up: order-record actions show Delete directly, without a single-item More menu. All action buttons share a height and wrap as a group; widths follow their labels. Web uses 3rem (minimum 44px), native a shared font-aware minimum 48dp height. Confirmation, manager visibility and action callbacks remain unchanged.

### Historical report rendering (2026-09-09 maintenance)

Android historical orders, revenue, hot items and summary use lazy report rows, preserving existing cards, totals and actions. Only visible/nearby rows are composed; scrolling still reaches every loaded row. Rapid report filter selections are coalesced and processed serially, and only the latest selection may publish data or errors. No completed financial response cache is introduced. See `history-report-reliability.md` for verification and unpublished delivery status.
