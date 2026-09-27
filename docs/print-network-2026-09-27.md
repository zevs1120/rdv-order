# Printing network incident — 2026-09-27

The user reports continued frequent no-paper failures after8038fe8. Do not ask staff to reconstruct individual table/timestamp records. No live print, queue replay, printer rebind or node switch is authorized by this investigation.

## Observations

Read-only production records after September26 12:49:30 GMT+8:22 orders all have delivery records;7 order deliveries have no remote cloud ID after failed requests,14 are cloud-completed,1 received a remote ID but was not confirmed within the tracking window. Including separate receipt and self-test intents,75 deliveries comprise45 connection-error/no-ID records,29 cloud-completed and1 unconfirmed with ID. Operator-cancelled records retain their previous errors; cancellation is not proof of successful paper.

At September27 13:08–13:09 GMT+8, six existing production health calls all returned printer status unknown after4002–4008ms. Vercel logs for five available calls explicitly showed queryPrinterStatus, phase=connect, reason=timeout, no HTTP status,4001–4007ms. Sample request `vtwvl-1790485735061-ade5f9937d91` executed in sin1 and lasted4.01s. No TCP-connect event was observed before the deadline; TLS/HTTP had not begun. Old instrumentation did not capture DNS errors, target IP or address family.

During the same interval, the same source transport with local credentials returned online in282/215/308ms over three direct reads; local lookup returned IPv4 101.37.24.59. This is evidence of an execution-path-dependent connection failure. It does not establish whether the cause is differing DNS answers, a specific Vercel egress path, transit loss or filtering at the provider. It cannot be repaired by ticket formatting, UI prompts or queue status changes.

The morning08:10–08:19 failures are outside accessible detailed runtime-log retention. [Vercel's published Hobby runtime log retention](https://vercel.com/docs/logs/runtime) is one hour. Yesterday's console-only diagnostics therefore did not provide durable evidence when staff reported later; this was an investigation gap.

[XPYUN official documentation](https://www.xpyun.net/open/) lists China, Singapore and Germany as distinct nodes. The Singapore host is not documented as an interchangeable failover hostname for the existing China-node device/account. No node or account changes are made on that assumption.

## Narrow diagnostic change

Keep all send/queue/retry deadlines, API endpoint, device/account, IPv4/IPv6 selection, two-copy content and UI unchanged. Capture bounded safe lookup/address-family/connection-attempt details and TCP/TLS timings. Health returns the connection observation as an additive manager-readable field. Failed sends/health checks preserve safe details in the existing audit_logs through the existing bounded metadata pool; no new schema, dependencies or monitoring service. Diagnostics never include keys, signing inputs, account identifiers, printer SN or receipt content, and never trigger a print.

This change is diagnostic, not a claim of restored printing. Production target-IP comparison and delivery status are appended after publication.
