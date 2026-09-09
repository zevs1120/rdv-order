# RDV Order 1.1.1 — 2026-09-09

User approved the reviewed product-experience batch, its direct equal-height order buttons, Git publication, mandatory in-app incremental update and latest full APK on the download page. After this delivery, work is maintenance driven by reported issues/new requests; no proactive feature expansion or monitoring was requested.

## Scope and verification

Reviewed scope: `pending-product-experience.md`. A6 reverse-checkout targeting and A7 default discount/service-fee workflow are explicitly unchanged. Existing 1.1.0 clients can use a verified applicable delta; older/skipped versions and patch failures retain the full signed APK fallback. All new versions remain mandatory under the existing updater policy.

Reused passing baseline: 130 Web tests (31 files), 59 JVM cases, 3 isolated API35 UX flows, and Chinese/English mobile plus desktop Web review. Latest button-only fix passed TypeScript and Kotlin compilation and Web DOM checks (all five buttons 48px); no broad suite repetition. Final version metadata Web typecheck/production build passed; release lint/R8 packaging passed. Two signed-package device checks on isolated API35 passed; staging verified signature continuity, alignment, production identity and exact delta reconstruction. Download-site verification passed.

Version 1.1.1 / Android code 10, production `com.rdv.order`, Android 8/API26 minimum, target36, pinned `https://order.resortdejavu.cn`. Existing signing key and historical APKs remain unchanged. No new runtime dependencies or database migration.

## Ordered publication

1. Publish source/additive backend APIs first; confirm deployment readiness.
2. Stage immutable signed APK, exact reconstructed delta and bilingual details; publish download metadata together only after the backend is ready.
3. Confirm public download/delta identities and deployment statuses without creating live orders, collecting money or touching printing queues.

Source commit `d348fe3` is pushed to main. Its production backend deployment `rdv-order-ckj7wav6s-renfei-zhaos-projects.vercel.app` is READY before publishing update metadata.

Full signed APK: `distribution/site/public/releases/rdv-order-1.1.1.apk`, 1,625,081 bytes, SHA-256 `0d395cb92cfd33efb53dded6785e56b341e29a150d52e6025a9e757677aff269`.

Delta from code 9: `distribution/site/public/releases/rdv-order-1.1.1-from-9.rdvdelta`, 1,288,712 bytes (20.7% less download), SHA-256 `a1b3c4fbd6399f571b72f93bbf96044d25d8896223e97c361fa0d62564760788`. Metadata, bilingual details, stable link and download page are staged together. Final public identity/deployment evidence follows after the release push. No physical hotel-device/printer output is claimed by emulator checks.


## Final delivery evidence

Release commit `7442fa3` pushed to main after source `d348fe3`. Both Git-based production deployments are READY:

- Backend: `dpl_28Ub2FUordn75SRvzk5sFP6np7P1`, `rdv-order-31qvy2s3u-renfei-zhaos-projects.vercel.app`.
- Downloads: `dpl_77chYoyygpFCJLcYgHQUsCPCBCQY`, `rdv-downloads-p8cfum8fg-renfei-zhaos-projects.vercel.app`.

Direct, no-proxy HTTPS checks passed: public `release.json` exactly matches staged metadata; backend `/api/app-release` returns 1.1.1/code 10 with matching bilingual details; new checkout GET route rejects unauthenticated requests with 401. Public full APK and delta size/SHA-256 match the identities above. Reconstructing the downloaded delta against the unchanged 1.1.0 APK produces byte-for-byte the downloaded signed 1.1.1 APK.

Public download: https://download.resortdejavu.cn ; full APK: https://download.resortdejavu.cn/releases/rdv-order-1.1.1.apk . Existing updater cold-start/Updates checks and mandatory installation remain; delta is applicable from code 9 with full fallback. No release blocker remains from performed checks. Actual hotel-device upgrade and physical printer acceptance are not claimed; no live business/printing/queue writes were performed. This final local evidence update does not trigger a third documentation-only deployment.
