# RDV Order 1.1.3 — print connection repair

Release date: 2026-09-19. Production package com.rdv.order, code 12, Android 8+ (API26), pinned https://order.resortdejavu.cn.

Implementation and incident boundaries: [print-connection-reliability.md](print-connection-reliability.md). Longer provider deadlines, one deduplicated recovery attempt, confirmed bill acceptance/failure, and read-only real cloud status are included in both clients. Legacy APK receipt calls remain compatible during rollout. No schema migration, provider-region switch, historical queue drain or live print test.

## Verification

- 144 web tests; TypeScript and production build passed (version-only metadata change reuses that runtime baseline).
- 62 JVM tests; debug lint/build and release lint/build passed.
- Two isolated API35 device flows passed: delayed bill failure stays visible/no implicit write replay; live offline status appears in the device page without printing.
- Production signer matches 1.1.2; package/min SDK/alignment/size/SHA checked by staging; generated delta restores the exact signed full APK. Download-site verification passed.
- Two signed-package API35 checks passed. Production delivery pending push.

## Artifacts

- Full APK: `distribution/site/public/releases/rdv-order-1.1.3.apk`, 1,625,329 bytes.
- SHA-256: `879a90325e1708a692bcd5e229259d75d5777679e55a23301206442ab6f88a9c`.
- Delta from code 11: `distribution/site/public/releases/rdv-order-1.1.3-from-11.rdvdelta`, 1,290,611 bytes. Full APK fallback remains.
- Chinese detail: 修复打印连接超时，增加安全重试和实时打印机状态，明确显示账单打印失败。
- English detail: Improved print connection reliability with safe retries, live printer status, and clear bill-print failure messages.

Hotel device/network/paper acceptance remains open. Current online reads and isolated fixtures are not proof of resolved on-site intermittent disconnections.
