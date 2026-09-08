# Changelog

All notable changes to this project are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.1.0] — 2026-09-08

- Refresh the approved menu prices, immutable global dish codes and required meal/drink choices; preserve employee dishes and snapshot order prices through bills, returns, split/merge, reports and printing.
- Replace network indicators with confirmed-failure recovery dialogs; resume safe reads automatically while preserving drafts, edits and uncertain writes.
- Add optional verified APK delta downloads with full-package fallback, automatic checks in Updates, bounded menu caching and cancellation of obsolete report queries.
- Use a single-row Settings menu on web and Android. Release 1.1.0 / code 9 retains the production origin, certificate and Android 8 minimum.
- Reuse the completed menu/billing checks; add focused recovery/updater checks and final builds. See `docs/release-1.1.0.md` for evidence and rollout status.

## [1.0.0] — 2026-09-08

- Refined login, ordering, cart/cooking/note sheets and management screens with flat tonal surfaces, clearer rectangular actions and lightweight official icons. Kept familiar ordering and confirmation flows.
- Replaced fixed bottom navigation with a draggable settings button; added version/update management. Simplified date presets and menu creation, removed repeated titles and unnecessary instructions.
- Reduced obsolete shared styling; removed the translation fetch waterfall, duplicate revenue aggregation and needless retries. Native management reads run concurrently, with menu indexing and background response parsing.
- Preserved drafts, order idempotency, printing and mandatory updates; improved cancellation, cache invalidation and idle database connection recovery.
- Web version 1.0.0; native version 1.0.0 / code 8, same production package, origin and signing certificate. Prior APKs remain immutable.

## Earlier changes
### Android 0.1.3 — in-app updates
- Added one bounded cold-start version check, mandatory updates for every newer published APK, download progress/retry, package verification and Android installation confirmation. Previously confirmed requirements persist across restarts; a failed first check does not prevent ordering.
- Added local signed-release staging to verify identity, version, certificate and alignment, then update APK/download metadata together. No business API or printing changes.

### Team app downloads
- Replaced the download page with a single-screen bilingual Ordering app / Staff app selector, using the hotel's wordmark, cream/green palette and a light capsule treatment inspired by Taboo. Preserved the signed 0.1.2 APK and added an unpublished staff placeholder.
- Removed feature descriptions, login/configuration explanations, platform disclaimers and installation steps at the user's request. Added keyboard tab navigation and build guards for the placeholder, local assets and translations.

### Android 0.1.2 — custom backend domain
- Bound the existing backend to order.resortdejavu.cn and pinned the signed versionCode 3 APK to it, addressing reported login timeouts reaching the old Vercel origin.
- Preserved old local session/draft/cache/uncertain-submission storage for this verified domain alias; added three upgrade/isolation regression tests. Updated the public download page and stable APK link.

### APK downloads
- Added a bilingual static Android download page and verified signed release artifact, with a separate Git-linked Vercel project for download.resortdejavu.cn.

### Deployment delivery (2026-09-07)
- Created and connected the Vercel production project to GitHub main, configured 15 production secrets and Singapore functions, and verified the first automatic deployment plus 17 live read-only checks.
- Built the pinned-origin, long-term signed Android 0.1.1 release APK with R8, release lint, signature/alignment checks and private local signing backup. Physical paper and target-device acceptance remain open; see `docs/deployment-delivery.md`.

### Added
- Vercel import configuration with Node 22.x and verification before every build; GitHub production/preview setup instructions. Eight isolated PostgreSQL WASM integration tests exercise order-to-print state, idempotency and queue clearing.
- Opt-in cloud print dispatcher for the existing API, with single-flight polling, bounded requests, failure backoff, shutdown handling and isolated tests. First cloud deployment runbook records the hotel's hosting decision and pending deployment/real-printer acceptance.
- Native Kotlin / Compose Android internal APK with ordering and management screens, encrypted local drafts and submission recovery, shared resource generation, JVM/device tests and repeatable build/verification/packaging scripts. Store acceptance and release signing remain pending.
- Authenticated owner-scoped read-only `/api/orders/request-status` for recovering committed orders after lost responses; existing order/pricing/printing writes are unchanged.
- Revenue CSV export from Manage → Revenue with natural-month range selection (single month or month range).
- New export API endpoint: `/api/manage/income/export`.
- Documentation: `docs/revenue-export.md`.
- Coverage for summary, table bill, checkout, and reverse-checkout accounting edge cases.

### Changed
- Deployment dependency fixes: Next.js 15.5.25, Vitest 3.2.7, PostCSS 8.5.28 override and refreshed sharp/nanoid lock resolutions; added test-only PGlite 0.5.8.
- Corrected deployment assumptions to the user-confirmed working Vercel baseline. The optional dispatcher is not required; historical order-trigger changes must be reconciled before altering hosting.
- Documentation system refactor and governance baseline (README/docs/contributing).
- Global top bar now owns subpage back navigation and centered titles for manage/admin detail pages.
- Language switching moved to a globe icon toggle in the global top bar.
- Network status indicator simplified to a green/red status dot in the global top bar.
- Tables / Order / Manage surfaces aligned to the same glassmorphism visual system with unified app bars, cards, search fields, action bars, and bottom navigation styling.
- Revenue, summary, hot-items, cashier close, and table-bill calculations now share a stricter “exclude cancelled + merged source orders” accounting rule.

### Fixed
- Restored automatic kitchen printing after a new order through Next.js `after()`, targeting that order so older queued failures cannot consume its print attempt. Replayed submissions do not schedule another print; manual retry and queue clearing remain unchanged.
- Android 0.1.1 internal: queued draft saves retain their original account ownership; expired sessions clear prior UI data before re-login; submission cooldown resets after login. Added regression tests.
- Removed duplicate in-page back modules from manage/admin subpages to keep navigation hierarchy consistent.
- Removed extra top-bar `More` button from the global shell.
- Summary totals no longer overcount orders with multiple line items and now include order-level charges consistently.
- Reverse checkout now reapplies active automatic pricing rules instead of silently dropping them.
- Table bill and checkout summaries no longer include cancelled orders or merge-source orders.
- Login now accepts trimmed / case-insensitive staff usernames, preventing failures such as `joy` vs `Joy`.
- PWA bootstrap now clears legacy service workers and `rdv-*` caches instead of re-registering them, to reduce reload-loop behavior on mobile.

## [2026-03-06]
### Added
- Global mobile AppShell with fixed top bar + fixed tab bar + safe-area layout.
- UI glass tokens and z-index token system for mobile overlays.
- New docs: `docs/ui-shell.md`, `docs/visual-system.md`.
- Manager-only create/delete for menu major categories and subcategories.
- Menu admin API and UI support for subcategory management.

### Changed
- Order submit interaction hardening (loading/error/retry feedback, dedupe guard).
- Toast/BottomSheet interaction behavior for mobile.
- Order page mobile layout rewritten to improve narrow-screen compatibility.
- Bottom navigation architecture switched to global shell rendering.

### Fixed
- Submit flow reliability under weak networks.
- Duplicate submission protection + idempotency behavior.
- Table/bill/order UI overlap issues in multiple mobile breakpoints.

## [2026-03-05]
### Added
- Printing integration for XPYUN cloud printer.
- Guest copy printing support and print health/self-test endpoints.
- Hot items reporting page and API.
- Fee rules management and automatic application to open orders.
- Role-based permission management UI (RBAC).

### Changed
- Manage module reorganized into home + subpages.
- Menu structure aligned with breakfast/lunch/dinner/beverage/cocktail/package.

## [2026-02-15]
### Added
- Initial MVP baseline for login, tables, order, summary, serverless APIs.
