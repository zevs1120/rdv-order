# Printing connection investigation and correction — 2026-09-26

User first requested read-only investigation, then explicitly directed fixing from existing abnormal records without asking staff to identify individual incidents. Keep XPYUN, the device, layout, two-copy order content and Android 1.2.0/code14 unchanged. No extra hardware or platform switch.

## Evidence before changes

Read-only production data at approximately 12:39 GMT+8: today's 29 deliveries comprised 18 cloud-completed, 7 unknown without a cloud ID (all two attempts taking approximately 20 seconds), and 4 expired with cloud IDs. All 36 orders since September 23 20:00 GMT+8 had corresponding delivery records. All four expired IDs returned official queryOrderState=true on a separate read; this proves the local expiry classification was unreliable, not physical paper delivery.

The Vercel request at 12:15:08 (request tcg9g-1790396108129-0fc1685ea731) ran two XPYUN print calls in the API callback, lasting 20.73 seconds. The next successful send at 12:15:30 ran inside a Workflow step (request 8x2vd-1790396129921-65e72219e28d), whose total duration was 2.50 seconds including print and order-state query. Both executed in sin1. This establishes that immediate duplicate attempts consumed the deadline in the request path; it does not prove a stale socket, geographic difference, DNS error or printer defect caused the timeout. Previous transport code discarded detailed network causes.

Existing September 20 evidence includes a direct official API plain-text order, independent of APP and Vercel, reported completed by XPYUN but confirmed by the user not to print. Opening/closing the lid occasionally restoring output may involve cover/paper sensing or internal device state, but no confirmed hardware diagnosis exists.

[Official XPYUN API](https://www.xpyun.net/open/) defines expiresIn as the period during which an order may be automatically loaded for printing. It does not authorize inferring that an accepted remote order can never complete afterward. queryOrderState accepts the cloud order ID, not an idempotency key; five-minute request deduplication cannot recover a missing remote ID.

## Correction

- One sending owner: the existing durable Workflow. Remove all four API after() print callbacks. Each Workflow step attempts at most one send; the sole same-key retry is scheduled five seconds later, within the original sending/deduplication windows.
- Replace shared fetch transport with native Node HTTPS, a separate socket per request, normal certificate validation, bounded response size, and a total deadline that destroys the timed-out request. Endpoint, account, device, signature, content and timeouts remain unchanged. This removes connection reuse as an opaque factor; it is not proof that reuse was the original cause.
- Separate the 120-second deadline for new sends from the ten-minute read-only confirmation period for accepted cloud orders. Retain remote IDs if confirmation remains unknown. Never resend accepted content automatically.
- Retry excludes even historical failed/expired records with a remote ID, preventing a false expiry from becoming another cloud order. Existing records are not rewritten or replayed during deployment.
- Internal connection diagnostics preserve method, phase, safe error/status code and duration without credentials, serial numbers or receipt content. No new staff prompts, dependencies, schema or APK.

## Verification and delivery

36 distinct focused checks passed: transport4, queue8, order route8, receipt route3, order/print SQL integration7, menu/options integration6. Two old queue assertions initially expected immediate retry; corrected them to verify the five-second delay and reran only that file. TypeScript, Next production build and print environment presence check passed. Existing Android/client baselines reused; no unrelated suite, emulator or APK packaging.

The new transport made two read-only official queries locally: printer online268ms and an existing order completed272ms. No new print, historical replay/clear, device configuration change or live business write was performed. Deployment confirmation is recorded after publication. Physical uninterrupted printing remains unverified; cloud status is not paper acceptance.
