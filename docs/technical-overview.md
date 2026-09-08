# Technical Overview

## Menu schema 024 (pending rollout)

`menu_items` adds immutable sequence-assigned `code`, JSON `option_groups` and `is_complimentary`. `order_items` adds `choices` and `unit_price`; an insert trigger validates required choices, snapshots price and adds printable choice labels to notes. Legacy prices are frozen at migration time before repricing; earlier price history cannot be reconstructed. All accounting/printing paths prefer saved prices. Catalog refresh preserves unmatched active employee dishes, checks a durable code registry and rolls back on mapping drift. Details: `menu-september-2026.md`.

## Stack
- Next.js 15 App Router (`app/`)
- React 18 + TypeScript
- PostgreSQL via `pg`
- JWT auth via `jose`
- Vitest for tests
- Vercel deployment target

## Runtime Structure
- UI pages: `app/**/page.tsx`
- API routes: `app/api/**/route.ts`
- Domain logic: `lib/*.ts`
- DB schema/migrations/seeds: `db/`
- Shared UI components: `components/ui/`
- Global styles/tokens: `styles/`, `app/globals.css`

## Key Domain Tables
- `users`
- `menu_items`
- `menu_major_categories`
- `menu_subcategories`
- `orders`
- `order_items`
- `order_charges`
- `order_events`
- `print_jobs`
- `table_sessions`
- `table_session_tables`
- `pricing_rules`
- `role_permissions`
- `audit_logs`
- `device_status`

## Configuration (Environment)
See `.env.example`.

Required baseline:
- `DATABASE_URL`
- `JWT_SECRET`
- print provider settings

Print-related critical keys:
- `PRINT_PROVIDER`
- cloud: `PRINT_CLOUD_URL`, `PRINT_CLOUD_API_KEY`
- agent: `PRINT_AGENT_URL`, `PRINT_AGENT_TOKEN`
- xpyun: `XPYUN_USER`, `XPYUN_USER_KEY`, `XPYUN_SN`
- optional reliability keys:
  - `PRINT_WORKER_KEY`
  - `DEVICE_HEARTBEAT_KEY`
  - `ORDER_DEDUPE_WINDOW_SECONDS`
  - `PRINT_WAKE_ON_ORDER`
  - retry/timeout keys in `.env.example`

## Build/Test Commands
```bash
npm run dev
npm run lint
npm run test
npm run build
npm run check:print-env
```

## Migration Policy
- New schema changes must be additive/backward-compatible when possible.
- Add migration in `db/migrations/`.
- Update docs in same commit (`technical-overview.md`, `architecture.md`, `api.md` if API affected).

## Reliability Baseline
- Submit idempotency key support (`X-Idempotency-Key`)
- Duplicate-submit guard window
- Print jobs are async queue-based with retries
- API fetch wrappers with timeout/retry behavior
- Permission checks enforced in API layer
