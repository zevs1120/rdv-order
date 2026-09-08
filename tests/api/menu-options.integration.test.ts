import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), after: vi.fn() }));
vi.mock('../../lib/db', () => ({ pool: mocks }));
vi.mock('../../lib/permissions', () => ({ requireOrderCreate: async () => ({ userId: '11111111-1111-4111-8111-111111111111' }), requirePermission: async () => ({ userId: '11111111-1111-4111-8111-111111111111' }) }));
vi.mock('../../lib/audit', () => ({ writeAuditLogSafe: vi.fn() }));
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: mocks.after }));
import { POST } from '../../app/api/orders/route';
import { POST as checkout } from '../../app/api/tables/checkout/route';
import { POST as split } from '../../app/api/orders/[id]/split/route';
import { POST as merge } from '../../app/api/orders/merge/route';
import { POST as returnItem } from '../../app/api/orders/[id]/return-item/route';
import { GET as bill } from '../../app/api/tables/bill/route';
import { getOrderFinance } from '../../lib/order-finance';
import { __printTestUtils } from '../../lib/print';
import { refreshCatalog } from '../../scripts/menu/catalog-september-2026.mjs';
let db: PGlite;
let menu: any[];
const request = (body: unknown, key = 'menu_option_test_1') => new Request('http://localhost/api/orders', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-idempotency-key': key }, body: JSON.stringify(body),
});
const find = (name: string, free = false, group?: string) => menu.find(i => i.name === name && i.is_complimentary === free && (!group || i.menu_group === group));
const create = async (items: unknown[], key?: string) => POST(request({ tableNo: '01', items }, key));
beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync('db/schema.sql', 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', ''));
}, 20000);
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.query.mockImplementation((sql, params) => db.query(sql, params));
  mocks.connect.mockResolvedValue({ query: async (sql: string, params: unknown[]) => {
    try { return await db.query(sql, params); } catch (err) { console.error('Fixture SQL failure:', (err as Error).message); throw err; }
  }, release: vi.fn() });
  await db.exec("TRUNCATE users, menu_items, orders, table_sessions, pricing_rules CASCADE");
  await db.exec("INSERT INTO users(id,username,role,pin_salt,pin_hash) VALUES('11111111-1111-4111-8111-111111111111','fixture','manager','x','x'); INSERT INTO table_sessions(table_no,guest_count) VALUES('01',2)");
  await refreshCatalog(db);
  menu = (await db.query('SELECT * FROM menu_items')).rows;
});
afterAll(async () => db.close());
it('requires exactly one allowed drink, rejects forged choices/prices and creates no partial order', async () => {
  const item = find('Chinese Wonton Set', true);
  for (const choices of [{}, { beverage: 'latte' }, { beverage: 'coke', extra: 'milk' }]) {
    expect((await create([{ menuItemId: item.id, qty: 1, choices, price: 0 }])).status).toBe(400);
  }
  expect((await db.query('SELECT * FROM orders')).rows).toHaveLength(0);
  expect((await db.query('SELECT * FROM print_jobs')).rows).toHaveLength(0);
  expect(mocks.after).not.toHaveBeenCalled();
});
it('free meals retain separate drinks, zero balance and replay does not duplicate the ticket', async () => {
  const item = find('Chinese Wonton Set', true);
  const items = ['coke', 'coke_zero'].map(beverage => ({ menuItemId: item.id, qty: 1, choices: { beverage } }));
  const response = await create(items); expect(response.status).toBe(200);
  const { orderId } = await response.json();
  const rows = (await db.query<any>('SELECT * FROM order_items WHERE order_id=$1 ORDER BY note', [orderId])).rows;
  expect(rows.map(r => [r.unit_price, r.note])).toEqual([[0, 'Beverage: Coke'], [0, 'Beverage: Coke Zero']]);
  expect((await getOrderFinance(orderId))?.totalAmount).toBe(0);
  expect((await (await create(items)).json()).deduped).toBe(true);
  expect(mocks.after).toHaveBeenCalledTimes(1);
  const content = __printTestUtils.toXpyunKitchenContent({ type: 'order', orderId, tableNo: '01', createdAt: new Date().toISOString(), waiterName: 'fixture',
    totalQty: 2, totalAmount: 0, tickets: [{ target: 'kitchen', items: rows.map(r => ({ name: item.name, qty: 1, note: r.note, unitPrice: 0, amount: 0, target: 'kitchen' })) }] } as any);
  expect(content).toContain('CHINESE WONTON SET'); expect(content).toContain('Coke Zero');
  expect(content).not.toContain('PHP');
  await db.exec("INSERT INTO pricing_rules(name,charge_type,mode,value,is_active) VALUES('fixture fixed tax','tax','amount',50,true)");
  const closed = await checkout(request({ tableNo: '01' }));
  expect(closed.status).toBe(200); expect((await closed.json()).totalAmount).toBe(0);
});
it('mixed free and paid drinks charge only the separately ordered drink; later catalog edits do not reprice the order', async () => {
  const coke = find('Coke', false, 'lunch_dinner');
  const response = await create([{ menuItemId: find('Chinese Wonton Set', true).id, qty: 1, choices: { beverage: 'coke' } }, { menuItemId: coke.id, qty: 1 }]);
  const { orderId } = await response.json();
  await db.query('UPDATE menu_items SET price=999 WHERE id=$1', [coke.id]);
  expect((await getOrderFinance(orderId))?.totalAmount).toBe(90);
  const res = await bill(new Request('http://localhost/api/tables/bill?tableNo=01'));
  expect(res.status).toBe(200); expect((await res.json()).totalAmount).toBe(90);
});
it('chicken and pork share a dish code but have independent prices and targeted returns', async () => {
  const item = find('Chop Suey');
  const response = await create(['chicken', 'pork'].map(protein => ({ menuItemId: item.id, qty: 1, choices: { protein } })));
  const { orderId } = await response.json();
  expect((await getOrderFinance(orderId))?.totalAmount).toBe(870);
  const pork = (await db.query<any>("SELECT * FROM order_items WHERE note='Protein: Pork'")).rows[0];
  expect((await returnItem(request({ menuItemId: item.id, orderItemId: pork.id, qty: 1 }), { params: Promise.resolve({ id: orderId }) })).status).toBe(200);
  expect((await getOrderFinance(orderId))?.totalAmount).toBe(420);
  expect((await db.query<any>('SELECT note FROM order_items')).rows[0].note).toBe('Protein: Chicken');
});
it('split and merge preserve selected prices and notes after a catalog price change', async () => {
  const item = find('Chop Suey');
  const { orderId } = await (await create([{ menuItemId: item.id, qty: 2, choices: { protein: 'pork' } }])).json();
  await db.query('UPDATE menu_items SET price=900 WHERE id=$1', [item.id]);
  const res = await split(request({ items: [{ menuItemId: item.id, qty: 1 }] }), { params: Promise.resolve({ id: orderId }) });
  expect(res.status).toBe(200); const { targetOrderId } = await res.json();
  expect((await getOrderFinance(targetOrderId))?.totalAmount).toBe(450);
  const combined = await merge(request({ targetOrderId: orderId, sourceOrderIds: [targetOrderId] }));
  expect(combined.status).toBe(200); expect((await getOrderFinance(orderId))?.totalAmount).toBe(900);
  expect((await db.query<any>('SELECT note FROM order_items WHERE order_id=$1', [orderId])).rows[0].note).toBe('Protein: Pork');
});
it('refresh preserves unlisted employee dishes and stable unique codes, with correct seafood units and explicit coffee overrides', async () => {
  const custom = (await db.query<any>("INSERT INTO menu_items(name,price,category,menu_group) VALUES('Employee Special',321,'Specials','lunch_dinner') RETURNING *")).rows[0];
  await refreshCatalog(db);
  expect((await db.query<any>('SELECT name,price,category,code FROM menu_items WHERE id=$1', [custom.id])).rows[0]).toEqual({ name: custom.name, price: 321, category: 'Specials', code: custom.code });
  const after = (await db.query<any>('SELECT id,code FROM menu_items')).rows;
  expect(new Set(after.map(i => i.code)).size).toBe(after.length);
  for (const item of menu) expect(after.find(i => i.id === item.id)?.code).toBe(item.code);
  expect(find('Grouper').price).toBe(160); expect(find('Hairtail').price).toBe(120);
  expect(menu.filter(i => i.name === 'Americano').every(i => i.price === 150 && i.option_groups.length === 0)).toBe(true);
  expect(menu.filter(i => i.name === 'Latte').every(i => i.price === 180)).toBe(true);
  expect(find('Kung Pao Chicken').price).toBe(480);
});
