# RDV Order 1.0.0 — 2026-09-08

## Release contents

- Flat, tonal login/ordering/management surfaces; round add icons and consistent cooking, notes and cart sheets. Existing ordering and confirmation sequence preserved.
- Draggable floating Settings, replacing fixed bottom navigation; version/update management added.
- Single-row report date presets, simpler menu creation, reduced repeated headings and instructions; final Settings instruction removed on web and native.
- Reduced shared CSS, translation loading waterfall, repeated revenue aggregation, serial management requests and repeated native menu processing. Improved request cancellation, retry selection, bounded cache invalidation and idle DB connection handling. Draft/idempotency protections retained.

Version 1.0.0 marks the accumulated interface/performance milestone, not a claim of zero crashes or complete hotel acceptance. Both localized update details are in `distribution/site/public/release.json`; mandatory update details continue following the Android system language.

## Artifact and checks

- Web package: 1.0.0; native: 1.0.0 / versionCode 8; `com.rdv.order`, production release signing, pinned `https://order.resortdejavu.cn`.
- Public APK: `distribution/site/public/releases/rdv-order-1.0.0.apk`; 1,592,129 bytes (1.52 MiB); SHA-256 `bd9295dbfae3b631bbebd2dccd52be41eb005c0b87481132e62ab6c80b98c503`.
- Min Android 8.0/API 26; target/compile API 36. Same certificate as prior 0.1.6. Historical versioned APKs are immutable.
- New checks: absent Settings copy on both sources, web `tsc --noEmit`, diff hygiene, release lint/R8 build, staging identity/version/signature/alignment/hash/size, and `distribution/site/verify.mjs`: passed.
- Reused without rerunning: 109 distinct web tests + production build, 48 JVM tests and 3 API-35 isolated fixture flows from this batch (`performance-2026-09-08.md`). No live orders/printing, queue changes, login resets or broad device tests.
- Vercel deployment runs only the required production build (`npm run build`), not the already-passing local suite again. Download deployment retains its lightweight metadata/artifact verifier.

## Publication

Source, APK, metadata, stable download rewrite and version label are submitted together. Check both Git-linked Vercel projects against the release commit, then verify public release JSON and APK checksum before announcing the download. Hotel-network/device/physical printer acceptance remains open; it is not replaced by these checks.
