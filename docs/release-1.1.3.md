# RDV Order 1.1.3 — print connection repair

Release date: 2026-09-19. Production package com.rdv.order, code 12, Android 8+ (API26), pinned https://order.resortdejavu.cn.

Implementation and incident boundaries: [print-connection-reliability.md](print-connection-reliability.md). Longer provider deadlines, one deduplicated recovery attempt, confirmed bill acceptance/failure, and read-only real cloud status are included in both clients. Legacy APK receipt calls remain compatible during rollout. No schema migration, provider-region switch, historical queue drain or live print test.

## Verification

- 144 web tests; TypeScript and production build passed (version-only metadata change reuses that runtime baseline).
- 62 JVM tests; debug lint/build and release lint/build passed.
- Two isolated API35 device flows passed: delayed bill failure stays visible/no implicit write replay; live offline status appears in the device page without printing.
- Production signer matches 1.1.2; package/min SDK/alignment/size/SHA checked by staging; generated delta restores the exact signed full APK. Download-site verification passed.
- Two signed-package API35 checks passed. Production delivery verified below.

## Artifacts

- Full APK: `distribution/site/public/releases/rdv-order-1.1.3.apk`, 1,625,329 bytes.
- SHA-256: `879a90325e1708a692bcd5e229259d75d5777679e55a23301206442ab6f88a9c`.
- Delta from code 11: `distribution/site/public/releases/rdv-order-1.1.3-from-11.rdvdelta`, 1,290,611 bytes. Full APK fallback remains.
- Chinese detail: 修复打印连接超时，增加安全重试和实时打印机状态，明确显示账单打印失败。
- English detail: Improved print connection reliability with safe retries, live printer status, and clear bill-print failure messages.

Hotel device/network/paper acceptance remains open. Current online reads and isolated fixtures are not proof of resolved on-site intermittent disconnections.

## Production delivery

Commit `b3946e36628459481a1a1e3a3f4055b6896e6077` pushed through GitHub Desktop. Both final GitHub status checks succeeded; Safari's authenticated production overview independently shows this commit READY:

- Backend: https://vercel.com/renfei-zhaos-projects/rdv-order/HnT63JYga9AepNAeLiT6z59J4Vrn
- Downloads: https://vercel.com/renfei-zhaos-projects/rdv-downloads/9yJRX3bk1vdjQmH5tAEcTEuoGzu9

An earlier backend status reported deployment blocked; final state is success without project/account configuration changes. A stale local CLI credential returned 403; Safari was used for the authoritative dashboard check.

Direct production GET /api/print/health returned 200 with the new livePrinter field (online, 381 ms at 06:06 UTC), proving the new backend is serving. GET /api/app-release returned 1.1.3/code12 and both update notes. Queue remains pending=0/failed=1; no live print or queue write was made.

Direct public full APK and delta SHA/size checks and byte-exact public delta reconstruction passed. Initial full download timed out after 60 seconds at 1,182,441 bytes; range resume completed the immutable file, which then matched the full expected SHA. This is local download variability, not a hotel-network measurement. Final evidence is documentation-only and is retained locally to avoid another deployment.
