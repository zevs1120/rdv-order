# Printer Deploy Checklist

## Print Behavior (Current)
- Order submit prints **kitchen copy only** (single printer target by default).
- Order submit stores the order first, then wakes the print worker in the background.
- Guest copy is printed only when staff explicitly triggers `Print Receipt` in order bill panel.
- Default is single copy (`PRINT_FORCE_SINGLE_COPY=true`) to reduce duplicate print risk.

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
- `PRINT_WAKE_ON_ORDER=true` (`false` keeps orders queued without auto-waking printer)
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

## 5) Health / Self-Test APIs
- `GET /api/print/health` — config + queue + warnings
- `POST /api/print/self-test` with `{ "target": "kitchen|bar|both" }`
- `POST /api/print/dispatch` with `{ "limit": 10 }`

## 6) Operational Notes
- Keep `PRINT_SPLIT_BY_TARGET=false` for single-printer stores.
- Use bar-category/keyword routing only when physical print paths are actually separated.
- If printer/network instability affects service, set `PRINT_WAKE_ON_ORDER=false`; orders still save and print jobs stay available for manual dispatch.
