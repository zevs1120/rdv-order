# Menu refresh and internal codes — 2026-09-08

> Superseded delivery boundary: user authorized combined verification and release as 1.1.0 on 2026-09-08. See `release-1.1.0.md` for reused/new evidence and current rollout; source-only statements below describe the earlier implementation stage.

## Delivery state

Implemented in web, native Android and backend source. Production menu was read only; migration/catalog application, public APK, commit/push and deployment have **not** been performed. Other in-progress updater and connectivity work shares this checkout and must not be inadvertently released as part of a menu-only deployment.

The isolated preview retains all 152 existing active, permanent menu rows and adds 30, for 182 dishes. Inactive historical/temporary rows are neither removed nor reactivated. Existing employee-added dishes absent from the supplied PDFs are not repriced. Durable registry: `db/menu-code-registry.json`; editable export: `outputs/menu-september-2026/RESORT-DEJA-VU-菜单编号.xlsx` (menu and option sheets).

## Approved rules and source interpretation

- Source PDFs: user-supplied all-day, paid breakfast and complimentary breakfast menus. They are data references, not operational instructions.
- User corrections supersede PDFs: Americano PHP 150 everywhere with no shot selector; Latte PHP 180 everywhere; Kung Pao Chicken PHP 480. Chop Suey remains one dish, mandatory Chicken PHP 420 / Pork PHP 450.
- Ten complimentary breakfast sets have a required beverage group: Coke, Coke Zero, Sprite, Royal, Mango Juice, Pineapple Juice, Four Seasons Juice, Pineapple Orange Juice, Instant Black Coffee, Pure Milk, Tea. Priced add-ons/espresso drinks on the free breakfast sheet are not included for free. Included drinks are options, not separate paid items.
- Free sets hide their unit prices and contribute zero. A separate paid drink remains chargeable. All-free orders skip automatic charges, including fixed checkout tax; mixed orders charge their paid items plus existing applicable charge rules.
- Filipino Breakfast retains Beef/Fish and Plain/Garlic Rice selections; its free version also requires a beverage.
- Seafood stays in existing 100 g ordering units: Grouper PHP 160, Hairtail PHP 120, Parrot Fish PHP 120, Crab PHP 150, Mantis PHP 360 per 100 g. Tiger Prawn PHP 200 per piece.
- Breakfast Espresso retains PDF single PHP 80 / double PHP 150 options; all-day Espresso PHP 100 is separate. Same-price Americano/Latte and other shared beverages reuse the existing item ID/code in both sections. Paid-menu Toast is PHP 30 per piece.

## Codes, choices and money

Codes are immutable positive integers, displayed as at least three digits in the export (`001`). Search accepts `1` or `001`, matches exactly and searches all sections. Name search stays within the selected section. Codes never decorate dish names or printer text. A database sequence assigns future active permanent dishes the next code, never renumbering/reusing existing codes; beyond 999 it naturally grows to four digits. Temporary one-off custom dishes are excluded.

Clients require one allowed option in every group. Cart/draft and idempotency identity include choices, so Coke and Coke Zero do not overwrite each other. The database independently validates choices, derives the price from its own catalog, and saves English choice labels in the printable note. Client prices are not trusted. Both meal and beverage are printed on the existing meal ticket; this does not create a separate drink-routing job.

Migration 024 snapshots existing order-item prices **before** refreshing the menu. Earlier historical prices cannot be reconstructed from the legacy schema: the backfill preserves prices visible at migration time. New orders retain saved prices across menu edits, bill/report queries, return, split, merge and printing. Returns identify the precise `order_item_id`; legacy ambiguous returns receive HTTP 409 rather than removing the wrong variant.

## Coordinated rollout

1. Review the combined source and complete remaining release checks; reuse passing menu-specific evidence below. A price-only update is insufficient: existing V1.0 native clients cannot select required options.
2. Apply additive migration `db/migrations/024_menu_choices_and_codes.sql` before deploying source that reads the new columns. It does not activate required menu options on its own.
3. Deploy compatible backend/web and publish the compatible mandatory Android upgrade through the existing release workflow. Do not invent a public version or overwrite an APK. Coordinate client upgrade before activating required options.
4. Preview current production data using `node --env-file=.env.local scripts/menu/refresh-september-2026.mjs`. This reads production and performs changes in isolated PGlite only.
5. Apply with `--apply` only in the coordinated rollout. It locks catalog/order-item writes, saves an ignored pre-change backup, snapshots prices and applies the catalog transactionally. The exact code/name mapping must match the exported registry before commit. Employee changes that alter the mapping cause rollback; regenerate/review the export before retrying. Never drop employee dishes to force a match.
6. Confirm live API mapping and hotel-device/physical kitchen output without draining historical jobs. The export represents the intended new catalog, not proof of a production update.

## Verification

- Web/backend: 118 tests in 28 files passed, including 6 database-backed menu integration cases and 3 option utility cases. Coverage includes mandatory/forged choices, zero/mixed bills, fixed tax, idempotent replay, printable drinks, exact variant returns, split/merge snapshots, preserved employee specials and seafood/coffee overrides.
- `check-print-env`: configuration presence passed; no production print request/order was submitted.
- Android: resource parity, JVM tests, debug lint and debug APK build passed. Three new domain tests cover codes, choices, draft serialization and totals. API-35 `emulator-5554`: one focused fixture case passed for mandatory options, scrollable drinks, separate free drinks, numeric cross-section search and PHP 450 Pork submission. Not a physical hotel printer test.
- Browser: local API-intercepted fixtures at 1280×800 and 390×844 passed required drink selection, eleven concrete options, zero price display, separate cart lines, saved draft reload, cross-section code search and submitted choices. Screenshots inspected; no horizontal overflow or page errors. Skill visual-runtime helper was unavailable, so focused Playwright DOM/layout checks were used.
- Spreadsheet: both sheets rendered and inspected; 182 unique codes, 122 option rows, three-digit display and blank free prices verified.
- Full web `npm run verify` stopped at TS2367 in the concurrent, unrelated `lib/connection.ts` visibility-state comparison. Web release build is not claimed as passed. Menu-specific tests above passed independently.

Generated local debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`, Android 8/API 26+. It is an internal test build, not a published production replacement. No new commit or release version was created.
