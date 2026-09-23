# Architecture

## Printing replacement — 2026-09-23

Printing now uses `lib/printing/{tickets,transport,queue,service,start,workflow}.ts`. Each immutable `print_deliveries` task has one durable Workflow and a per-printer database sending lease. The workflow is started before its business transaction commits; an orphan workflow cannot see a rolled-back task. `after()` only accelerates sending. XPYUN handles short offline buffering (mode 1, expiry bounded by task creation +120 seconds). See [scope and evidence](print-rebuild-2026-09-23.md); earlier worker/fallback descriptions below are historical.


## Configurable ordering (2026-09-08, pending rollout)

Web/native clients select required options and key cart/draft lines by dish plus canonical choices. The backend validates options and snapshots the catalog-derived price and printable labels atomically with order insertion. Free sets contribute zero; separately purchased drinks remain paid. Bill, report, return, split, merge and print paths retain those snapshots. Menu codes are immutable internal search keys, not display/print prefixes. Migration must precede compatible server deployment; compatible mandatory native upgrade must precede activating required selectors. See `menu-september-2026.md`.

## System Topology
- Client: Next.js mobile web app (PWA-capable)
- API: Next.js Route Handlers (`app/api/*`)
- DB: PostgreSQL
- Print pipeline: async `print_jobs` queue + worker dispatch
- Deployment: Vercel serverless + external Postgres

## End-to-End Order Flow
1. User login (`/api/login`) -> JWT in local storage.
2. Open table (`/api/tables`) or merge table (`/api/tables/merge`).
3. Fetch menu (`/api/menu`) by major category/shift.
4. Submit order (`/api/orders`):
   - permission check
   - idempotency + duplicate guard
   - write `orders` + `order_items`
   - auto-apply active pricing rules (`order_charges`)
   - enqueue `print_jobs`
   - trigger one print worker pass
5. Bill review (`/api/tables/bill`), optional guest copy print (`/api/tables/print-bill`).
6. Checkout (`/api/tables/checkout`) -> close table and finalize states.

## Order State Model
Current enforced core states in schema:
- `submitted`
- `paid`
- `closed`

Compatibility note:
- Some query logic still tolerates historical states (`preparing`, `served`) from older data.

## Permission Model
- API-level RBAC via `requirePermission(req, permission)`.
- Permission defaults + DB overrides in `role_permissions`.
- Manager-only capabilities include menu admin, fees, devices, RBAC, finance reports.

## Data Model Highlights
- `table_sessions` + `table_session_tables` represent table lifecycle and merge mapping.
- `orders`, `order_items`, `order_charges`, `order_events` represent financial and audit trail.
- `pricing_rules` controls auto fees/discount/tax application.
- `print_jobs` decouples order submit from physical printing.
- `menu_major_categories` + `menu_subcategories` drive top tabs + left category rail.

## Reliability Design
- Idempotency key support: `X-Idempotency-Key`.
- Duplicate submit detection window (`ORDER_DEDUPE_WINDOW_SECONDS`).
- Confirmed print failures retain bounded retries. Atomic single-task claims do not resend abandoned unknown outcomes or replay cloud acceptance after a database save failure; see `backend-maintenance-2026-09-19.md`.
- API client timeout + retries.
- Audit logs for sensitive actions.

## UI Runtime Shell
- Fixed TopBar
- Scrollable content region
- Fixed bottom TabBar
- Safe-area handling for iOS/Android
- Layer token system to prevent overlay collisions

See also:
- `/Users/qiao/Downloads/rdv-order/docs/ui-shell.md`
- `/Users/qiao/Downloads/rdv-order/docs/visual-system.md`
