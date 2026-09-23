import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), metadata: vi.fn(), enqueue: vi.fn() }));
vi.mock("../../lib/db", () => ({ pool: { query: mocks.query }, printMetadataPool: { query: mocks.metadata } }));
vi.mock("../../lib/permissions", () => ({ requirePermission: async () => ({ role: "manager" }) }));
vi.mock("../../lib/printing/queue", () => ({ enqueueDelivery: mocks.enqueue }));
import { GET as bill } from "../../app/api/tables/bill/route";
import { GET as menu } from "../../app/api/menu/route";
import { prepareReceiptDelivery } from "../../lib/printing/service";
import { renderBillTicket } from "../../lib/printing/tickets";

// Frozen pre-optimization SQL, so parity does not merely mirror the new implementation.
const billBaseline: string[] = JSON.parse(readFileSync(new URL("../fixtures/bill-query-baseline.json", import.meta.url), "utf8"));
const receiptBaseline: string[] = JSON.parse(readFileSync(new URL("../fixtures/print-bill-query-baseline.json", import.meta.url), "utf8"));
let db: PGlite;
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE table_sessions(id text, table_no text, guest_count int, opened_at timestamptz, closed_at timestamptz);
    CREATE TABLE orders(id text, table_no text, status text, created_at timestamptz, cancelled_at timestamptz, merged_into_order_id text);
    CREATE TABLE menu_items(id text, name text, price int, category text, description text, menu_group text,
      item_type text, allergens text[], code text, option_groups jsonb, is_complimentary boolean,
      sort_order int, available_shifts text[], is_active boolean, is_temporary boolean);
    CREATE TABLE order_items(id text, order_id text, menu_item_id text, qty int, unit_price int, note text);
    CREATE TABLE order_charges(id text, order_id text, charge_type text, amount int, mode text, value int, note text, created_at timestamptz);
    CREATE TABLE menu_subcategories(name text, shift_key text, is_active boolean, sort_order int);
    INSERT INTO table_sessions VALUES ('session', '05', 3, '2026-09-19T00:00Z', NULL), ('empty', '07', 2, '2026-09-19T00:00Z', NULL);
    INSERT INTO menu_items VALUES
      ('rice','Rice',100,'Rice',NULL,'lunch_dinner','single',ARRAY['soy'],'002','[]',false,20,ARRAY[]::text[],true,false),
      ('fish','Fish',1600,'Fish','Fresh','lunch_dinner','single',ARRAY[]::text[],'001','[{"id":"size"}]',false,10,ARRAY['lunch','dinner'],true,false),
      ('tea','Tea',0,'Tea',NULL,'breakfast','set',NULL,'003','[]',true,5,ARRAY['breakfast'],true,false),
      ('hidden','Hidden',50,'Drink',NULL,'lunch_dinner','single',NULL,'004','[]',false,3,ARRAY['beverage'],true,false),
      ('inactive','Inactive',10,'Other',NULL,'lunch_dinner','single',NULL,'005','[]',false,1,ARRAY['lunch'],false,false),
      ('temporary','Custom',20,NULL,NULL,'lunch_dinner','single',NULL,NULL,'[]',false,1,ARRAY['lunch'],true,true),
      ('cross','Breakfast extra',80,'Extra',NULL,'lunch_dinner','single',NULL,'006','[]',false,9,ARRAY['breakfast'],true,false);
    INSERT INTO menu_subcategories VALUES ('Rice','lunch',true,1),('Empty','lunch',true,2);
    INSERT INTO orders VALUES
      ('submitted','05','submitted','2026-09-19T01:00Z',NULL,NULL),
      ('preparing','05','preparing','2026-09-19T02:00Z',NULL,NULL),
      ('served','05','served','2026-09-19T03:00Z',NULL,NULL),
      ('paid','05','paid','2026-09-19T04:00Z',NULL,NULL),
      ('closed','05','closed','2026-09-19T05:00Z',NULL,NULL),
      ('cancelled','05','submitted','2026-09-19T06:00Z','2026-09-19T06:01Z',NULL),
      ('merged','05','submitted','2026-09-19T07:00Z',NULL,'submitted'),
      ('zero','05','submitted','2026-09-19T08:00Z',NULL,NULL),
      ('old','05','closed','2026-09-18T01:00Z',NULL,NULL);
    INSERT INTO order_items SELECT id || '-item',id,'rice',2,90,NULL FROM orders WHERE id != 'zero';
    INSERT INTO order_items VALUES ('note','submitted','rice',1,NULL,'no salt'), ('free','zero','tea',1,0,'Drink: Tea');
    INSERT INTO order_charges VALUES
      ('discount','submitted','discount',-15,'amount',15,'fixture','2026-09-19T01:01Z'),
      ('fee','submitted','service_fee',10,'amount',10,NULL,'2026-09-19T01:02Z');
    INSERT INTO orders SELECT 'history-' || n,'99','closed','2025-01-01T00:00Z',NULL,NULL FROM generate_series(1,2000) n;
    INSERT INTO order_items SELECT id || '-item',id,'fish',1,1600,NULL FROM orders WHERE table_no='99';
    INSERT INTO order_charges SELECT id || '-fee',id,'tax',100,'amount',100,NULL,created_at FROM orders WHERE table_no='99';
  `);
}, 20_000);
afterAll(async () => db.close());
beforeEach(() => {
  mocks.enqueue.mockReset().mockImplementation(async (_tx, input) => input);
  mocks.query.mockReset().mockImplementation((sql, params) => {
    if (sql.includes("pg_advisory_xact_lock") || sql.includes("FROM print_deliveries")) return { rows: [] };
    return db.query(sql, params);
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(["05", "07"])("returns the exact existing bill, including timestamps, notes and exclusions, for table %s", async tableNo => {
  const session = (await db.query<any>(billBaseline[0], [tableNo])).rows[0];
  const params = [session.table_no, session.opened_at];
  const items = (await db.query(billBaseline[1], params)).rows;
  const orders = (await db.query(billBaseline[2], params)).rows;
  const summary = (await db.query<any>(billBaseline[3], params)).rows[0];
  const response = await bill(new Request(`http://fixture/api/tables/bill?tableNo=${tableNo}`));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(json({ tableNo, sessionId: session.id, openedAt: session.opened_at,
    guestCount: session.guest_count, items, orders, totalQty: summary.total_qty, totalAmount: summary.total_amount }));
  expect(mocks.query).toHaveBeenCalledTimes(2); // formerly four round trips
});

it("preserves the unopened-table response", async () => {
  const response = await bill(new Request("http://fixture/api/tables/bill?tableNo=06"));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "桌台未开台" });
  expect(mocks.query).toHaveBeenCalledTimes(1);
});

it("sends byte-identical receipt content using two reads, with no real printer calls", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
  for (const [key, value] of Object.entries({ XPYUN_USER: "fixture", XPYUN_USER_KEY: "fixture", XPYUN_SN: "fixture" })) vi.stubEnv(key, value);
  const session = (await db.query<any>(receiptBaseline[0], ["05"])).rows[0];
  const params = ["05", session.opened_at];
  const items = (await db.query<any>(receiptBaseline[1], params)).rows.map(row => ({ name: row.name, note: row.note || null,
    qty: Number(row.qty), unitPrice: Number(row.unit_price), amount: Number(row.amount) }));
  const labels: Record<string, string> = { discount: "DISCOUNT", service_fee: "SERVICE FEE", tax: "TAX" };
  const charges = (await db.query<any>(receiptBaseline[2], params)).rows.map(row => ({ label: labels[row.charge_type] || "ADJUSTMENT", amount: Number(row.amount) }));
  const itemAmount = items.reduce((sum, item) => sum + Math.max(0, item.amount), 0);
  const chargeAmount = charges.reduce((sum, item) => sum + item.amount, 0);
  const expected = renderBillTicket({ tableNo: "05",
    openedAt: session.opened_at, printedAt: new Date().toISOString(), items, charges, itemAmount, chargeAmount,
    totalAmount: itemAmount + chargeAmount, totalQty: items.reduce((sum, item) => sum + Math.max(0, item.qty), 0) });
  const prepared = await prepareReceiptDelivery({ query: mocks.query } as any, "actor", "intent-1", "05", "session");
  expect(prepared.content).toBe(expected);
  expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  expect(mocks.query.mock.calls.filter(([sql]) => sql.includes("FROM table_sessions") || sql.includes("WITH active_orders"))).toHaveLength(2);
});

const fields = "id, name, price, category, description, menu_group, item_type, allergens, code, option_groups, is_complimentary";
it.each(["lunch", "dinner", "breakfast", "beverage", "cocktail", "package", "unknown"])("preserves every menu field and both sort orders for %s", async shift => {
  const response = await menu(new Request(`http://fixture/api/menu?shift=${shift}`));
  const body = await response.json();
  const category = body.majorCategories.find((item: any) => item.key === body.shift);
  // These are the two original SELECTs, including the distinct current-menu/search filters.
  const items = (await db.query(`SELECT ${fields} FROM menu_items
    WHERE is_active = true AND is_temporary = false
      AND COALESCE(category, '') NOT IN ('热菜', '主食', '饮品', 'Hot Dish', 'Staple', 'Drink', 'Drinks')
      AND (menu_group = $1 OR ($2 = 'breakfast' AND $2 = ANY(available_shifts)))
      AND ${category.include_empty_shift_items ? "(COALESCE(array_length(available_shifts, 1), 0) = 0 OR $2 = ANY(available_shifts))" : "$2 = ANY(available_shifts)"}
    ORDER BY sort_order ASC, name ASC`, [category.menu_group, category.key])).rows;
  const searchItems = (await db.query(`SELECT ${fields} FROM menu_items WHERE is_active AND NOT is_temporary ORDER BY code NULLS LAST, sort_order, name`)).rows;
  expect(body.items).toEqual(items);
  expect(body.searchItems).toEqual(searchItems);
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=240");
  expect(mocks.query).toHaveBeenCalledTimes(3); // major categories, shared dishes, subcategories
});
