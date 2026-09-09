# Historical report maintenance — 2026-09-09

Reported by the user on Android 1.1.1: repeatedly selecting last year / last three months / last month in order history and revenue becomes slow and sometimes reports connection failure. This is maintenance, not feature expansion.

## Findings and scope

- Read-only production SQL inspection: 1,881 orders (all within one year); income SQL execution 8.463 ms and order-history SQL 32.509 ms in this sample. Warm DB round trips were 181 ms / 164 ms; initial connection plus count was 1,035 ms. These measurements do not reproduce the hotel's HTTP/network conditions and do not prove all production requests are fast.
- Native report `Column.verticalScroll` composed every returned card, including thousands of history cards. Changed to `LazyColumn` with stable order keys; headers, totals and operations remain available. This bounds composition rather than silently dropping history rows or changing accounting totals.
- Native filter changes cancelled an active HTTP read and started another immediately. Web aborted requests likewise. Server SQL does not automatically stop when the client cancels. Both clients used approximately six-second deadlines with automatic retries while server statements permit twelve seconds, so a slow read could be retried before its original server work ends.
- Both clients now serialize report reads and coalesce rapid selections over 180 ms. Only the newest selection publishes a result/error; intermediate pending reads never reach the server. Financial responses are not cached. Native navigation/session termination cancels its worker; web unmount drops queued reads and ignores any active result.
- Management report reads allow 20 seconds with no automatic replay. This accommodates the existing server execution budget; it is not a claim that queries now take 20 seconds or that a longer timeout alone improves performance.
- No database schema, accounting SQL, production business data or print queue was changed. No HTTP load test was run against production.

## Verification

- `npm run verify`: 132 tests across 32 files, TypeScript check, production build passed.
- Android debug JVM tests: 61 passed; debug lint and build passed.
- One targeted API-35 isolated-device case (`NativeFlowTest#largeReportsStayLazyAndRapidSelectionsPublishOnlyLatest`) passed on emulator-5556. It loads 2,000 orders, confirms the final row is initially absent from composition then scrolls to it, changes the range 20 times during an active delayed read, verifies exactly two requests (the active and final selections), maximum concurrent reads of one, final selection/data and no error. It also clicks last year / three months / month in revenue.
- New queue unit tests cover serial scheduling, conflation, stale-result suppression, cancellation, failure recovery and fresh reads without a completed-response cache.
- Remaining boundary: real hotel phone/network behavior has not been measured after this change. The device case uses fixture transport, not live HTTP or printing.

## Delivery state

The user subsequently explicitly authorized committing, pushing and deploying both projects, including a full public APK and differential in-app update. Signed 1.1.2/code 11 is prepared; publication and final identity evidence are tracked in `release-1.1.2.md`. Previous runtime checks above are reused for the unchanged implementation. Release lint/build, signature/alignment, exact delta reconstruction and two signed-package API35 checks passed.
