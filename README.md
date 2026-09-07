# RDV Order System

Mobile-first ordering system for hotel/restaurant service staff.

This repository contains the production ordering system (Next.js + Postgres + printing).

Native Android client: the signed release APK is `distribution/site/public/releases/rdv-order-0.1.6.apk`, connected to the same production backend. See [delivery record](docs/deployment-delivery.md), [Android builds/tests/signing](android/README.md) and [remaining hotel acceptance](docs/android-acceptance.md). `npm run android:apk` continues to export the separate internal debug build.

Version 0.1.3 adds mandatory updates on cold start; existing 0.1.2 installations need one manual upgrade. See [in-app updates and release workflow](docs/android-in-app-updates.md).

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
- Deploy: Vercel + GitHub; production is live at https://order.resortdejavu.cn

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

The project is deployed in the existing Vercel account and linked to `zevs1120/rdv-order`, production branch `main`. Open [the hotel ordering system](https://order.resortdejavu.cn). Production environment variables have been configured; no re-import is needed. See [deployment runbook](docs/hotel-first-deployment.md) and [verified delivery record](docs/deployment-delivery.md).

`vercel.json` installs with `npm ci --include=dev` and builds with `npm run verify` so each deployment runs types, tests and the Next build. Node 22.x is pinned in `package.json`. Production-branch pushes deploy production; other branches normally create previews. Keep preview data and printers isolated. This does not automatically deploy an unpushed local commit.

The configured function region is `sin1` (Singapore), matching the existing database region. The `rdv-order` project is now created and linked to GitHub; production variables are configured as secrets. Preview deployments are disabled until isolated data is configured. Production uses the stable production domain with application login; Vercel standard protection remains on deployment-specific/preview URLs.

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

## Android app downloads

Employees can use [download.resortdejavu.cn](https://download.resortdejavu.cn) to download the signed APK and read bilingual installation instructions. The independent static Vercel project `rdv-downloads` uses `distribution/site` from the same GitHub main branch. See [download publishing and updates](docs/app-downloads.md). Its build checks the release APK checksum and links; it has no backend secrets.

Android 0.1.2 switches the embedded API origin to the verified custom domain `order.resortdejavu.cn`. Users on 0.1.1 must download the newer APK and install over the existing app; binding a domain cannot update an already installed APK. See [custom-domain fix](docs/android-custom-domain-fix.md).
