# RDV project working memory

## Android migration (2026-09-07)

- The user authorized implementing a **native Kotlin / Jetpack Compose Android app**, producing an installable APK, adding meaningful tests and documentation, double-checking changes, and committing in separate scopes. The user handles on-site coordination.
- User clarification: this repository is the existing ordering software built specifically for their own hotel. Migrate this exact product for that one hotel. There is no multi-store product, tenant onboarding, store selection, or commercial distribution requirement. Refer to the hotel and its existing backend/devices; do not ask the user to decide a store/distribution strategy.
- Preserve the existing web application's major layout, interaction order, business rules, connected APIs, database and server-side printing. Do not substitute a WebView or redesign the product.
- The detailed plan is `docs/android-native-migration-plan.md`. Track concrete decisions and implementation evidence in `docs/android-progress.md`; distinguish local/mock verification from real deployment/printer verification.
- Baseline web commit: `ee66a93`. Some older docs/screenshots do not match current code. Current login sends managers to `/manage/orders`, waiters to `/tables`. `/manage/cashier` and `/manage/ops` redirect to `/manage/income`.
- Current order POST inserts order/items/print queue; it does not directly wake the worker or call automatic charge application. Never silently rewrite those server behaviors during client migration.
- Resolve the hotel's existing backend address and target Android devices from available project context, asking only for information that cannot be established. APK installation for the user's hotel is the requested delivery; no separate store-distribution decision is needed. Do not invent connection details or claim physical printing is tested.
- Server/printing secrets must never be embedded in the APK or documentation. Build artifacts, local toolchains, signing stores and machine-specific configuration are ignored by Git.
- Before a commit follow `CONTRIBUTING.md`: run `npm run verify`; additionally run relevant Android build, unit tests and lint for Android changes. Reuse an unchanged passing web baseline across adjacent Android-only scopes; rerun if web source changes. Do not mark unperformed device/printing checks as passed.
- No production deployment, production test orders or print jobs are implied by implementation/testing authorization. Use isolated fixtures/test environments for automated tests.
- Native client now lives in `android/`; `npm run android:verify` runs resource parity, JVM tests, lint and APK build. `ANDROID_SERIAL=<isolated-device> npm run android:verify -- --device` additionally runs device tests. Always specify a serial for installs/device commands; multiple AVDs may be connected.
- `npm run android:apk` exports signed debug `artifacts/android/rdv-order-0.1.0-internal.apk` plus SHA/signature/alignment/metadata. Internal package `com.rdv.order.test`, min API 26, target/compile 36. Production `com.rdv.order` requires a pinned HTTPS origin and local signing configuration; neither has been supplied.
- Current local evidence: web verify 67 tests + build; Android 29 JVM + 12 API-35 device tests, lint/build. See `docs/android-progress.md` for exact boundaries and `docs/android-acceptance.md` for remaining parity/CRUD/CSV/physical print/device acceptance. Do not call this production-ready or equate fixture callbacks with actual printing.
- Low-height native ordering content scrolls while cart/submit remain visible. Device screenshot tests must assert actual visibility and capture the whole display (dialogs use separate windows); a passing synthetic click alone previously missed clipped landscape controls.
- Native implementation commit `53c69fa`, recovery API `c1966d2`, plan baseline `b8c2885`. Final internal APK installed/cold-started on API 35; phone, 360dp small-screen/1.3 font and 640dp landscape screenshot flows passed. Curated fixture screenshots are in `docs/android-assets/`; exact APK checksum and release blockers in `docs/android-progress.md`.

## Completion reporting

Report APK location, build type, supported Android baseline, exact tests performed, remaining release blockers and commit IDs. An internal test APK is not an approved production replacement. Keep this file and progress documentation current as decisions arrive.
