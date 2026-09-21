# API Reference

## Backend maintenance (2026-09-19)

Existing request/response fields, permissions and client workflows remain unchanged. Bill reads are combined and scoped to relevant orders; menu/current search share a scan; checkout batches finance reads without changing amounts or locking. Receipt preparation retains byte-identical content. Print recovery never resends abandoned unknown outcomes or cloud-accepted jobs just because a database save failed. See [implementation and verification](backend-maintenance-2026-09-19.md).

## Configurable menu and internal codes (2026-09-08, pending rollout)

Requires migration 024. `GET /api/menu` adds `code`, `option_groups`, `is_complimentary` per item and `searchItems` for global exact numeric search. Shared beverages may belong to breakfast via `available_shifts` without duplicate IDs. `POST /api/orders` items accept `choices: { [groupId]: optionId }`; the server requires exactly one valid selection per group, derives/saves prices and printable labels, and returns 400 for invalid choices. Choices participate in deduplication; no client price is accepted. Bill/order-detail items include `order_item_id`. Return-item accepts `orderItemId` to target one variant; ambiguous legacy returns return 409. Split/merge copy price/choice snapshots. See `menu-september-2026.md` for coordinated rollout and evidence.

## Read-path optimization (2026-09-08 local batch)

Public response shapes, authorization and write/printing endpoints are unchanged. `/api/menu` reads items and subcategories concurrently after resolving the main category, preserving item-first category ordering and the missing-table fallback. `/api/manage/income` supplies daily rows and total count/amount through one SQL aggregation with window totals, keeping paid/closed, cancellation, merge and date filters unchanged. This removes duplicate aggregation and gives totals/details one database snapshot. Both clients benefit. Evidence: `performance-2026-09-08.md`.

## Public release metadata

`GET /api/app-release` retrieves validated public Android release metadata from the fixed download origin. Returns version, versionCode, bilingual notes and download URL with no-store caching; returns 503 on failure. Used by the web Updates settings screen. No database/printer access or installed-device version detection.

Base: Next.js Route Handlers under `app/api`.

## Auth & Permission
- JWT bearer token: `Authorization: Bearer <token>`
- Permission checks are enforced server-side (`requirePermission`).
- Worker-only header for print dispatch: `X-Print-Worker-Key`.

## Endpoint Index

| Method | Path | Permission |
|---|---|---|
| POST | `/api/login` | public |
| GET | `/api/menu` | public |
| POST | `/api/menu/custom` | `order.create` (+ `menu.manage` for permanent mode) |
| GET, POST | `/api/tables` | `order.create` |
| POST | `/api/tables/merge` | `order.create` |
| POST | `/api/tables/unmerge` | `order.create` |
| GET | `/api/tables/bill` | `report.orders` |
| POST | `/api/tables/print-bill` | `order.create` |
| GET, POST | `/api/tables/checkout` | `order.create` |
| PATCH | `/api/tables/guests` | `order.create` |
| POST | `/api/tables/close` | `order.create` |
| POST | `/api/tables/reverse-checkout` | `cashier.reverse_checkout` |
| POST, GET | `/api/orders` | `order.create` / `report.orders` |
| GET | `/api/orders/request-status` | authenticated waiter/manager; only own requests |
| DELETE | `/api/orders/[id]` | `order.delete` |
| POST | `/api/orders/[id]/cancel` | `order.cancel` |
| POST | `/api/orders/[id]/return-item` | `order.return_item` |
| POST | `/api/orders/[id]/charges` | `order.adjust_charge` |
| POST | `/api/orders/[id]/split` | `order.split_merge` |
| POST | `/api/orders/merge` | `order.split_merge` |
| GET | `/api/manage/orders` | `report.orders` |
| GET | `/api/manage/income` | `report.finance` |
| GET | `/api/manage/hot-items` | `report.finance` |
| GET | `/api/manage/ops` | `report.ops` |
| GET | `/api/summary` | `report.finance` |
| GET, PATCH | `/api/pricing/rules` | `cashier.close_shift` |
| DELETE | `/api/pricing/rules/[id]` | `cashier.close_shift` |
| GET, PATCH | `/api/devices` | `device.view` / `device.manage` |
| POST | `/api/devices/heartbeat` | key-based (`DEVICE_HEARTBEAT_KEY`) |
| POST | `/api/print/dispatch` | `device.manage` or worker key |
| DELETE | `/api/print/queue` | `device.manage` |
| GET | `/api/print/health` | `device.view` |
| POST | `/api/print/self-test` | `device.manage` |
| GET, PATCH | `/api/admin/permissions` | `rbac.manage` |
| GET, POST | `/api/admin/menu-items` | `menu.manage` |
| PATCH, DELETE | `/api/admin/menu-items/[id]` | `menu.manage` |
| GET, PUT | `/api/admin/menu-items/[id]/components` | `menu.manage` |
| GET, POST | `/api/admin/menu-categories` | `menu.manage` |
| DELETE | `/api/admin/menu-categories/[key]` | `menu.manage` |
| GET, POST | `/api/admin/menu-subcategories` | `menu.manage` |
| DELETE | `/api/admin/menu-subcategories/[id]` | `menu.manage` |
| GET, POST | `/api/cashier/close` | `cashier.close_shift` |

## Core Payload Examples

### Login
`POST /api/login`
```json
{ "username": "Mercy", "pin": "admin" }
```

### Submit Order
`POST /api/orders`
- header (optional but recommended): `X-Idempotency-Key: <8-80 chars>`
```json
{
  "tableNo": "05",
  "guestCount": 2,
  "shift": "lunch",
  "items": [
    { "menuItemId": "uuid", "qty": 1, "note": "no onion" }
  ]
}
```

Order/items/queue are saved atomically. On a new insertion, `after()` automatically processes that order's queued print (unless `PRINT_WAKE_ON_ORDER=false`). Same-key replay keeps the existing response and does not register another print or recreate a cleared job. The success response confirms the saved order, not physical paper. Printing failures stay available through existing queue operations; runtime/lifecycle errors do not turn an already committed order into a submission failure.

### Open Table
`POST /api/tables`
```json
{ "tableNo": "05", "guestCount": 2 }
```

### Change Current Guest Count
`PATCH /api/tables/guests`
```json
{ "tableNo": "05", "guestCount": 4, "expectedSessionId": "uuid" }
```

`guestCount` must be an integer from 1 to 20. The optional `expectedSessionId` rejects a stale/reopened table with 409. The update locks the open session, writes an audit entry and returns `{ tableNo, guestCount, sessionId, openedAt }`. Only current session headcount changes; existing order guest-count snapshots and accounting remain unchanged.

### Current Table Bill and Orders
`GET /api/tables/bill?tableNo=05` also returns `sessionId` and `openedAt` alongside the existing bill fields.

`GET /api/manage/orders?sessionId=<uuid>` uses the recorded session's table number and opening/closing boundaries instead of the default daily date filter. Closed-session end boundaries are exclusive. An optional `tableNo` must match that session (otherwise 404); invalid UUIDs return 400. Existing date/table-only requests retain their behavior and permissions.

### Merge Tables
`POST /api/tables/merge`
```json
{ "primaryTable": "01", "secondaryTable": "02", "guestCount": 4 }
```

### Checkout
`GET /api/tables/checkout?tableNo=05` returns `{ tableNo, sessionId, openedAt, orderCount, totalAmount }` from a read-only transaction. The amount projects the existing automatic tax rules and includes charges already applied, without duplicating automatic taxes. Fetch it immediately before displaying payment confirmation.

`POST /api/tables/checkout`
```json
{ "tableNo": "05", "expectedSessionId": "uuid", "expectedTotalAmount": 225 }
```

The optional confirmation fields reject changed sessions or amounts with 409, before committing any checkout changes. Clients should refresh and request confirmation again. Original `{ "tableNo": "05" }` requests remain supported. This does not change discount/service-fee or reverse-checkout workflows.

### Update Pricing Rules
`PATCH /api/pricing/rules`
```json
{
  "rules": [
    {
      "id": "optional-uuid",
      "name": "Service Fee 10%",
      "charge_type": "service_fee",
      "mode": "percent",
      "value": 10,
      "is_active": true,
      "sort_order": 10
    }
  ]
}
```

### Create Subcategory
`POST /api/admin/menu-subcategories`
```json
{
  "shift": "beverage",
  "name": "Tea",
  "displayNameZh": "茶"
}
```

## Error Style

### Recover a timed-out order submission (additive endpoint)

`GET /api/orders/request-status?key=<X-Idempotency-Key>` returns
`{ "found": true, "orderId": "..." }` or `{ "found": false }` with `Cache-Control: no-store`.
The key uses the same 8–80 character letters/digits/underscore/hyphen validation as order submission.
Results are scoped to the authenticated user's `waiter_id`, including manager-created orders.
This read does not require the table to remain open and never creates or reprints an order.
Native clients can use it after a lost response/process restart, before retrying the original immutable payload with the original key.
A missing result is a snapshot, not a guarantee that an in-flight POST cannot still commit; retries must always retain the original key.
Older deployments return 404 for the missing route; native clients fall back to the existing idempotent POST.
No database migration or existing endpoint behavior change is required.
- 401: unauthorized / not signed in
- 403: forbidden / insufficient permission
- 400: validation/input error
- 500: internal or operation failure

## Source of Truth
- API implementation paths: `app/api/**/route.ts`
- Permission logic: `lib/permissions.ts`

## Pending connection probe (2026-09-08, source only)

`GET /api/connectivity` is public and returns HTTP 200 with `{ "service": "rdv-order" }`. The route is dynamic and sends `Cache-Control: no-store, max-age=0`. It performs no database, authentication or printer operations. Clients use it only to confirm access to the hotel origin, not to certify business/printing health. Deploy this additive endpoint before the future native connectivity-recovery release. Verification is deferred to the combined release per user instruction; see `docs/pending-connection-recovery.md`.

### Print reliability (1.1.3)

`POST /api/tables/print-bill` accepts optional `waitForResult: true`: returns 200 `{ok:true, accepted:true, remoteJobId}` after provider acceptance, 503 on rejection/offline, 504 on unknown transport outcome. It does not guarantee physical paper output. Omitting the flag retains the legacy 202 background contract. Both paths audit receipt failures. Clients use 45-second deadlines and never automatically replay a print write.

`GET /api/print/health` adds `livePrinter: {status, checkedAt, latencyMs}`. This is a read-only XPYUN query; status is online/offline/degraded/unknown. Configuration `ready` remains separate. A failed query produces unknown. Self-test errors now retain actionable provider/connection descriptions. New clients retry one queued job per action.


### 芯烨云回执兼容说明（2026-09-20）

打印接口 URL、请求体及 APP 调用方式不变。`waitForResult=true` 的成功仍表示获得云端接受及订单号，不保证实体出纸。芯烨云1013去重回执若没有原云订单号，按既有未知结果错误路径返回（账单504），不再返回成功。官方1004最多同键重试一次；其它参数/鉴权错误不自动重复提交。详见 [接入重整](xpyun-integration-2026-09-20.md)。


### 两联与完成查询（2026-09-21，取代上节1013处理）

XPYUN自动下单恢复厨房联及前台联；同一云订单一次提交两联内容。API请求格式不变。1013去重回执按请求已识别返回接受，不再误报设备失败，`remoteJobId` 可能为null，不能用它证明已打印。厨房worker及账单/自检的after阶段对有ID的云订单查询完成状态，写入 `print.delivery` 审计（completed/pending/unknown）；false或查询失败不会触发重发或增加打印失败次数。手机响应不等待这些查询。无ID时记录unknown，不查询虚构ID。
