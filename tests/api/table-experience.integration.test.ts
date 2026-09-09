import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), permission: vi.fn(), audit: vi.fn() }));
vi.mock("../../lib/db", () => ({ pool: { query: mocks.query, connect: mocks.connect } }));
vi.mock("../../lib/permissions", () => ({ requirePermission: mocks.permission }));
vi.mock("../../lib/audit", () => ({ writeAuditLogSafe: mocks.audit }));
vi.mock("../../lib/table-lock", () => ({ lockSessionName: vi.fn().mockResolvedValue(undefined) }));
import { GET as quote, POST as checkout } from "../../app/api/tables/checkout/route";
import { PATCH as guests } from "../../app/api/tables/guests/route";
import { GET as orders } from "../../app/api/manage/orders/route";

const sessionId = "10000000-0000-4000-8000-000000000001";
const oldSessionId = "10000000-0000-4000-8000-000000000002";
let db: PGlite;
const request = (path: string, body?: unknown, method = "POST") => new Request(`http://localhost/api/${path}`, body === undefined ? {} : {
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE table_sessions(id uuid PRIMARY KEY, table_no text, guest_count int, opened_at timestamptz, closed_at timestamptz);
    CREATE TABLE orders(id text PRIMARY KEY, table_no text, status text, guest_count int, created_at timestamptz,
      cancelled_at timestamptz, paid_at timestamptz, merged_into_order_id text);
    CREATE TABLE menu_items(id text PRIMARY KEY, name text, price int);
    CREATE TABLE order_items(id text PRIMARY KEY, order_id text, menu_item_id text, qty int, unit_price int, note text);
    CREATE TABLE pricing_rules(id text PRIMARY KEY, mode text, value int, is_active boolean, charge_type text, sort_order int, created_at timestamptz);
    CREATE TABLE order_charges(order_id text, charge_type text, mode text, value int, amount int, note text,
      created_by text, rule_id text, source text, UNIQUE(order_id, rule_id, source));
    CREATE TABLE order_events(order_id text, event_type text, payload jsonb, created_by text);
  `);
});
afterAll(async () => db.close());
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.query.mockImplementation((sql, params) => db.query(sql, params));
  mocks.connect.mockResolvedValue({ query: mocks.query, release: vi.fn() });
  mocks.permission.mockResolvedValue({ userId: "manager", role: "manager" });
  mocks.audit.mockResolvedValue(undefined);
  await db.exec(`
    TRUNCATE table_sessions, orders, menu_items, order_items, pricing_rules, order_charges, order_events;
    INSERT INTO table_sessions VALUES
      ('${sessionId}', '05', 2, '2026-09-07T10:00Z', NULL),
      ('${oldSessionId}', '05', 3, '2026-09-06T10:00Z', '2026-09-06T11:00Z');
    INSERT INTO menu_items VALUES ('dish', 'Rice', 100);
    INSERT INTO orders(id, table_no, status, guest_count, created_at) VALUES
      ('live', '05', 'submitted', 2, '2026-09-07T11:00Z'),
      ('old', '05', 'closed', 3, '2026-09-06T10:30Z'),
      ('other', '06', 'submitted', 4, '2026-09-07T11:00Z');
    INSERT INTO order_items VALUES ('item', 'live', 'dish', 2, 100, NULL), ('old-item', 'old', 'dish', 1, 100, NULL);
    INSERT INTO pricing_rules VALUES ('tax', 'percent', 10, true, 'tax', 1, now()), ('flat', 'amount', 5, true, 'tax', 2, now());
  `);
});

describe("current table experience", () => {
  it("quotes automatic taxes without writes and confirms exactly that amount", async () => {
    const res = await quote(request("tables/checkout?tableNo=05"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ tableNo: "05", sessionId, totalAmount: 225, orderCount: 1 });
    expect((await db.query("SELECT * FROM order_charges")).rows).toHaveLength(0);
    expect((await db.query("SELECT status FROM orders WHERE id='live'")).rows[0]).toEqual({ status: "submitted" });
    const result = await checkout(request("tables/checkout", { tableNo: "05", expectedSessionId: sessionId, expectedTotalAmount: body.totalAmount }));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ totalAmount: 225, closed: true, orderCount: 1 });
    expect((await db.query("SELECT * FROM order_events")).rows).toHaveLength(1);
  });

  it("does not reapply existing auto tax, and excludes cancelled or merged orders", async () => {
    await db.exec(`
      INSERT INTO order_charges(order_id, amount, rule_id, source) VALUES ('live',20,'tax','rule_auto'), ('live',-10,NULL,'manual');
      INSERT INTO orders(id,table_no,status,created_at,cancelled_at,merged_into_order_id) VALUES
        ('cancelled','05','submitted','2026-09-07T12:00Z',now(),NULL),
        ('merged','05','submitted','2026-09-07T12:00Z',NULL,'live');
      INSERT INTO order_items VALUES ('cancel-item','cancelled','dish',5,100,NULL), ('merge-item','merged','dish',8,100,NULL);
    `);
    const body = await (await quote(request("tables/checkout?tableNo=05"))).json();
    expect(body.totalAmount).toBe(215);
    expect(body.orderCount).toBe(1);
    const result = await checkout(request("tables/checkout", { tableNo: "05", expectedSessionId: sessionId, expectedTotalAmount: 215 }));
    expect(result.status).toBe(200);
    expect((await result.json()).totalAmount).toBe(215);
  });

  it("rejects a changed total or reopened session without checkout writes", async () => {
    for (const expected of [
      { expectedSessionId: sessionId, expectedTotalAmount: 200 },
      { expectedSessionId: oldSessionId, expectedTotalAmount: 225 }
    ]) {
      const result = await checkout(request("tables/checkout", { tableNo: "05", ...expected }));
      expect(result.status).toBe(409);
    }
    expect((await db.query("SELECT * FROM order_charges")).rows).toHaveLength(0);
    expect((await db.query("SELECT * FROM order_events")).rows).toHaveLength(0);
    expect((await db.query("SELECT closed_at FROM table_sessions WHERE id=$1", [sessionId])).rows[0]).toEqual({ closed_at: null });
  });

  it("retains legacy checkout requests without quote fields", async () => {
    const result = await checkout(request("tables/checkout", { tableNo: "05" }));
    expect(result.status).toBe(200);
    expect((await result.json()).totalAmount).toBe(225);
  });

  it("changes current guest count and audit without rewriting historical order snapshots", async () => {
    const result = await guests(request("tables/guests", { tableNo: "05", guestCount: 4, expectedSessionId: sessionId }, "PATCH"));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ tableNo: "05", guestCount: 4, sessionId });
    expect((await db.query("SELECT guest_count FROM orders WHERE id='live'")).rows[0]).toEqual({ guest_count: 2 });
    expect((await db.query("SELECT guest_count FROM table_sessions WHERE id=$1", [oldSessionId])).rows[0]).toEqual({ guest_count: 3 });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "table.update_guests", detail: { tableNo: "05", guestCount: 4, previousGuestCount: 2 } }));
  });

  it("rejects invalid guest counts and stale guest edits", async () => {
    for (const guestCount of [0, 21, 1.5, "4", null]) {
      expect((await guests(request("tables/guests", { tableNo: "05", guestCount }, "PATCH"))).status).toBe(400);
    }
    expect((await guests(request("tables/guests", { tableNo: "05", guestCount: 3, expectedSessionId: oldSessionId }, "PATCH"))).status).toBe(409);
    expect((await db.query("SELECT guest_count FROM table_sessions WHERE id=$1", [sessionId])).rows[0]).toEqual({ guest_count: 2 });
  });

  it("lists a session across dates using server boundaries, including closed sessions", async () => {
    const live = await orders(request(`manage/orders?sessionId=${sessionId}&from=invalid`));
    expect(live.status).toBe(200);
    expect((await live.json()).orders.map((o: { id: string }) => o.id)).toEqual(["live"]);
    const old = await orders(request(`manage/orders?sessionId=${oldSessionId}`));
    expect((await old.json()).orders.map((o: { id: string }) => o.id)).toEqual(["old"]);
    expect((await orders(request(`manage/orders?sessionId=${sessionId}&tableNo=06`))).status).toBe(404);
    expect((await orders(request("manage/orders?sessionId=invalid"))).status).toBe(400);
  });

  it("enforces endpoint permissions before reading or writing", async () => {
    mocks.permission.mockRejectedValue(new Error("FORBIDDEN"));
    expect((await quote(request("tables/checkout?tableNo=05"))).status).toBe(403);
    expect((await guests(request("tables/guests", { tableNo: "05", guestCount: 3 }, "PATCH"))).status).toBe(403);
    expect((await orders(request(`manage/orders?sessionId=${sessionId}`))).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
