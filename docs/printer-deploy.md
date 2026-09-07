# Printer Deploy Checklist

## Print Behavior (Current)
- User-confirmed acceptance baseline: the previous Vercel deployment automatically printed after submission, with the existing queue-clear button for operator recovery. Do not infer that Vercel needs a separate scheduler just from the current local route.
- Git history: `d89d3ec` awaited the worker after order commit; `0b704d8` changed that to background wake; `ee66a93` removed the call. The user confirms there is no current deployment. This change restores the missing trigger before creating the new Vercel project.
- Order submit prints **kitchen copy only** (single printer target by default).
- Current `app/api/orders/route.ts` atomically stores orders/items/print jobs and schedules `runOrderPrintWorker(orderId)` through Next.js `after()` only for a newly inserted order. The automatic claim targets that order, so older failed/pending jobs do not consume its attempt. Same-key replay does not print again. The route uses Node.js and `maxDuration=120`; no separate scheduler is required.
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
- `PRINT_WAKE_ON_ORDER=true` (default): automatically attempts printing new orders. `false` keeps jobs queued for existing manual dispatch.
- `PRINT_STALE_PRINTING_SECONDS`
- `PRINT_RETRY_DELAY_SECONDS`
- `PRINT_MAX_RETRY`
- `ORDER_DEDUPE_WINDOW_SECONDS`
- `PRINT_FORCE_SINGLE_COPY=true`

## 3) Pre-Deploy Check
The authorized Vercel setup uses production-only secrets and the Singapore function region matching the database. No optional dispatcher or cron is activated. The existing historical queue is retained; deploying the app alone does not drain it.

```bash
npm run check:print-env
```

Run this command with the intended environment injected; the script does not load `.env.local` itself. It checks configuration presence, not printer connectivity. Automatic order printing does not require the worker-key header; that key belongs to external dispatch. Local fixture checks are not proof of valid hotel credentials.

## 4) Production Verification
1. Submit one test order (should print kitchen copy).
2. In order bill panel, tap `Print Receipt` (should print guest copy).
3. Check `/api/print/health` with manager account.
4. Optional retry trigger: `POST /api/print/dispatch`.

## Optional cloud dispatcher (not required for the existing Vercel workflow)

This utility has never been activated. It is not a prerequisite for preserving the user's Vercel setup.

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

## 已部署配置（2026-09-07）

`rdv-order` 已在现有 Vercel 账号上线，GitHub `main` 自动部署；正式根网址为 https://rdv-order-renfei-zhaos-projects.vercel.app 。Node 22.x、Next.js、`sin1` 区域与仓库构建命令已生效。15 项生产变量通过秘密输入传输保存，Preview 停用且无营业凭据。实际经理登录后的 `/api/print/health` 返回配置 ready=true，provider=xpyun；原 108 条 pending 保持不变。健康检查验证配置与队列读取，不代表云打印服务收到新任务或纸张已打印；本次没有发送营业测试单、清队列或启动 dispatcher。具体记录见 [deployment-delivery.md](deployment-delivery.md)。

## APK 下载入口

新增静态下载项目 `rdv-downloads`（GitHub 同仓库，根目录 `distribution/site`），子域名 `download.resortdejavu.cn`。该项目只提供安装包，不连接数据库或打印服务；现有 `rdv-order` 后端与 APK 内置接口地址保持不变。更新说明见 [app-downloads.md](app-downloads.md)。

## 后台自定义域名（0.1.2）

`order.resortdejavu.cn` 绑定同一 `rdv-order` 生产项目。APK 0.1.2 预置新地址，替代原 .vercel.app 地址的网络访问路径；原 API、数据库、环境变量和打印队列规则不变。经理实际登录后，无代理访问新域名的打印健康返回 ready=true，历史 pending=108。未向打印机发送测试单，详见 [android-custom-domain-fix.md](android-custom-domain-fix.md)。
