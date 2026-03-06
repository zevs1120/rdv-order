# Contributing Guide

## Scope
This repository has multiple folders. `rdv-order` is the production ordering system. Changes in this scope must not break existing business logic unless explicitly requested.

## Branch & Commit Style
Use clear Conventional Commit style:
- `feat(scope): ...`
- `fix(scope): ...`
- `refactor(scope): ...`
- `docs(scope): ...`
- `chore(scope): ...`

Examples:
- `fix(order): prevent duplicate submit on weak network`
- `docs(api): update table billing endpoints`

## Pre-Commit Baseline (Required)
Run all before commit:
```bash
npm run verify
```

If print logic changed, also run:
```bash
npm run check:print-env
```

## Documentation Governance (SSOT)
Docs are source-aligned, not wish lists.

### Rule
If code changes behavior, update docs in the **same commit**.

### Mandatory mapping
- API changes -> update `docs/api.md`
- DB schema/migration changes -> update `docs/technical-overview.md` + related section in `docs/architecture.md`
- UX/visual/component changes -> update `docs/design-guidelines.md` / `docs/design-schema.md`
- Role/permission changes -> update `docs/features.md` + `docs/user-guide.md`
- Startup/deploy/env changes -> update `README.md` + `docs/printer-deploy.md`
- Milestone changes -> update `CHANGELOG.md`

## Pull/Review Checklist
- [ ] Business behavior unchanged (unless request says otherwise)
- [ ] Mobile UI tested (iOS Safari + Android Chrome baseline)
- [ ] No secrets committed (`.env.local`, keys, tokens)
- [ ] Lint / test / build all pass
- [ ] Docs updated according to SSOT mapping above

## Safety Constraints
- Do not use destructive git commands (`reset --hard`, `checkout --`) unless explicitly approved.
- Do not revert unrelated user changes.
- Keep commits scoped and reviewable.
