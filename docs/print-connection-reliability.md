# Print connection reliability — 2026-09-19

## Incident and limits

Hotel staff reported real missing paper after adopting Android. The supplied screenshot shows seven primary-printer failures and a server-to-provider timeout over 3,000 ms at 2026-09-18 09:00:31 UTC. This is not explained by the unused backup record. A current online response cannot disprove an earlier outage.

Read-only production evidence: both deployed health/device endpoints return 200; XPYUN config is present. On September 19, table 06's 03:58 UTC kitchen request failed at the 3-second deadline. Two table 06 receipt requests at 04:41 UTC and a table 10 receipt at 00:46 UTC return true from XPYUN queryOrderState. Daily XPYUN totals at inspection: September 19 printed=11/waiting=0; September 18 printed=42/waiting=0. Provider acknowledgement is distinct from physical paper inspection. No production print, queue clear, business mutation or printer reconfiguration was performed.

Both clients use the same backend/provider; the Android migration alone is not established as the cause. Git ee66a93 previously shortened web receipt requests to 1.8 seconds and changed the route to return 202 before provider completion. Android inherited that contract. Default provider timeout was 3 seconds; a transient failure had no immediate recovery. Receipt failures were only console-logged. A successful order-provider response was labelled printed without confirming paper output.

## Repair

- XPYUN gets at least 10 seconds per attempt (maximum 15). Legacy PRINT_TIMEOUT_MS=3000 cannot accidentally retain the incident's premature abort.
- One immediate recovery attempt on transport/lost-response/transient HTTP errors, with exactly the same XPYUN idempotent key and content. XPYUN documents a five-minute deduplication window; both attempts finish in at most 30 seconds. Kitchen keys use order UUID; receipt/self-test calls receive a fresh UUID per invocation. Code 1013 means already accepted, not physically printed. No unbounded automatic retries or offline backlog mode is introduced.
- After both attempts have unknown outcomes, stop automatic/queue retries and do not fail over to another printer. Staff must check output before deciding to reprint. This avoids a late retry beyond the provider's deduplication window producing duplicate paper.
- New web/native receipt calls send waitForResult=true and wait up to 45 seconds, without client write retries. Server returns accepted only after provider acceptance; failure is returned to the caller and recorded in audit_logs. Legacy clients retain 202/background behavior during rollout, with the improved provider connection and failure audit.
- Explicit self-test and one-job manual queue recovery get the same 45-second client budget. Endpoint runtime budgets are explicit. Queue recovery now requests one job per tap, rather than starting ten potentially slow requests behind an 8-second client deadline.
- Device health queries XPYUN's real read-only status (4-second budget); clients allow 12 seconds for health. Unknown status-query outcomes are never reported as confirmed offline. Only XPYUN's actual offline response records offline; transport failure records degraded and preserves last successful request time.
- Kitchen acceptance now audits remoteJobId so subsequent queryOrderState diagnostics can identify it. Existing print_jobs.status=printed continues to mean provider acceptance for compatibility; it is not a new paper-delivery guarantee. Receipt copy explicitly says cloud accepted/check printout.

Provider reference: https://www.xpyun.net/open/ (print idempotent, code 1013, queryPrinterStatus, queryOrderState). We did not switch cloud regions: switching the API alone is not a verified printer-node migration.

## Validation

144 web tests, TypeScript and production build passed. Focused cases cover a response slower than the old 3-second deadline; identical-key recovery after lost response; provider duplicate acknowledgement; bounded unknown outcomes/no fallback; real offline and rejected credentials; side-effect-free status reads; receipt acceptance/failure and legacy-client compatibility; existing order idempotency and isolated SQL queue behavior. Android 62 JVM tests, debug lint and debug build passed. Release/device results are recorded in release-1.1.3.md.

Remaining acceptance: hotel staff must observe one controlled test print and an ordinary app order/receipt on the actual network. If XPYUN reports offline during the incident, local printer Wi-Fi/router/power and device cloud-node connectivity still require on-site diagnosis; software cannot restore unplugged hardware or an unavailable router. No claim of physical repair is made from fixtures alone.
