# Backend maintenance — 2026-09-19

## Authorized scope

User requested all backend-only improvements from the read-only review, with no change to existing use, layout, buttons, workflows or business results. No Android/web UI source, client timeout, version, download metadata, APK or delta is changed. No schema migration or new scheduler is required.

## Implemented

- Table bill: four database reads become two. The detail/summary portion uses one snapshot. Order detail and charge aggregation are restricted to the selected table/session orders. Original status, cancellation and merge predicates remain separate and unchanged; no attempted business-rule cleanup is included. Both order timestamps are converted to the exact previous ISO format.
- Receipt preparation: three reads become two; item and charge reads share a snapshot. Exact ticket content, quantities, totals, notes, grouping, ordering and copy count are unchanged.
- Menu: four reads become three, sharing one active-dish scan for current-menu and global search lists. Each retains its original filter and sort order. Public fields, category fallback and 60-second/240-second cache policy remain unchanged. No new financial/menu cache is introduced.
- Checkout: no finance reads when no tax rules are active; otherwise one batch read replaces one read per locked order. Per-order JS rounding, rule order, individual tax inserts, conflict handling, transaction/locks, quote checks and audit remain unchanged.
- Database: main pool remains max 6 by default with existing connection/statement deadlines. Default idle reuse is 30 seconds instead of 10; explicit `DB_IDLE_TIMEOUT_MS` remains authoritative. A separate lazy pool of at most one connection handles only best-effort printer status and print audit writes, with connection wait <=1 second, server statement <=1.5 seconds and client query <=2 seconds. Normal order/delivery state writes retain the business pool. This adds at most one metadata connection per warm process. Metadata failures do not imply a provider failure and do not replay printing.
- Print worker: one atomic claim replaces BEGIN/claim/COMMIT; only the task about to be processed is claimed. Each task is visited at most once per invocation; new claims stop after 60 seconds, leaving later jobs pending instead of leasing an entire batch. Cloud acceptance and database persistence have separate error handling: only the idempotent status save is retried once, never the print submission. Remote job ID audit remains best effort.
- Abandoned `printing` tasks are considered uncertain, not known-unsent. The stale threshold is at least 120 seconds (the worker route lifetime); recovery records the existing unknown-result error and exhausts retries instead of sending again beyond the provider's deduplication window. Active workers, confirmed retryable failures, new-order-only wake, same-key replay and queue-clear semantics remain protected. No production queue sweep is performed by deployment.

## Verification

- `npm run verify`: TypeScript, 164 tests across 35 files, production build passed.
- `npm run check:print-env` with the existing local environment: passed; presence checks only, no printer request.
- Frozen old SQL versus new endpoint on isolated PostgreSQL WASM: full bill response equality across active/preparing/served/paid/closed/cancelled/merged/zero-price orders, historical prices, notes, empty/unopened tables and 2,000 unrelated historical orders. Includes exact timestamp serialization.
- Seven menu selections, including invalid-key fallback: every menu/search field and both sort orders match original reads; cache header and category ordering retained.
- Isolated receipt transport: byte-identical content versus original SQL/formatter, one mocked cloud call, two DB reads; no real print.
- Checkout: 21 orders retain individual tax rounding and expected total using one finance read. Existing quote mismatch, free choices, price snapshots, cancelled/merged exclusions and transaction rollback cases pass.
- Print fault injection: lost DB commit response, both state saves failing, audit failure, active worker at 50 seconds under legacy configuration, abandoned outcome and batch deadline. No extra provider send after acceptance; ordinary known-failure retry remains available.
- Read-only local direct DB sample (SELECT 1 only): first connection 1,902 ms; reused connection 76/75 ms. Observed prior effective config max 6/idle 10s/statement 12s. This motivates modest idle reuse; it is not a hotel-network or production-function speed benchmark.
- No Android/JVM/device builds or tests were rerun because no client source or artifact changed. No live business writes, queue dispatch/clear or test paper.

## Delivery

Commit `77ede665d00817253e8cd71f9dd3fc78d55338b4` pushed through GitHub Desktop. Both final Vercel GitHub checks succeeded, and the authenticated backend production overview independently shows this exact commit Ready. Existing public app remains 1.1.3/code 12 (Android 8+), with its full APK and delta untouched. Physical hotel paper acceptance remains an on-site boundary; fixture acceptance is not proof of a hardware/network repair.


Production evidence (retained locally after the single delivery push):

- Backend: https://vercel.com/renfei-zhaos-projects/rdv-order/24mmqfwmUfxwjQAvjFbjMv5CrruH
- Downloads: https://vercel.com/renfei-zhaos-projects/rdv-downloads/EsHiazC1NAF1Mu8eG2XNYpgXLc7X (same existing artifacts/metadata).
- Initial backend GitHub check reported blocked; final check and production dashboard are successful. No account, project, provider or production-secret configuration was changed.
- Direct/no-proxy GET menu, tables, print health and app release all returned 200. Live menu/current search fields and ordering matched original SQL reads exactly. App release remains 1.1.3/code12. There was no open table, so no live bill/checkout was attempted.
- Health response had `livePrinter.status=unknown`, queue pending=0/failed=1. One separate local direct read-only XPYUN status query returned HTTP200/code0/data1 (online), 366ms. This is a different network path and does not prove hotel paper output or that the earlier server-to-provider status request succeeded. No test print, queue recovery or queue clear was performed.
