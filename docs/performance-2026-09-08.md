# Performance and reliability — 2026-09-08 local batch

## Changes and measurements

No new lazy loading, artificial progress, delayed business persistence, dependency upgrades or schema changes. Existing order/draft/printing/update protections remain.

| Area | Concrete change |
| --- | --- |
| Global CSS | 48,995 → 33,612 bytes; same Node gzip settings: 8,821 → 6,713 bytes. 31.4% raw / 23.9% gzip reduction for this stylesheet only, not the whole bundle. Removed/trimmed 127 rule blocks after class-reference checks. |
| Translations | Dictionary loads up front, eliminating one dynamic-import waterfall and the translation-loaded state update. Hydration keeps the same server-language snapshot. |
| Revenue | Two duplicate database aggregations → one query with window totals; same accounting filters, JSON shape and integer totals, now one database snapshot. |
| Menu API | Categories, then concurrent item/subcategory reads; same category order and missing-table fallback. |
| Native management | Menu's three and devices' two independent reads start together; the complete result is awaited, with sibling cancellation on failure. |
| Native CPU work | Menu/search/category index reused by menu response; cart quantities indexed by draft lines. Menu/tables/bill/management parsing runs off the UI thread. Immutable volatile scope cache avoids repeated token decoding/hashing while preserving exact token/origin ownership. |
| Web requests | Permanent HTTP failures stop immediately; cancelled requests/backoff stop. Token/payload pinned across retries. Cache bounded to 64 responses; generation invalidation prevents pre-write reads from refilling/joining post-write cache. Malformed successful JSON is rejected, not treated as success or automatically replayed. |
| Server resilience | pg idle-connection errors have an event listener, preventing an unhandled EventEmitter termination. Pool replaces broken connections; logs contain no connection details. |

The Android release already enables R8/resource shrinking; no unsupported APK-size reduction is claimed from a debug build. Final Next build reports shared first-load JS 103 kB and application route first loads approximately 115–128 kB. These are compiler figures, not measured hotel-network timings or a before/after JavaScript comparison.

## Verification

- `RDV_BUILD_DIR=.next-verify npm run verify`: types, 107 tests and production build passed. Covers transport retries/cancellation/cache, concurrent menu reads, idle-pool handling and existing isolated order/printing regressions.
- Subsequent revenue-only change: 2 additional PGlite SQL integration tests passed (paid/closed versus pending/cancelled/merged/out-of-range, multiple charges, empty period, JSON shape and one-query assertion). Final isolated production build, including type checking, passed. Total distinct web tests: **109**; unchanged 107-test baseline reused.
- `npm run android:verify`: 5 resource catalogs, **48 JVM tests**, lint and debug build passed. Lint: 0 errors / 22 warnings. Initial compile found a missing `enabled` parameter from prior UI edits; fixed and rerun successfully.
- Isolated `RDV_API35_ARM64`, serial `emulator-5554`, API 35: **3** selected `NativeFlowTest` cases passed: `seafoodMethodQuantityAndLanguageRemainConsistent`, `managerModulesLoadAsNativeScreensWithoutErrors`, `uncertainSubmitKeepsBasketAndRetryResolvesExactlyOneOrder`. All use in-memory fixture transport/store; no production data/printer calls.
- Local screenshot confirmed ordering layout after CSS cleanup. No cart/category/business actions performed in this optimization pass. `git diff --check` passed. Generated isolated-build type references restored to normal `.next` paths; active local dev output preserved.

## Delivery boundary

Internal APK: `android/app/build/outputs/apk/debug/app-debug.apk`; package `com.rdv.order.test`, `0.1.6-internal` / code 7, min Android 8/API 26, target/compile API 36. It is not a production replacement. No release APK, signing/version change, staging, deployment, commit or push for this batch.

Physical hotel-device performance, real network tail latency, long-duration crash/ANR and physical printing were not measured. Passing checks cannot guarantee zero crashes or uniformly instant responses. Production adoption still needs reviewed web deployment and a properly staged native release with update notes.
