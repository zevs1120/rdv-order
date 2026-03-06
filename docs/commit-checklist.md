# Commit Checklist

Use this checklist before every commit.

## Required Quality Gates
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] (if print logic changed) `npm run check:print-env`

## Security / Safety
- [ ] no secrets in staged files (`.env.local`, keys, tokens)
- [ ] no destructive git operations used to hide unrelated changes
- [ ] no unintended file deletions

## Documentation SSOT
- [ ] API changes reflected in `docs/api.md`
- [ ] DB/migration changes reflected in `docs/technical-overview.md` + `docs/architecture.md`
- [ ] UI/UX changes reflected in design docs (`docs/design-guidelines.md`, `docs/design-schema.md`)
- [ ] user-visible feature changes reflected in `docs/features.md` and `docs/user-guide.md`
- [ ] release-level note added to `CHANGELOG.md`

## Commit Message
Use Conventional Commit style:
- `feat(scope): ...`
- `fix(scope): ...`
- `refactor(scope): ...`
- `docs(scope): ...`
- `chore(scope): ...`
