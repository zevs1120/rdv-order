import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), after: vi.fn(), start: vi.fn(), drain: vi.fn(), permission: vi.fn() }));
vi.mock("../../lib/db", () => ({ pool: { query: mocks.query, connect: mocks.connect } }));
vi.mock("../../lib/permissions", () => ({ requireOrderCreate: mocks.permission, requirePermission: mocks.permission }));
vi.mock("../../lib/printing/records", async original => ({
  ...await original<typeof import("../../lib/printing/records")>(), sendPrint: mocks.start
}));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: mocks.after }));

import { POST } from "../../app/api/orders/route";
import { POST as retryPrint } from "../../app/api/print/dispatch/route";
import { DELETE as clearQueue } from "../../app/api/print/queue/route";
import { savePrint } from "../../lib/printing/records";

const userId = "11111111-1111-4111-8111-111111111111";
const dishId = "22222222-2222-4222-8222-222222222222";
let db: PGlite;
const request = (key = "fixture_request_1") => new Request("http://localhost/api/orders", {
  method: "POST", headers: { "Content-Type": "application/json", "x-idempotency-key": key },
  body: JSON.stringify({ tableNo: "01", items: [{ menuItemId: dishId, qty: 2, note: "fixture" }] })
});

describe("order and durable print intent (isolated PostgreSQL WASM)", () => {
  beforeAll(async () => {
    db = await PGlite.create();
    await db.exec(readFileSync(new URL("../../db/schema.sql", import.meta.url), "utf8")
      .replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", ""));
    await db.exec(readFileSync(new URL("../../db/migrations/026_print_deliveries.sql", import.meta.url), "utf8"));
  }, 20_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.query.mockImplementation((sql: string, params?: unknown[]) => db.query(sql, params));
    mocks.connect.mockResolvedValue({ query: (sql: string, params?: unknown[]) => db.query(sql, params), release: vi.fn() });
    mocks.permission.mockResolvedValue({ userId, role: "manager" });
    mocks.start.mockResolvedValue("accepted");
    mocks.drain.mockResolvedValue({ picked: 1, accepted: 1, unknown: 0, failed: 0 });
    vi.stubEnv("XPYUN_USER", "fixture"); vi.stubEnv("XPYUN_USER_KEY", "fixture"); vi.stubEnv("XPYUN_SN", "fixture-sn");
    await db.exec("TRUNCATE print_deliveries, users, menu_items, orders, table_sessions, audit_logs CASCADE");
    await db.query("INSERT INTO users (id, username, role, pin_salt, pin_hash) VALUES ($1, 'fixture', 'manager', 'fixture', 'fixture')", [userId]);
    await db.query("INSERT INTO menu_items (id, name, price, menu_group) VALUES ($1, 'fixture dish', 450, 'lunch_dinner')", [dishId]);
    await db.query("INSERT INTO table_sessions (table_no, guest_count, opened_by) VALUES ('01', 2, $1)", [userId]);
  });

  it("commits one order then awaits its direct print, leaving older jobs alone", async () => {
    await savePrint(db, { kind: "self_test", intentKey: "older-pending", printerSn: "fixture-sn", content: "older", snapshot: {} });
    const response = await POST(request());
    expect(response.status).toBe(200);
    const { orderId } = await response.json();
    const deliveries = (await db.query<{ id: string; kind: string; status: string; order_id: string }>(
      "SELECT id, kind, status, order_id FROM print_deliveries ORDER BY created_at, id")).rows;
    expect(deliveries).toHaveLength(2);
    const current = deliveries.find(row => row.order_id === orderId)!;
    expect(current).toMatchObject({ kind: "order", status: "queued" });
    expect(mocks.start).toHaveBeenCalledWith(current.id);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.drain).not.toHaveBeenCalled();
  });

  it("same-key replay preserves one order, its items and its print intent", async () => {
    const { orderId } = await (await POST(request())).json();
    const replay = await (await POST(request())).json();
    expect(replay).toMatchObject({ orderId, deduped: true });
    for (const table of ["orders", "order_items", "print_deliveries"]) {
      expect((await db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count).toBe(1);
    }
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("rejected orders create no print intent or callback", async () => {
    await db.exec("UPDATE table_sessions SET closed_at = now()");
    expect((await POST(request())).status).toBe(400);
    expect((await db.query("SELECT * FROM print_deliveries")).rows).toEqual([]);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("waits for a direct send after COMMIT and never rolls back a saved order on an unknown print", async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    mocks.start.mockImplementation(async () => {
      expect((await db.query("SELECT * FROM orders")).rows).toHaveLength(1);
      await pending;
      return "unknown";
    });
    let responded = false;
    const response = POST(request()).then(value => { responded = true; return value; });
    await vi.waitFor(() => expect(mocks.start).toHaveBeenCalled());
    expect(responded).toBe(false);
    release();
    expect(await (await response).json()).toMatchObject({ printStatus: "unknown" });
    expect((await db.query("SELECT * FROM orders")).rows).toHaveLength(1);
  });

  it("returns the saved order without a second in-request printer connection", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.drain.mockRejectedValue(new Error("temporary wake failure"));
    const response = await POST(request());
    expect(response.status).toBe(200);
    const { orderId } = await response.json();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.drain).not.toHaveBeenCalled();
    expect((await db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM orders WHERE id = $1", [orderId])).rows[0].count).toBe(1);
    expect((await db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM print_deliveries WHERE order_id = $1", [orderId])).rows[0].count).toBe(1);
  });

  it("does not clone a historical expired task that already has a cloud order", async () => {
    const { orderId } = await (await POST(request())).json();
    await db.query("UPDATE print_deliveries SET status = 'expired', remote_id = 'fixture-remote' WHERE order_id = $1", [orderId]);
    mocks.start.mockClear();
    const response = await retryPrint(new Request("http://localhost/api/print/dispatch", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ picked: 0, queued: false });
    expect(mocks.start).not.toHaveBeenCalled();
    expect((await db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM print_deliveries")).rows[0].count).toBe(1);
  });

  it("manager clear cancels an unsent intent without deleting its evidence", async () => {
    const { orderId } = await (await POST(request())).json();
    const response = await clearQueue(new Request("http://localhost/api/print/queue", { method: "DELETE" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ cleared: 1 });
    expect((await db.query<{ status: string }>("SELECT status FROM print_deliveries WHERE order_id = $1", [orderId])).rows[0].status).toBe("cancelled");
    expect((await (await POST(request())).json()).deduped).toBe(true);
    expect((await db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM print_deliveries")).rows[0].count).toBe(1);
  });
});
