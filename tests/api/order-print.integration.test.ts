import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), connect: vi.fn(), after: vi.fn(), dispatch: vi.fn(), permission: vi.fn()
}));
vi.mock("../../lib/db", () => ({ pool: { query: mocks.query, connect: mocks.connect } }));
vi.mock("../../lib/permissions", () => ({ requireOrderCreate: mocks.permission, requirePermission: mocks.permission }));
vi.mock("next/server", async importOriginal => ({
  ...await importOriginal<typeof import("next/server")>(), after: mocks.after
}));
vi.mock("../../lib/print", async importOriginal => ({
  ...await importOriginal<typeof import("../../lib/print")>(), dispatchPrintJob: mocks.dispatch
}));

import { POST } from "../../app/api/orders/route";
import { DELETE as clearQueue } from "../../app/api/print/queue/route";
import { PrintDispatchError } from "../../lib/print";
import { runOrderPrintWorker, runPrintWorker } from "../../lib/print-worker";

const userId = "11111111-1111-4111-8111-111111111111";
const dishId = "22222222-2222-4222-8222-222222222222";
let db: PGlite;
const request = (key = "fixture_request_1") => new Request("http://localhost/api/orders", {
  method: "POST", headers: { "Content-Type": "application/json", "x-idempotency-key": key },
  body: JSON.stringify({ tableNo: "01", items: [{ menuItemId: dishId, qty: 2, note: "fixture" }] })
});

async function oldJob(status: string, retries = 0, secondsAgo = 120) {
  const { rows: [order] } = await db.query<{ id: string }>("INSERT INTO orders (table_no, waiter_id) VALUES ('02', $1) RETURNING id", [userId]);
  await db.query("INSERT INTO print_jobs (order_id, status, retry_count, created_at, updated_at) VALUES ($1, $2, $3, now() - interval '1 hour', now() - ($4::int * interval '1 second'))", [order.id, status, retries, secondsAgo]);
  return order.id;
}
async function job(orderId: string) {
  return (await db.query<{ status: string; retry_count: number; last_error: string | null }>("SELECT status, retry_count, last_error FROM print_jobs WHERE order_id = $1", [orderId])).rows[0];
}

describe("order -> committed queue -> print worker (isolated PostgreSQL WASM)", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    // Core PostgreSQL supplies gen_random_uuid; no provider/crypto operations are tested here.
    const schema = readFileSync(new URL("../../db/schema.sql", import.meta.url), "utf8")
      .replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "");
    await db.exec(schema);
  }, 20_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.query.mockImplementation((sql: string, params?: unknown[]) => db.query(sql, params));
    mocks.connect.mockResolvedValue({ query: (sql: string, params?: unknown[]) => db.query(sql, params), release: vi.fn() });
    mocks.permission.mockResolvedValue({ userId, role: "manager" });
    mocks.dispatch.mockReset().mockResolvedValue({ provider: "fixture" });
    vi.stubEnv("PRINT_WAKE_ON_ORDER", "true");
    vi.stubEnv("PRINT_MAX_RETRY", "8");
    vi.stubEnv("PRINT_RETRY_DELAY_SECONDS", "12");
    vi.stubEnv("PRINT_STALE_PRINTING_SECONDS", "45");
    await db.exec("TRUNCATE users, menu_items, orders, table_sessions, audit_logs CASCADE");
    await db.query("INSERT INTO users (id, username, role, pin_salt, pin_hash) VALUES ($1, 'fixture', 'manager', 'fixture', 'fixture')", [userId]);
    await db.query("INSERT INTO menu_items (id, name, price, menu_group) VALUES ($1, 'fixture dish', 450, 'lunch_dinner')", [dishId]);
    await db.query("INSERT INTO table_sessions (table_no, guest_count, opened_by) VALUES ('01', 2, $1)", [userId]);
  });

  it("prints the newly committed order even with older failed and pending jobs", async () => {
    const failed = await oldJob("failed");
    const pending = await oldJob("pending");
    const response = await POST(request());
    expect(response.status).toBe(200);
    const { orderId } = await response.json();
    expect(await job(orderId)).toMatchObject({ status: "pending", retry_count: 0 });
    expect(mocks.dispatch).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).toHaveBeenCalledWith(orderId);
    expect(await job(orderId)).toMatchObject({ status: "printed", retry_count: 0 });
    expect((await job(failed)).status).toBe("failed");
    expect((await job(pending)).status).toBe("pending");
  });

  it("same-key replay preserves one order, one set of items, one job and one print", async () => {
    const { orderId } = await (await POST(request())).json();
    await mocks.after.mock.calls[0][0]();
    const replay = await (await POST(request())).json();
    expect(replay).toMatchObject({ orderId, deduped: true });
    for (const table of ["orders", "order_items", "print_jobs"]) {
      expect((await db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count).toBe(1);
    }
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(await runOrderPrintWorker(orderId)).toEqual({ picked: 0, printed: 0, failed: 0 });
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
  });

  it("retains a failed job and existing manual retry recovers it after its retry delay", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.dispatch.mockRejectedValueOnce(new PrintDispatchError("fixture unavailable", true));
    const { orderId } = await (await POST(request())).json();
    await mocks.after.mock.calls[0][0]();
    expect(await job(orderId)).toMatchObject({ status: "failed", retry_count: 1, last_error: "fixture unavailable" });
    expect(await runPrintWorker(10)).toEqual({ picked: 0, printed: 0, failed: 0 });
    await db.query("UPDATE print_jobs SET updated_at = now() - interval '20 seconds' WHERE order_id = $1", [orderId]);
    expect(await runPrintWorker(10)).toEqual({ picked: 1, printed: 1, failed: 0 });
    expect(await job(orderId)).toMatchObject({ status: "printed", retry_count: 1, last_error: null });
  });

  it("does not retry terminal provider errors", async () => {
    const id = await oldJob("pending");
    mocks.dispatch.mockRejectedValueOnce(new PrintDispatchError("fixture invalid credentials", false));
    expect(await runOrderPrintWorker(id)).toEqual({ picked: 1, printed: 0, failed: 1 });
    expect(await job(id)).toMatchObject({ status: "failed", retry_count: 8 });
    await db.query("UPDATE print_jobs SET updated_at = now() - interval '1 hour'");
    expect((await runPrintWorker(10)).picked).toBe(0);
  });

  it("respects active printing leases, recovers stale ones and never picks printed jobs", async () => {
    const active = await oldJob("printing", 0, 0);
    const stale = await oldJob("printing");
    const printed = await oldJob("printed");
    expect((await runOrderPrintWorker(active)).picked).toBe(0);
    expect((await runOrderPrintWorker(stale)).printed).toBe(1);
    expect((await runOrderPrintWorker(printed)).picked).toBe(0);
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).toHaveBeenCalledWith(stale);
  });

  it("queue clear removes active/failed jobs, preserves printed records and does not requeue on replay", async () => {
    await oldJob("failed"); await oldJob("printing");
    const printed = await oldJob("printed");
    const { orderId } = await (await POST(request())).json();
    const res = await clearQueue(new Request("http://localhost/api/print/queue", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ cleared: 3 });
    await mocks.after.mock.calls[0][0]();
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(await job(orderId)).toBeUndefined();
    expect((await job(printed)).status).toBe("printed");
    expect((await (await POST(request())).json()).deduped).toBe(true);
    expect(await job(orderId)).toBeUndefined();
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it("failed authorization cannot clear queued jobs", async () => {
    const id = await oldJob("pending");
    mocks.permission.mockRejectedValueOnce(new Error("FORBIDDEN"));
    expect((await clearQueue(new Request("http://localhost/api/print/queue", { method: "DELETE" }))).status).toBe(403);
    expect((await job(id)).status).toBe("pending");
  });

  it("rejected orders create no queue or callback", async () => {
    await db.exec("UPDATE table_sessions SET closed_at = now()");
    expect((await POST(request())).status).toBe(400);
    expect((await db.query("SELECT * FROM print_jobs")).rows).toEqual([]);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
