# Printing incident — September 20, 2026

## Scope and acceptance

User confirms table 06's 13:20 Rice Platter ticket did not produce paper. The priority is reliable actual printing, not clearer UI. Preserve current layouts/workflows and do not package an APP for this investigation. Do not replay closed orders or clear queues. Physical output is required for acceptance; a status query or mock test is insufficient.

## Evidence (UTC+08)

- 12:53:51: last successful receipt acknowledgement before incident.
- 13:20:25: table 06 Rice Platter ×1 / PHP 150 committed; no order.print_accepted audit for this order.
- 13:20:58–13:34:20: repeated receipt failures on tables 06/01. Vercel sample at 13:21:50 ran 20.07 seconds and returned 504, consistent with two 10-second provider deadlines. This localizes failure to print submission but does not distinguish provider processing, network transport or device routing.
- Same-period table 01 bill samples completed in 43/69 milliseconds at Vercel. These are not table 06 samples and do not prove the screenshot's client timeout source.
- 13:31:20: audit print.queue.clear records deletion of four pending/printing/failed records. This was an external live action, not performed by this investigation. Unknown-outcome kitchen failures DO count as failed until removed. Receipt failures are audited separately, outside print_jobs.
- 13:31:25: self-test returned 503; device failure count later reached 13.
- Provider status returned online in 321 ms from backend while print submission failed. Status success is not delivery evidence.
- 13:47:45, 13:47:54, 13:48:01: new successful receipt acknowledgements, without a code change during this investigation. Remote IDs OM26092013474514038691, OM26092013475450760460, OM26092013480185346545. Read-only queryOrderState returned true for all three. User subsequently confirms that printing has NOT recovered and no paper emerged; the printer was not restarted, and the phone uses one stable Wi-Fi network. These cloud results must NOT be described as restored physical printing.
- Subsequent provider daily statistics: printed=21, waiting=0; aggregated totals cannot identify the lost ticket.

## Corrections to earlier hypotheses

Receipt/self-test retries already reuse one generated UUID within a single invocation. No missing-idempotency fix is justified. Five-minute provider deduplication is bounded and cannot guarantee arbitrary late replay safety.

Supabase's visible incident banner is not evidence of this failure. Its published ongoing JWT/API issue is not proof of a failure in this application's direct PostgreSQL path.

No evidence yet requires a relay, different region or a replacement architecture. Do not claim those would fix this incident without a controlled comparison. Mode=1 provider offline queuing changes delayed-print behavior and should not be silently enabled as a transport repair.

## Next diagnostic boundary

Those questions have been answered: no paper and no printer restart. Do not ask the same recovery questions again. Reassess printer identity/routing within the existing XPYUN integration. The local-execution proposal is withdrawn. A clearly labelled, bounded test print may then compare actual submission and delivery; do not resurrect cleared historical jobs. Public API documentation exposes queryOrderState by provider order ID, not a documented lookup by our idempotency key, so unknown acknowledgements cannot be automatically reconciled from the published API alone.

Reference: https://www.xpyun.net/open/

No application source, production settings, business records or queue were changed by this investigation. No APP built; no runtime suite run for this documentation-only record.


## 最新范围与官方接入核对

用户明确要求继续使用芯烨云网络打印机，否决绕过云端和新增本地执行设备。2026-09-20 对照官方 API https://www.xpyun.net/open/ 与官方 Node 示例 https://image.xpyun.net/xpyun/sdk/nodejs/xpyun-opensdk-nodejs-demo.zip ：现有 JSON 请求、SHA1(user + userKey + timestamp)、print 路径和必填参数基本一致。SDK 示例较旧，以当前 API 文档为准；不直接执行示例或发送打印任务。

现有代码把 1006（订单日期错误）列为可重试，未实现文档对 1004（添加订单失败）建议的一次重试。该差异没有解释已观察到的传输超时，也没有证明是现场无纸的原因，尚未改动运行代码。1013 仅证实触发去重，不是实物出纸证据。

下一项关键证据是既有云订单与实体设备 SN 的对应关系以及云平台下发记录；不因云端 true 推翻现场无纸，也不未经核对切换云节点。此次仅修改审查记录和方向说明，未变更 APK、后台运行代码、云配置、订单或队列。


## Official console investigation and single controlled test

- Authenticated XPYUN console inspected read-only: one registered device, KITCHEN, SN suffix 014B, 58mm receipt mode, firmware D81.14, online/normal. Local configured account and full SN exactly match this console device (values compared without recording credentials). This is not an independent check of the physical label or every production environment variable.
- Print-search console assigns all three 13:47–13:48 remote IDs above to this same device. Completion times respectively 13:47:47, 13:47:57, 13:48:04. Latest order detail is TABLE 10, PLAIN RICE ×1, PHP 25, opened 13:46:55; it is not the screenshot's TABLE 06 Rice Platter PHP 150. Do not conflate these separate operations.
- Console's descending list jumps from 13:47:45 to 12:53:51, with no order displayed in the 13:20–13:34 failure interval. Existing transport timeouts thus lack corresponding visible provider order records; exact network/provider cause remains unproven.
- Actual latest receipt payload contains empty `<N></N>` tags. Official docs warn that invalid/empty tags may cause code 1004; this is a concrete formatting discrepancy, but this particular order was accepted and cloud-reported complete. It does not establish why transport calls timed out or why physical paper was absent.
- Following the user's authorization to investigate/fix the existing cloud integration, one clearly labelled test-only, do-not-prepare-food ticket was submitted directly to the configured official XPYUN API. Plain text plus BR tags only, copies=1, mode=0, unique idempotency key, no automatic retry. No application order or historical queue was modified. Source was the local machine, not Vercel, so this is not proof of production transport recovery.

Controlled-test evidence (no credentials):

```json
{
  "at": "2026-09-20T06:09:58.905Z",
  "marker": "RDV-CLOUD-884598",
  "httpStatus": 200,
  "latencyMs": 338,
  "code": 0,
  "msg": "ok",
  "orderId": "OM26092014095885012205",
  "snSuffix": "014B",
  "source": "local-direct-official-api",
  "copies": 1,
  "cloudQuery": {
    "at": "2026-09-20T06:10:29.115Z",
    "code": 0,
    "data": true
  }
}
```

Physical result requested for this exact test marker; still pending. Do not call the incident fixed based on its API response or cloud query. No application source, cloud configuration, APK or deployment changed.


Latest user response: the controlled plain-text RDV-CLOUD-884598 ticket produced absolutely no paper. Stop requesting repeated on-site checks. User authorized rebuilding the official backend integration; implementation/deployment `7779d05` is documented in xpyun-integration-2026-09-20.md, without claiming physical restoration.
