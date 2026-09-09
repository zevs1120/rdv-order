# RDV Order 1.1.2 — 2026-09-09

User explicitly authorized committing, pushing and deploying the history/revenue reliability fix to both production projects, with the latest full APK on the download site and a differential in-app update. No business writes or print queue operations are part of this release.

## Fix and verification

Details: `history-report-reliability.md`. Native historical lists render lazily; native/web coalesce rapid report selections and serialize reads, suppress obsolete results and avoid premature automatic replay. Financial data is not cached, and accounting SQL is unchanged.

Reused implementation checks: 132 web tests, TypeScript/build; 61 JVM tests, debug lint/build; one API35 fixture with 2,000 orders and 20 rapid changes (exactly two requests, one maximum concurrent read, final selection retained). Release-specific checks: release lint/build, prior signing-certificate match, APK version/package/min SDK/alignment, download metadata/site verification, byte-exact delta reconstruction and two signed-package API35 tests. No physical hotel-device/network or printer acceptance is claimed.

## Artifacts

- Production `com.rdv.order`, version 1.1.2/code 11, Android 8+ (API26), pinned `https://order.resortdejavu.cn` origin.
- Signed full APK: `distribution/site/public/releases/rdv-order-1.1.2.apk`, 1,625,081 bytes, SHA-256 `65950a4415a5306aa70d1a8857e06b5c7d3ef2288e60ab4fea9aec6d0fff6ddd`.
- Delta from 1.1.1/code 10: `distribution/site/public/releases/rdv-order-1.1.2-from-10.rdvdelta`, 1,278,175 bytes (21.3% smaller), SHA-256 `94e8c7462f92f1a139800e5ca4871e8091ac7ae7c472a7f02b2309b1a21fa149`. Restores the exact signed APK from immutable 1.1.1; full download/fallback is retained.
- Chinese update detail: 修复历史订单和收入查询频繁切换时的卡顿，优化查询稳定性。
- English update detail: Fixed slowdowns when switching history and revenue date ranges and improved query reliability.

## Deployment

Prepared for one main-branch push to both existing Git-linked Vercel projects. Final deployment states and public checksum evidence will be recorded after the push. No new runtime tests are required for that documentation-only evidence update.
