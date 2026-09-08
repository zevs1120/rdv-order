import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../lib/db", () => ({ pool: { query: mocks.query } }));
vi.mock("../../lib/permissions", () => ({ requirePermission: vi.fn().mockResolvedValue({ role: "manager" }) }));
import { GET } from "../../app/api/manage/income/route";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE orders(id text PRIMARY KEY, created_at timestamptz, status text, cancelled_at timestamptz, merged_into_order_id text);
    CREATE TABLE menu_items(id text PRIMARY KEY, price integer);
    CREATE TABLE order_items(order_id text, menu_item_id text, qty integer, unit_price integer);
    CREATE TABLE order_charges(order_id text, amount integer);
    INSERT INTO menu_items VALUES ('dish', 100);
    INSERT INTO orders VALUES
      ('paid', '2026-09-07T12:00:00Z', 'paid', NULL, NULL),
      ('closed', '2026-09-08T12:00:00Z', 'closed', NULL, NULL),
      ('empty', '2026-09-08T13:00:00Z', 'paid', NULL, NULL),
      ('open', '2026-09-08T12:00:00Z', 'pending', NULL, NULL),
      ('cancel', '2026-09-08T12:00:00Z', 'paid', '2026-09-08T13:00:00Z', NULL),
      ('merged', '2026-09-08T12:00:00Z', 'paid', NULL, 'paid'),
      ('outside', '2026-08-01T12:00:00Z', 'paid', NULL, NULL);
    INSERT INTO order_items(order_id, menu_item_id, qty) SELECT id, 'dish', 2 FROM orders WHERE id != 'empty';
    INSERT INTO order_charges VALUES ('paid', 50), ('paid', -20), ('closed', -10);
  `);
});
beforeEach(() => mocks.query.mockReset().mockImplementation((sql, params) => db.query(sql, params)));
afterAll(async () => { await db.close(); });
it("uses one query for exact totals and daily amounts, preserving exclusions and charges", async () => {
  const response = await GET(new Request("http://localhost/api/manage/income?from=2026-09-07T00:00:00Z&to=2026-09-08T23:59:59Z"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.orderCount).toBe(3); expect(body.totalAmount).toBe(420);
  expect(body.byDay.map((day: { order_count: number; amount: number }) => [day.order_count, day.amount])).toEqual([[2, 190], [1, 230]]);
  expect(Object.keys(body.byDay[0]).sort()).toEqual(["amount", "day", "order_count"]);
  expect(mocks.query).toHaveBeenCalledTimes(1);
});
it("returns the original empty-period shape", async () => {
  const response = await GET(new Request("http://localhost/api/manage/income?from=2027-01-01&to=2027-01-02"));
  expect(await response.json()).toEqual({ orderCount: 0, totalAmount: 0, byDay: [] });
});
