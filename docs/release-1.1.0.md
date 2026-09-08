# RDV Order 1.1.0 — 2026-09-08

User authorized a fast, comprehensive check of every change since 1.0.0, fixes and publication. This supersedes the source-only limits in the three pending batch notes. Minor version 1.1.0 reflects new menu choices/codes, recovery and incremental updates.

## Scope and checks

- Menu, prices, immutable codes, mandatory meal/drink choices, free/mixed bills, preserved historical order prices, returns, split/merge and printing: reuse 118 passing web/backend tests, Android domain/build/lint and one menu device flow, plus two browser menu sizes from `menu-september-2026.md`. No source change invalidated those results.
- Recovery and updater: 14 focused web tests passed (connection, delta format and shared request behavior), 16 focused JVM tests passed (connection, delta reconstruction/fallback and updater). New Node-generated patch fixture is decoded by Kotlin and must yield the exact target bytes.
- Web typecheck and production build passed after fixing TS2367: the visibility read now occurs through a function so TypeScript does not incorrectly narrow it across an awaited probe. The earlier 118 tests supply the unchanged batch baseline; they were not run again.
- Android resource parity, release lint and R8 signed production build passed. API-35 emulator-5554: two signed-package/FileProvider cases and one recovery dialog case passed. Recovery retained the draft, resisted Back, dismissed on successful Retry and issued no write. The first run hit an Espresso window-focus limitation with two dialogs; use a system Back key and rerun only that one case (passed).
- Browser isolated fixtures at 390×844 and 640×360: Settings has eight entries, recovery modal/Retry fit, Escape retains modal, successful Retry dismisses, no writes, no page errors/overflow. Menu appearance/options reuse the previous screenshots. No broad visual redesign or repeated suite.
- Stage verification passed: package/version, same certificate as 1.0.0, zip alignment, SHA/size, bilingual release notes, stable URL, delta exact reconstruction and download-site verification. Prior print environment presence check reused; no live orders/prints or queue changes.

## Artifact

- Production `com.rdv.order`, version 1.1.0 / code 9; Android 8.0/API 26+, target/compile 36; pinned `https://order.resortdejavu.cn`.
- `distribution/site/public/releases/rdv-order-1.1.0.apk`: 1,608,565 bytes; SHA-256 `9c634275e7bd4998726d42eb38a96bdebaf8e926ce24d1d06950223412090992`.
- Delta from code 8: 1,269,076 bytes; exact target reconstruction verified. Existing 1.0.0 clients still need this full upgrade to acquire delta support. Future applicable updates can use deltas; fresh installs and failures retain the full APK.

## Coordinated publication

Migration 024 applied successfully (152 existing dishes assigned codes; required choices still inactive). Source commit `c597db7` pushed; both GitHub/Vercel statuses succeeded. Backend deployment `EfjDAir3T1DyVjiJhSJSaVFURn9g` is Ready and bound to `order.resortdejavu.cn`; direct HTTPS `/api/connectivity` returned the expected service JSON. Initial transient Account blocked status resolved automatically. An unnecessary CLI fallback was rejected before deployment by its file-count bound; no CLI deployment replaced the Git build. Fresh isolated catalog preview matches all 182 exported registry entries. APK publication and catalog activation are the remaining steps. The release requires two ordered publication steps so an APK never depends on a missing connectivity endpoint/new schema. Staff artifacts/configuration and historical APKs are preserved.

Hotel devices should restart and complete the mandatory upgrade before selecting the new required choices. Physical hotel-network/printer acceptance remains on site; emulator/fixture results do not claim real kitchen paper output.
