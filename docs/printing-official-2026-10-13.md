# Official XPYUN direct printing — 2026-10-13

## Problem and requested behavior

The replacement printer passed two physical self-tests, but the first real table 03 order did not print. Its cloud order expired; the separate bill was marked complete about 113 seconds after acceptance. That withdrew the earlier completion claim. The user explicitly requested replacing all printing connection/dispatch code, keeping paper formats, printing one kitchen copy on submit and the priced bill through the separate bill action.

## Implementation

The official [API documentation](https://www.xpyun.net/open/) and [NodeJS SDK](https://image.xpyun.net/xpyun/sdk/nodejs/xpyun-opensdk-nodejs-demo.zip) were downloaded and inspected: `service/httpclient.js`, `service/xpyunservice.js`, model/signature and printer example. The new TypeScript adapter implements the documented wire protocol with Node HTTPS: direct UTF-8 JSON POST, SHA1(user + key + Unix seconds), same configured endpoint, SN/content/copies=1/voice=2/mode=0 and official idempotent key. It does not vendor the SDK's global variables or log its credential-bearing errors. No claim is made that using the protocol alone guarantees physical delivery.

Deleted: internal provider gateway, provider-edge adapter, transport phase/reconnect engine, queue recovery scheduler, Workflow/start modules, diagnostic layer, Workflow dependency and Next plugin. Ticket formatting is retained; the unused combined guest-order rendering is removed. Mode 0 matches the official Node example: an offline printer is rejected immediately. There is no 120-second local scheduling/expiry window. Official 1004 gets at most one identical-key retry; unknown responses, timeouts and 1013 without a remote ID never cause automatic resubmission.

The business transaction saves a print snapshot before COMMIT. The request then awaits its direct submission. The existing print_deliveries history table supplies only immutable intent/deduplication and submission results. Each record can be claimed once; multiple independent orders need no printer-wide software lock. Migration027 drops only that obsolete index. A cloud-accepted job is never resent after a failed database update. Status reads can query the known cloud ID, never print. Historical queues are untouched and excluded from the new sender/retry selection.

The existing APP endpoints and response fields remain compatible. No APK update is needed for this backend change. Bill contents, prices, receipt intent persistence, business order idempotency and accounting remain. The old printer is still registered; reassignment is deferred.

## Verification and delivery

Focused checks passed: 48 tests across official protocol, SQL intent claims, concurrent independent orders, unknown response/no replay, persistence failure/no replay, transaction-before-send ordering, menu options and bill formatting/parity. Full batch verification passed: TypeScript, 143 tests in 35 files, production Next build and credential-presence check. Android source/package is unchanged; its checks were not repeated. Production rollout is pending. Physical acceptance is still pending and must use the final live deployment and actual APP order/bill paths.
