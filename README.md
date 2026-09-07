# RDV Order System

Mobile-first ordering system for hotel/restaurant service staff.

This repository contains the production ordering system (Next.js + Postgres + printing).

Native Android client: see [android/README.md](android/README.md) for building the internal APK, tests and signing. `npm run android:verify` checks the native app; `npm run android:apk` exports a signed debug APK to `artifacts/android/`. Store acceptance is tracked in [docs/android-acceptance.md](docs/android-acceptance.md); the internal APK is not yet a production replacement.

## What This System Does
- Staff login with account + PIN
- Table board: open table, merge/unmerge, close, checkout
- Order flow: category-based ordering, notes, cart, submit, bill view
- Manager operations: orders, revenue, fees, hot items, devices, RBAC, menu management
- Printing: cloud/agent/XPYUN, queue + retry + health/self-test
- Bilingual UI (Chinese/English), mobile PWA shell, weak-network hardening

## Tech Stack
- Frontend/API: Next.js 15 (App Router), React 18, TypeScript
- Database: PostgreSQL (Neon/Supabase compatible)
- Auth: JWT (`jose`)
- Testing: Vitest
- Deploy: Node service; first cloud deployment is being prepared, no live deployment assumed

## Quick Start

### 1) Install
```bash
npm install
```

### 2) Environment
```bash
cp .env.example .env.local
```

Minimum required:
- `DATABASE_URL`
- `JWT_SECRET`
- print provider config (one of cloud/agent/xpyun)

See `.env.example` and `/Users/qiao/Downloads/rdv-order/docs/printer-deploy.md`.

### 3) Initialize / migrate DB
For new database:
```sql
\i db/schema.sql
\i db/seed.sql
```

For existing database, apply migration files in order under `db/migrations/`.

### 4) Run
```bash
npm run dev
```

### 5) Cloud operation (preparation, not deployed)

The hotel owner selected cloud hosting. Deploy this same Next.js application and keep the existing API and database model. See [first deployment runbook](docs/hotel-first-deployment.md) for the remaining account, region, data and release decisions.

The web service runs `npm ci`, `npm run build`, then `npm start`. A separate always-on process runs `npm run worker:print` with `PRINT_DISPATCH_ORIGIN` and the same `PRINT_WORKER_KEY` as the backend. It calls the existing print dispatch API; starting it can send pending jobs to the configured printers. Configure one automatic dispatcher, with no sleeping or overlapping scheduler. The dispatcher does not load `.env.local`; inject its two variables through the cloud platform. First validate against an isolated backend and simulated printer. Do not start it against an unreviewed existing queue.

## Quality Baseline
Before any commit, run:
```bash
npm run verify
```

## Default Accounts (seed)
- Manager: `Mercy / admin`
- Manager: `Leo / admin`
- Waiter: `Maria / 12345`
- Waiter: `Joy / 12345`
- Waiter: `Dani / 12345`

## Documentation Index
- Documentation portal: `/Users/qiao/Downloads/rdv-order/docs/README.md`
- API reference: `/Users/qiao/Downloads/rdv-order/docs/api.md`
- Features: `/Users/qiao/Downloads/rdv-order/docs/features.md`
- User guide: `/Users/qiao/Downloads/rdv-order/docs/user-guide.md`
- Architecture: `/Users/qiao/Downloads/rdv-order/docs/architecture.md`
- Technical overview: `/Users/qiao/Downloads/rdv-order/docs/technical-overview.md`
- Design guidelines: `/Users/qiao/Downloads/rdv-order/docs/design-guidelines.md`
- Design schema: `/Users/qiao/Downloads/rdv-order/docs/design-schema.md`
- Changelog: `/Users/qiao/Downloads/rdv-order/CHANGELOG.md`
- Contribution + commit/doc governance: `/Users/qiao/Downloads/rdv-order/CONTRIBUTING.md`

## SSOT Principle
All docs must be derived from repository code (routes, schema, pages, components, env files). When code behavior changes, update the corresponding docs in the same commit.
