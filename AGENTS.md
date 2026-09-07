# RDV project working memory

## Android migration (2026-09-07)

- The user authorized implementing a **native Kotlin / Jetpack Compose Android app**, producing an installable APK, adding meaningful tests and documentation, double-checking changes, and committing in separate scopes. The user handles on-site coordination.
- Preserve the existing web application's major layout, interaction order, business rules, connected APIs, database and server-side printing. Do not substitute a WebView or redesign the product.
- The detailed plan is `docs/android-native-migration-plan.md`. Track concrete decisions and implementation evidence in `docs/android-progress.md`; distinguish local/mock verification from real deployment/printer verification.
- Baseline web commit: `ee66a93`. Some older docs/screenshots do not match current code. Current login sends managers to `/manage/orders`, waiters to `/tables`. `/manage/cashier` and `/manage/ops` redirect to `/manage/income`.
- Current order POST inserts order/items/print queue; it does not directly wake the worker or call automatic charge application. Never silently rewrite those server behaviors during client migration.
- The user must supply the actual live URL and target devices and confirm store distribution. Continue independent engineering while waiting; do not invent production connection details or claim on-site printing is tested.
- Server/printing secrets must never be embedded in the APK or documentation. Build artifacts, local toolchains, signing stores and machine-specific configuration are ignored by Git.
- Before a commit follow `CONTRIBUTING.md`: run `npm run verify`; additionally run relevant Android build, unit tests and lint for Android changes. Reuse an unchanged passing web baseline across adjacent Android-only scopes; rerun if web source changes. Do not mark unperformed device/printing checks as passed.
- No production deployment, production test orders or print jobs are implied by implementation/testing authorization. Use isolated fixtures/test environments for automated tests.

## Completion reporting

Report APK location, build type, supported Android baseline, exact tests performed, remaining release blockers and commit IDs. An internal test APK is not an approved production replacement. Keep this file and progress documentation current as decisions arrive.
