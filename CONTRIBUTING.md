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

## Verification: proportional, once per relevant change

User direction (2026-09-08): keep verification focused. Do not spend the development cycle repeatedly checking unchanged code. These rules supersede older blanket instructions to run the full suite before every commit.

- Choose checks for the actual change and risk before running them. Small changes get small checks; do not automatically run web + Android + device + deployment checks together.
- Reuse passing results while their source/configuration/dependencies remain unchanged, including across adjacent commits in the same delivery. A new commit by itself does not invalidate the baseline.
- Documentation, comments and working-memory edits need only a focused diff review; do not rerun builds, runtime tests, device flows or live API checks.
- For web changes, use targeted checks during development. Run `npm run verify` once before delivering a batch that changes web source, configuration or dependencies; reuse an unchanged passing web baseline for Android-only work.
- For Android changes, run the affected tests and a suitable build/lint once for the completed batch. Use device tests for changes that depend on real Android UI, lifecycle, permissions or installation, rather than replaying every device flow for every edit.
- For printing changes, run the relevant order/print tests and `npm run check:print-env`; never exercise production orders or historical queues merely to reconfirm unrelated work.
- Rerun a check only after a relevant change, a failure, or concrete unresolved evidence. Fixing a test harness calls for rerunning that test, not all already-passing suites.
- Once the relevant checks pass and no concrete issue remains, stop testing and deliver. Do not add extra cross-checks, screenshots, scenarios or repeated status polls solely for reassurance.
- Group related changes into one delivery/push where practical, preserving scoped commits. Avoid repeatedly triggering deployment pipelines for intermediate documentation or evidence updates.
- Record which results were reused and any material untested boundary briefly. Never describe unperformed checks as passed.

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
