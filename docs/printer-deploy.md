# Printer Deploy Checklist

## Print Behavior (Current)
- Order submit prints **kitchen copy only** (single printer target by default).
- Current `app/api/orders/route.ts` atomically stores orders/items/print jobs; it does **not** directly wake the worker. Verify the actual deployment's dispatch scheduler/worker before relying on queue progress.
- Guest copy is printed only when staff explicitly triggers `Print Receipt` in order bill panel.
- Default is single copy (`PRINT_FORCE_SINGLE_COPY=true`) to reduce duplicate print risk.

## Native Android client

The native APK calls the existing ordering, bill-printing, health, queue and dispatch endpoints. No direct Bluetooth/USB printer path or embedded provider credentials are added. The new read-only request-status endpoint does not create print jobs. APK compilation and fixture tests cannot establish physical printing; follow `android-acceptance.md` and record queue/provider/paper outcomes separately. Android build/signing instructions are in `../android/README.md`.

## 1) Select Provider
- `PRINT_PROVIDER=cloud`
- `PRINT_PROVIDER=agent`
- `PRINT_PROVIDER=xpyun`

Optional fallback provider:
- `PRINT_FALLBACK_PROVIDER=cloud|agent|xpyun`

## 2) Required Environment Variables

### Common
- `DATABASE_URL`
- `JWT_SECRET`
- `PRINT_PROVIDER`

### Cloud provider
- `PRINT_CLOUD_URL`
- `PRINT_CLOUD_API_KEY`

### Agent provider
- `PRINT_AGENT_URL`
- `PRINT_AGENT_TOKEN`

### XPYUN provider
- `XPYUN_API_URL` (default available)
- `XPYUN_USER`
- `XPYUN_USER_KEY`
- `XPYUN_SN`

### Reliability / operation
- `PRINT_WORKER_KEY`
- `DEVICE_HEARTBEAT_KEY`
- `PRINT_TIMEOUT_MS`
- `PRINT_WAKE_ON_ORDER` is a legacy/config diagnostic flag; current order POST does not invoke a worker regardless of this value. A real scheduler is required.
- `PRINT_STALE_PRINTING_SECONDS`
- `PRINT_RETRY_DELAY_SECONDS`
- `PRINT_MAX_RETRY`
- `ORDER_DEDUPE_WINDOW_SECONDS`
- `PRINT_FORCE_SINGLE_COPY=true`

## 3) Pre-Deploy Check
```bash
npm run check:print-env
```

Fix all reported `problems` before production deployment.

## 4) Production Verification
1. Submit one test order (should print kitchen copy).
2. In order bill panel, tap `Print Receipt` (should print guest copy).
3. Check `/api/print/health` with manager account.
4. Optional retry trigger: `POST /api/print/dispatch`.

## Always-on cloud dispatcher

`npm run worker:print` starts `scripts/print-dispatcher.mjs` as a separate process. Required environment: `PRINT_DISPATCH_ORIGIN` (HTTPS root URL; HTTP allowed only on loopback for isolated tests) and the backend's `PRINT_WORKER_KEY`. Variables must be injected into the process; this script does not read Next.js `.env.local`. It needs no database/provider credentials. Never put the worker key in the APK or a public variable.

The process waits 60 seconds on startup, then POSTs `{ "limit": 1 }` to the existing `/api/print/dispatch` endpoint with `x-print-worker-key`. Each response completes before the next poll, normally after a one-second delay. Network/server/invalid-response errors wait 60 seconds; HTTP 401/403/404 exits with a failure so configuration is fixed instead of silently retrying. Logs contain counts or generic errors, without response bodies or credentials. A `printed` count means server/provider success, not proof of physical paper.

Use exactly one automatic scheduler with sleeping disabled; retire an older cron/worker before enabling this one. Give the process at least 65 seconds to stop: SIGTERM prevents new polls and lets an in-flight request finish (60-second request timeout). Do not run manual dispatch concurrently during acceptance. Confirm provider timeouts and the existing server lease/retry settings before activation. Unknown provider outcomes can still cause a physical duplicate under the existing retry model; this runner does not add printer-side idempotency or claim exactly-once paper output.

Before starting against hotel configuration, inspect pending/failed/printing jobs and obtain approval for any test paper. Keep the dispatcher off while reviewing old queued jobs. Use an isolated DB and fake print provider for initial integration. To stop automatic dispatch, stop this process; a request already accepted by the backend may finish. Do not delete queued jobs as a rollback shortcut.

Local verification: 9 dispatcher tests use isolated fetches and controlled timing; `npm run check:print-env` was also run with explicit fixture-only values. These are configuration/protocol checks, not a connection or paper test. Cloud setup and acceptance sequence: [hotel-first-deployment.md](hotel-first-deployment.md).

## 5) Health / Self-Test APIs
- `GET /api/print/health` — config + queue + warnings
- `POST /api/print/self-test` with `{ "target": "kitchen|bar|both" }`
- `POST /api/print/dispatch` with `{ "limit": 10 }`

## 6) Operational Notes
- Keep `PRINT_SPLIT_BY_TARGET=false` for single-printer stores.
- Use bar-category/keyword routing only when physical print paths are actually separated.
- If printer/network instability affects service, set `PRINT_WAKE_ON_ORDER=false`; orders still save and print jobs stay available for manual dispatch.
