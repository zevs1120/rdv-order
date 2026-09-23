import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimDelivery, drainDeliveryQueue, enqueueDelivery, expireUnfinishedDeliveries,
  recordAccepted, recordOffline, recordUnknown, scheduleUnknownSameKeyRetry, type QueueDb
} from "../../lib/printing/queue";

let pg: PGlite;
let db: QueueDb;
const intent = (key = "order-one", content = "KITCHEN + GUEST") => ({
  kind: "order" as const, intentKey: key, orderId: "11111111-1111-4111-8111-111111111111",
  printerSn: "fixture-sn", content, snapshot: { table: "01", content }
});

describe("isolated print delivery queue", () => {
  beforeAll(async () => {
    pg = await PGlite.create();
    const schema = readFileSync(new URL("../../db/schema.sql", import.meta.url), "utf8")
      .replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "");
    await pg.exec(schema);
    await pg.exec(readFileSync(new URL("../../db/migrations/026_print_deliveries.sql", import.meta.url), "utf8"));
    db = { query: (sql, params) => pg.query(sql, params) } as QueueDb;
  }, 20_000);
  afterAll(async () => { await pg?.close(); });
  beforeEach(async () => {
    await pg.exec("TRUNCATE orders, print_deliveries CASCADE");
    await pg.query("INSERT INTO orders (id, table_no) VALUES ($1, '01')", [intent().orderId]);
  });

  it("keeps a committed snapshot immutable and excludes historical jobs", async () => {
    const first = await enqueueDelivery(db, intent());
    expect((await enqueueDelivery(db, intent())).id).toBe(first.id);
    await expect(enqueueDelivery(db, intent("order-one", "CHANGED"))).rejects.toThrow("reused");
    await expect(pg.query("UPDATE print_deliveries SET content = 'CHANGED' WHERE id = $1", [first.id])).rejects.toThrow("immutable");
    await pg.query("INSERT INTO print_jobs (order_id, status) VALUES ($1, 'pending')", [intent().orderId]);
    expect((await claimDelivery(db))?.id).toBe(first.id);
    const reprint = await enqueueDelivery(db, { ...intent("manual-new-key"), kind: "reprint" });
    expect(reprint.kind).toBe("reprint");
    expect((await pg.query<{ status: string }>("SELECT status FROM print_jobs")).rows[0].status).toBe("pending");
  });

  it("persists the send lease and prevents a second active sender for one SN", async () => {
    await enqueueDelivery(db, intent());
    await enqueueDelivery(db, { kind: "receipt", intentKey: "receipt-one", printerSn: "fixture-sn",
      content: "BILL", snapshot: { table: "01" } });
    const first = await claimDelivery(db);
    expect(first).toMatchObject({ status: "sending", attempt_count: 1 });
    expect(first?.lease_token).toBeTruthy();
    expect(await claimDelivery(db)).toBeNull();
    await recordUnknown(first!, "response lost", db);
    expect(await scheduleUnknownSameKeyRetry(first!.id, db)).toBe(true);
    expect(await scheduleUnknownSameKeyRetry(first!.id, db)).toBe(false);
    const retry = await claimDelivery(db);
    expect(retry?.id).toBe(first?.id);
    expect(retry).toMatchObject({ attempt_count: 2, unknown_retry_count: 1, provider_key: first?.provider_key });
    await recordOffline(retry!, "printer offline", db);
    expect((await pg.query<{ status: string }>(
      "SELECT status FROM print_deliveries WHERE id = $1", [retry!.id]
    )).rows[0].status).toBe("unknown");
  });

  it("queries an accepted remote ID without another send and expires abandoned sends", async () => {
    await enqueueDelivery(db, intent());
    const send = vi.fn().mockResolvedValue({ kind: "accepted", remoteId: "remote-one" });
    const orderState = vi.fn().mockResolvedValue("completed");
    const transportForSn = () => ({ send, orderState });
    expect((await drainDeliveryQueue({ db, transportForSn })).accepted).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await pg.query<{ status: string }>("SELECT status FROM print_deliveries")).rows[0].status).toBe("completed");
    await drainDeliveryQueue({ db, transportForSn });
    expect(send).toHaveBeenCalledTimes(1);

    await enqueueDelivery(db, { kind: "receipt", intentKey: "stale", printerSn: "fixture-sn",
      content: "BILL", snapshot: { table: "01" } });
    const stale = await claimDelivery(db);
    await pg.query("UPDATE print_deliveries SET sending_started_at = now() - INTERVAL '130 seconds' WHERE id = $1", [stale!.id]);
    await expireUnfinishedDeliveries(db);
    expect((await pg.query<{ status: string; unknown_retry_count: number }>(
      "SELECT status, unknown_retry_count FROM print_deliveries WHERE id = $1", [stale!.id]
    )).rows[0]).toMatchObject({ status: "queued", unknown_retry_count: 1 });
  });

  it("targets one workflow job and never sends an order after its creation window", async () => {
    const old = await enqueueDelivery(db, intent());
    const fresh = await enqueueDelivery(db, { kind: "receipt", intentKey: "fresh", printerSn: "fixture-sn",
      content: "CURRENT BILL", snapshot: { table: "01" } });
    await pg.query("UPDATE print_deliveries SET created_at = now() - INTERVAL '121 seconds' WHERE id = $1", [old.id]);
    const send = vi.fn().mockResolvedValue({ kind: "accepted", remoteId: "remote-fresh" });
    const transportForSn = () => ({ send, orderState: vi.fn().mockResolvedValue("pending" as const) });
    await drainDeliveryQueue({ db, jobId: old.id, transportForSn });
    expect(send).not.toHaveBeenCalled();
    expect((await pg.query<{ status: string }>("SELECT status FROM print_deliveries WHERE id = $1", [old.id])).rows[0].status).toBe("expired");
    await drainDeliveryQueue({ db, jobId: fresh.id, transportForSn });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("allows only one persisted same-key retry for XPYUN 1004", async () => {
    const job = await enqueueDelivery(db, intent());
    const retryable = Object.assign(new Error("XPYUN 1004"), { kind: "rejected", code: 1004 });
    const send = vi.fn().mockRejectedValueOnce(retryable).mockResolvedValueOnce({ kind: "accepted", remoteId: "remote" });
    await drainDeliveryQueue({ db, jobId: job.id, maxJobs: 2,
      transportForSn: () => ({ send, orderState: vi.fn().mockResolvedValue("completed" as const) }) });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][1]).toBe(send.mock.calls[1][1]);
    expect((await pg.query<{ attempt_count: number; unknown_retry_count: number }>(
      "SELECT attempt_count, unknown_retry_count FROM print_deliveries WHERE id = $1", [job.id]
    )).rows[0]).toMatchObject({ attempt_count: 2, unknown_retry_count: 0 });
  });

  it("does not treat a database write failure after cloud acceptance as a send failure", async () => {
    const job = await enqueueDelivery(db, intent());
    const send = vi.fn().mockResolvedValue({ kind: "accepted", remoteId: "remote" });
    const failingDb: QueueDb = {
      query: async <T extends Record<string, unknown> = any>(sql: string, params?: any[]) => {
        if (sql.includes("UPDATE print_deliveries SET status = $3")) throw new Error("database unavailable");
        return db.query<T>(sql, params);
      }
    };
    await expect(drainDeliveryQueue({ db: failingDb, jobId: job.id, maxJobs: 2,
      transportForSn: () => ({ send, orderState: vi.fn() }) })).rejects.toThrow("database unavailable");
    expect(send).toHaveBeenCalledTimes(1);
    expect((await pg.query<{ status: string }>("SELECT status FROM print_deliveries WHERE id = $1", [job.id])).rows[0].status).toBe("sending");
  });
});
