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
- Deploy: Vercel + GitHub; current project not yet deployed, import settings prepared in `vercel.json`

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

### 5) Vercel + GitHub deployment

The owner has a Vercel account and previously used this software there; the current project is not deployed. Follow [Vercel setup and automatic deployment](docs/hotel-first-deployment.md): push the verified commit to GitHub, import that repository with its root directory, select the branch containing the fix, and add server-only environment variables.

`vercel.json` installs with `npm ci --include=dev` and builds with `npm run verify` so each deployment runs types, tests and the Next build. Node 22.x is pinned in `package.json`. Production-branch pushes deploy production; other branches normally create previews. Keep preview data and printers isolated. This does not automatically deploy an unpushed local commit.

New orders automatically trigger their own queued kitchen print through Next.js `after()`. Failed jobs retain the original retry/clear controls. No always-on service or cron is needed; the optional `worker:print` utility remains off. The restored trigger has isolated regression coverage; physical printing must still be verified after deployment.

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
