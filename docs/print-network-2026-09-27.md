# Printing network incident — 2026-09-27

The user reports continued frequent no-paper failures after8038fe8 and has authorized backend investigation. One official-console test, `RDV-CLOUD-0927-A`, and one marked system self-test have been submitted; physical output remains pending. Do not ask staff to reconstruct individual table/timestamp records. No historical queue replay, printer rebind or node switch is authorized.

## Observations

Read-only production records after September26 12:49:30 GMT+8:22 orders all have delivery records;7 order deliveries have no remote cloud ID after failed requests,14 are cloud-completed,1 received a remote ID but was not confirmed within the tracking window. Including separate receipt and self-test intents,75 deliveries comprise45 connection-error/no-ID records,29 cloud-completed and1 unconfirmed with ID. Operator-cancelled records retain their previous errors; cancellation is not proof of successful paper.

At September27 13:08–13:09 GMT+8, six existing production health calls all returned printer status unknown after4002–4008ms. Vercel logs for five available calls explicitly showed queryPrinterStatus, phase=connect, reason=timeout, no HTTP status,4001–4007ms. Sample request `vtwvl-1790485735061-ade5f9937d91` executed in sin1 and lasted4.01s. No TCP-connect event was observed before the deadline; TLS/HTTP had not begun. Old instrumentation did not capture DNS errors, target IP or address family.

During the same interval, the same source transport with local credentials returned online in282/215/308ms over three direct reads; local lookup returned IPv4 101.37.24.59. This is evidence of an execution-path-dependent connection failure. It does not establish whether the cause is differing DNS answers, a specific Vercel egress path, transit loss or filtering at the provider. It cannot be repaired by ticket formatting, UI prompts or queue status changes.

The morning08:10–08:19 failures are outside accessible detailed runtime-log retention. [Vercel's published Hobby runtime log retention](https://vercel.com/docs/logs/runtime) is one hour. Yesterday's console-only diagnostics therefore did not provide durable evidence when staff reported later; this was an investigation gap.

[XPYUN official documentation](https://www.xpyun.net/open/) lists China, Singapore and Germany as distinct nodes. The Singapore host is not documented as an interchangeable failover hostname for the existing China-node device/account. No node or account changes are made on that assumption.

## Narrow diagnostic change

Keep all send/queue/retry deadlines, API endpoint, device/account, IPv4/IPv6 selection, two-copy content and UI unchanged. Capture bounded safe lookup/address-family/connection-attempt details and TCP/TLS timings. Health returns the connection observation as an additive manager-readable field. Failed sends/health checks preserve safe details in the existing audit_logs through the existing bounded metadata pool; no new schema, dependencies or monitoring service. Diagnostics never include keys, signing inputs, account identifiers, printer SN or receipt content, and never trigger a print.

This change is diagnostic, not a claim of restored printing.

## Deployment evidence

The diagnostic-only change is LIVE via `167cdc87ddc673c5fff1be307ea278dda4c8ea76`. Both Vercel checks succeeded: `rdv-order` deployment `D7VoRD4jRxWJh1fqDyJf7jqA1c7c` and `rdv-downloads` deployment `HenWHWWaXG2xbUU7gaKNFuSq5GBx`; the backend dashboard reports Ready.

At 13:21 GMT+8, three new-version health queries returned online in 431/318/487 ms. All resolved to the same IPv4 `101.37.24.59`; TCP connected in 189/70/211 ms and TLS completed in 329/210/370 ms. Each provider response had code 0. These observations show the new diagnostic fields working and a successful route at those moments; they do not establish stable connectivity or explain the older failures. Their target IP was not captured, so this evidence neither rules out DNS differences nor proves Vercel egress IP filtering.

Five focused transport checks, eight queue checks, TypeScript and the Next production build passed. The first run exposed a new fixture array-matching assertion; it was corrected and only transport checks were rerun. No broader suites were repeated.

The change adds diagnostics only; it does not repair or claim to repair the connection. Android remains 1.2.0/code14 with no changes. No new paper test, queue replay/clear, device rebinding or node switch occurred. Actual paper output and long-term connection stability remain unverified.

## Connection-path correction — LIVE

The corrective source change moves new Vercel function invocations from `sin1` to `hkg1`. This Hobby deployment uses one function region; order routes, Workflow steps and health checks now run in Hong Kong while Neon remains in Singapore. This routes around the reproducible `sin1` connect-phase failures; it does not establish that all external causes are excluded or that printing is fixed. No database migration or separate service is needed, and there is no need to upgrade the Vercel plan.

Transport now waits for TLS `secureConnect` before submitting the request body, with a connection-phase deadline of up to four seconds; the total print request deadline remains ten seconds. A failure before `request.end(payload)` is classified as `unreachable`, so the payload is known not to have been sent. The queue retries that same delivery every five seconds with its original provider key during the creation-based 120-second sending window. Because non-delivery is certain, its attempt accounting is restored and it does not consume the one bounded resend allowed for an ambiguous outcome. Once a request may have been sent, ambiguity retains the same-key bounded retry; a known remote ID remains query-only.

Correction `9ff3e3f2a67c6d400e721f98665445bac33549ae` is LIVE. Both Vercel checks succeeded: backend `DvJSk3SfFFmCaLmDhcmqAD5nQ7t1`, downloads `KzAru5tFF1arpkaCtzCWjZJ1MomX`. The backend dashboard is Ready, and deployment resources explicitly show `/.well-known/workflow/v1/flow` and `/step` in `HKG1`. A new deployment does not move Workflows already running in the old deployment to `hkg1`; historical tasks are not replayed. Stability and physical paper output still require real-world verification. The preceding diagnostic deployment is superseded by this correction.

At 13:38 GMT+8, direct production health reads returned online in 527/505/456 ms with `requestStarted=true`, provider code 0 and IPv4 `101.37.24.59`. TCP timings were 151/114/101 ms; TLS timings were 382/350/315 ms. Menu and tables also returned 200 (1.728/2.211 seconds end-to-end versus 2.024/1.894 seconds in the preceding small sample); this does not establish a latency trend. No production order or paper test was submitted. Android remains 1.2.0/code14.

Focused validation: transport 7, queue 10, order integration 7, receipt route 3 (27 total), TypeScript, Next production build and print-env presence check passed. No full-suite or Android repeat. A local real read-only transport call succeeded in 279 ms before deployment, confirming TLS can establish before the deferred HTTP body is sent.

## Follow-up and temporary probe (2026-09-27)

From 15:10–15:15 GMT+8, print-path checks in `hkg1` continued to show connection timeouts; affected new deliveries had no `remote_id`. The latest print order shown in the official backend's print-query list was at 14:02. The user-authorized official-console test `RDV-CLOUD-0927-A` was the first test submission; the one later system self-test is recorded below. Physical output remains pending.

A temporary Edge endpoint, `POST /api/print/connection-probe`, was deployed as `6706c12`; both Vercel checks succeeded. It is intended to compare a fixed, read-only XPYUN status query from Edge `hkg1` with the failing Node/Workflow path. It does not submit a print, touch the queue or change printer/account settings. A successful status query would distinguish an execution-path difference for this query only; it would not demonstrate print-submission success or physical output. A failed probe would not by itself establish a single network root cause. See [API reference](api.md) for its signed maintenance-token requirements.

At 15:35:07, the previous Node deployment again timed out before TCP connect (4002 ms, same IPv4). After the diagnostic-only deployment at 15:35, Node status reads recovered temporarily (587/454/446 ms), repeating the fresh-deployment pattern. The Edge probe returned unknown in 13/0/0 ms, so it has not demonstrated a usable alternate route. A bounded phase/reason/HTTP status/error-name diagnostic is added to distinguish immediate runtime failures from actual network failures; no print traffic uses Edge. TypeScript and a local Edge-runtime status query (online, 275 ms) passed for this narrow follow-up.

Probe diagnostics `75bd566` deployed successfully. Production Edge fails immediately in fetch with TypeError (26 ms); signing completed, so missing settings or WebCrypto signing are excluded for this invocation. Use manual redirect handling (3xx fails the existing HTTP check without following or forwarding credentials), and remove the redundant RequestInit.cache option: the route is force-dynamic and the provider operation is POST; no caching is enabled. The installed Next Edge fetch code documents that some Edge runtimes reject this RequestInit property. This is a probe compatibility check, not a paper-path repair.

The probe compatibility update `5b19052` removes the cache option and uses manual redirect handling. Its production read-only query returned HTTP 200/online in 572 ms. This confirms the Edge status-query path can work; it does not show that a print request succeeds. Node warm TCP failures remained observed.

At 15:47:49, the Edge status probe returned online in 427 ms. Five seconds later, the Node health query on the same `5b19052` deployment timed out during TCP connect after about four seconds. This is evidence of an execution-path difference for status queries, not a successful print submission or paper output.

The temporary `POST /api/print/connection-probe` route was retired after this comparison; it is not a supported API. The formal provider gateway below is separate and now LIVE.

## Provider Edge gateway — LIVE via 456f603

`lib/printing/provider-edge.ts` and `app/api/print/provider/route.ts` now implement a same-project `hkg1` Edge hop for Vercel XPYUN print/status/order-state calls. The existing Workflow and queue still own durable delivery, retry windows and state; no APP/API workflow or UI change is intended. The route validates a short HS256 token bound to the exact operation body and the configured printer SN, then uses XPYUN credentials from its own environment. Local transport remains direct.

Node-to-Edge timeout, HTTP failure or malformed response is classified `unknown`, since the provider may already have received the print. The existing bounded retry uses the same provider key; when a remote ID is known, the task remains query-only. The gateway is deployed via `456f603`. Android remains 1.2.0/code14; no printer node/account change or history replay occurred. No physical paper result is established by the probe or source checks.

Focused source validation reported by root: 22 checks (Edge 5, transport 7, queue 10), Next production build/TypeScript and print-env presence check passed. The initial harness failed on `Array.at` under the project TypeScript library; it was changed to `pop()` and only the five Edge checks were rerun. The first print-env check lacked the local environment; the presence check passed after explicitly loading it. No physical print test is implied.


Final deployment evidence: commit `456f60321df5b6123e6065937a8219f0b9f702c4`, backend `MAMH24c56kj2uaV6qvwmRFHVLXxJ` and downloads `B3Dr765oYtPRf2bnmboRDZu2zZVz` both report successful Vercel checks; the backend dashboard is Ready. The temporary probe was removed in this deployment. At 15:55:58 and 15:56:00 GMT+8, production health returned online in 1247/455 ms, with diagnostic hostname `order.resortdejavu.cn`, demonstrating Node→Edge→XPYUN. A later 16:00:35 read also returned online in 720 ms.

Exactly one system self-test was submitted at 15:56:36, labeled `PRINTER TEST - DO NOT PREPARE FOOD`: job `531cc8cb-de2a-4133-9623-0c428c0d7683`, one attempt, remote `OM26092715564478698484`. The official console shows received 15:56:44 and completed 15:56:47; the durable record became completed at 15:57:08. During this check, a naturally submitted order (not created by this maintenance task) also used the new path: job `ab6f7470-ba4e-444f-9d92-e6de7ade38ed`, one attempt, remote `OM26092715565907435223`, official receipt/completion 15:56:59/15:57:02 and local completed 15:57:23. No business order, historical replay, cloud queue clear, device rebinding or node/account change was performed by this task. These are actual production/cloud records, not fixtures; physical paper still requires the pending user confirmation. Android remains 1.2.0/code14 with no installation required.
