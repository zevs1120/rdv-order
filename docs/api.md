# API Reference

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
| POST | `/api/tables/checkout` | `order.create` |
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

### Open Table
`POST /api/tables`
```json
{ "tableNo": "05", "guestCount": 2 }
```

### Merge Tables
`POST /api/tables/merge`
```json
{ "primaryTable": "01", "secondaryTable": "02", "guestCount": 4 }
```

### Checkout
`POST /api/tables/checkout`
```json
{ "tableNo": "05" }
```

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
