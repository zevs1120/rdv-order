# RDV Documentation Portal

This folder defines the documentation system for `rdv-order`.

## Doc Map
- `android-native-migration-plan.md` — native Android migration plan and parity gates
- `android-progress.md` — Android implementation evidence, decisions and release blockers
- `android-acceptance.md` — native/web parity checklist and store acceptance
- `../android/README.md` — Android build, tests, packaging and signing
- `api.md` — server API contracts (method/path/auth/request/response)
- `features.md` — feature matrix by role and module
- `user-guide.md` — operational guide for waiter/manager
- `architecture.md` — runtime architecture and end-to-end flow
- `technical-overview.md` — stack, data model, env, migrations, quality gates
- `design-guidelines.md` — UI design principles + component usage rules
- `design-schema.md` — UI information architecture and screen/interaction schema
- `printer-deploy.md` — print provider deployment and health checks
- `ui-shell.md` — AppShell fixed regions and safe-area/z-index strategy
- `visual-system.md` — UI tokens and visual system detail
- `menu-subcategory.md` — menu major/subcategory extension rules
- `submit-order-rca.md` — submit failure root-cause analysis and hardening details

## Documentation Lifecycle (SSOT)
All docs must be derived from actual code in:
- `app/` (pages, APIs)
- `components/` + `styles/` (UI system)
- `lib/` (domain logic)
- `db/` (schema/migrations)
- `.env.example` (runtime config)

If code changes behavior, docs must be updated in the same commit.

## Update Matrix
- API endpoint or payload changed -> `api.md`
- UI flow or structure changed -> `design-schema.md` + `user-guide.md`
- Token/component style changed -> `design-guidelines.md` + `visual-system.md`
- Permission/role policy changed -> `features.md` + `user-guide.md`
- Data model or migrations changed -> `technical-overview.md` + `architecture.md`
- Startup/deploy/env changed -> `README.md` + `printer-deploy.md`
- Release-level change -> `CHANGELOG.md`

## Anti-Drift Rule
No speculative docs. If behavior is not implemented in code, do not document it as available.
