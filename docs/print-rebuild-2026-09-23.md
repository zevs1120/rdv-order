# 打印链路重建（2026-09-23）

当前状态：**1.2.0/code14 已上线；迁移026已应用，两项目部署成功**。没有向酒店打印机发送新测试单，也没有验证实物出纸。此文记录代码边界；云端受理、云端完成和纸张实际打印是三个不同结果。

## 新链路边界

订单、账单和自检使用新的票据生成器、XPYUN 传输适配器、`print_deliveries` 持久任务及每任务 Workflow。原订单事务和订单请求幂等键仍是业务事实来源。订单事务内固定打印内容、快照、打印机 SN、内容哈希和 XPYUN 幂等键；账单使用独立请求意图键。新任务与历史 `print_jobs` 严格隔离，不迁移、不清空、不自动重放旧任务。迁移为 `db/migrations/026_print_deliveries.sql`，完整新库定义同步在 `db/schema.sql`。

每个新任务在业务事务提交前先持久启动 Workflow；启动失败则回滚，已启动而业务回滚的孤立 Workflow 查不到任务后结束。提交后 `after()` 仅作快速唤醒，持久 Workflow 每隔短时间按该任务 ID 推进。数据库原子领取、租约及每台打印机单一活跃发送限制并发；发送尝试先落库，再调用 XPYUN。执行器有任务数和时间上限，不扫描历史队列。

XPYUN 请求固定 `mode=1`，`expiresIn` 取任务创建后 120 秒窗口的剩余秒数，云端在短暂断线时可缓冲。已取得远端 ID 的任务只查询 `queryOrderState`，不再发送。未知结果最多在窗口内使用原幂等键作一次持久计数的受控重试；第二次仍不明则停在 `unknown`，不换键、不切备用。超过窗口的任务停在 `expired`；人工对 `failed` 或 `expired` 重新打印时，新建 `reprint` 意图并保留原记录，不能自动处理 `unknown`。`completed` 仅表示 XPYUN 报告完成，不代表酒店现场已经出纸。

## 本地证据与未完成项

已执行 6 个隔离 PostgreSQL WASM 队列测试和一次 TypeScript 类型检查，均通过；覆盖快照不变、旧队列隔离、单打印机发送租约、同键重试、过期限制、云端受理后写库故障不重发。随后同步了 `db/schema.sql` 与本文档，未再运行测试。整体订单/账单基础检查、迁移和部署随后已完成（见下节）；酒店实物出纸仍由用户现场试用确认。

## Delivery preparation

Signed Android 1.2.0/code14 is staged with the original signer and Android8+ baseline. Full APK 1,625,433 bytes; code13 delta 1,282,709 bytes, byte-exact reconstruction checked by the staging tool. Targeted order/receipt integration (9), queue (6), transport (3), client API (14), repository JVM tests, TypeScript, Next production build and Android release build/lintVital were used; unrelated full suites/device scenarios were not rerun. Release record: `release-1.2.0.md`. No live print or historical queue mutation.

Final direct reads: public metadata/update1.2.0/code14, full/delta hashes, new print status API passed. Printer cloud status online348ms; this read is not a physical paper test. Final deployment IDs/status are recorded in `release-1.2.0.md`.
