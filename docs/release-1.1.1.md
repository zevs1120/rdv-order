# RDV Order 1.1.1 — 2026-09-09

User approved the reviewed product-experience batch, its direct equal-height order buttons, Git publication, mandatory in-app incremental update and latest full APK on the download page. After this delivery, work is maintenance driven by reported issues/new requests; no proactive feature expansion or monitoring was requested.

## Scope and verification

Reviewed scope: `pending-product-experience.md`. A6 reverse-checkout targeting and A7 default discount/service-fee workflow are explicitly unchanged. Existing 1.1.0 clients can use a verified applicable delta; older/skipped versions and patch failures retain the full signed APK fallback. All new versions remain mandatory under the existing updater policy.

Reused passing baseline: 130 Web tests (31 files), 59 JVM cases, 3 isolated API35 UX flows, and Chinese/English mobile plus desktop Web review. Latest button-only fix passed TypeScript and Kotlin compilation and Web DOM checks (all five buttons 48px); no broad suite repetition. Final version metadata Web typecheck/production build passed; release lint/R8 packaging and signed-package checks are being completed.

Version 1.1.1 / Android code 10, production `com.rdv.order`, Android 8/API26 minimum, target36, pinned `https://order.resortdejavu.cn`. Existing signing key and historical APKs remain unchanged. No new runtime dependencies or database migration.

## Ordered publication

1. Publish source/additive backend APIs first; confirm deployment readiness.
2. Stage immutable signed APK, exact reconstructed delta and bilingual details; publish download metadata together only after the backend is ready.
3. Confirm public download/delta identities and deployment statuses without creating live orders, collecting money or touching printing queues.

Artifact identity, deployment IDs and final evidence will be appended as each step completes. No physical hotel-device/printer output is claimed by emulator checks.
