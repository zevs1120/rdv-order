import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), auth: vi.fn() }));
vi.mock("../../lib/db", () => ({ pool: mocks }));
vi.mock("../../lib/permissions", () => ({ requireOrderCreate: mocks.auth, requirePermission: mocks.auth }));
import { POST, GET } from "../../app/api/print/local/route";
import { POST as order } from "../../app/api/orders/route";
import { GET as recover } from "../../app/api/orders/request-status/route";
import { POST as bill } from "../../app/api/tables/print-bill/route";
import { savePrint, sendPrint } from "../../lib/printing/records";
import { escpos, LAN_IMPLEMENTATION, LAN_SN } from "../../lib/printing/lan";
import { renderOrderTicket, renderBillTicket } from "../../lib/printing/tickets";
const actor = "11111111-1111-4111-8111-111111111111", dish = "22222222-2222-4222-8222-222222222222";
let db: PGlite;
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(readFileSync("db/schema.sql", "utf8").replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", ""));
  for (const file of ["026_print_deliveries.sql", "027_direct_printing.sql"]) await db.exec(readFileSync("db/migrations/" + file, "utf8"));
}, 20000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  mocks.query.mockImplementation((sql, params) => db.query(sql, params));
  mocks.connect.mockResolvedValue({ query: (sql: string, params: unknown[]) => db.query(sql, params), release() {} });
  mocks.auth.mockResolvedValue({ userId: actor, role: "waiter" });
  await db.exec("TRUNCATE print_deliveries, users, menu_items, orders, table_sessions CASCADE");
  await db.query("INSERT INTO users (id, username, role, pin_salt, pin_hash) VALUES ($1,'fixture','waiter','x','x')", [actor]);
  await db.query("INSERT INTO menu_items (id,name,price,menu_group) VALUES ($1,'Rice',25,'lunch_dinner')", [dish]);
  await db.query("INSERT INTO table_sessions (table_no,guest_count,opened_by) VALUES ('05',2,$1)", [actor]);
});
const request = (body: object) => new Request("http://fixture/api/print/local", { method: "POST", body: JSON.stringify(body) });
const save = (key: string) => savePrint(db, { kind: "self_test", intentKey: key, printerSn: LAN_SN,
  content: "<N>TEST<BR></N>", snapshot: { localActor: actor }, implementation: LAN_IMPLEMENTATION });
it("freezes local order and bill, recovers lost response and never hands them to cloud", async () => {
  const req = () => new Request("http://fixture/api/orders", { method: "POST", headers: { "x-idempotency-key": "local-order-123" },
    body: JSON.stringify({ tableNo: "05", printTransport: "lan-v1", items: [{ menuItemId: dish, qty: 1 }] }) });
  const first = await (await order(req())).json();
  expect(first.localPrint).toMatchObject({ status: "queued", mac: "00:21:40:ff:2b:95" });
  expect((await (await order(req())).json()).localPrint.id).toBe(first.localPrint.id);
  const recovered = await (await recover(new Request("http://fixture/api/orders/request-status?key=local-order-123"))).json();
  expect(recovered.localPrint.id).toBe(first.localPrint.id);
  const receipt = await (await bill(new Request("http://fixture/api/tables/print-bill", { method: "POST",
    headers: { "x-idempotency-key": "local-bill-123" }, body: JSON.stringify({ tableNo: "05", printTransport: "lan-v1" }) }))).json();
  expect(receipt.localPrint.status).toBe("queued");
  const print = vi.fn();
  await sendPrint(first.localPrint.id, db, () => ({ print }));
  await sendPrint(receipt.localPrint.id, db, () => ({ print }));
  expect(print).not.toHaveBeenCalled();
  expect((await db.query("SELECT * FROM print_deliveries")).rows).toHaveLength(2);
});
it("claims once, serializes two phones, does not regrant an expired or acknowledged claim", async () => {
  const a = await save("a"), b = await save("b");
  const grant = await (await POST(request({ action: "claim", id: a.id }))).json();
  expect(grant.granted).toBe(true);
  expect((await (await POST(request({ action: "claim", id: a.id }))).json()).granted).toBe(false);
  expect((await (await POST(request({ action: "claim", id: b.id }))).json()).status).toBe("busy");
  await POST(request({ action: "report", id: a.id, token: grant.token, status: "accepted" }));
  expect((await (await POST(request({ action: "claim", id: a.id }))).json()).status).toBe("accepted");
  expect((await (await POST(request({ action: "claim", id: b.id }))).json()).granted).toBe(true);
  await db.query("UPDATE print_deliveries SET sending_started_at = now() - INTERVAL '1 minute' WHERE id = $1", [b.id]);
  expect((await (await POST(request({ action: "claim", id: b.id }))).json()).status).toBe("unknown");
});
it("does not expose or grant another waiter's ticket", async () => {
  const a = await save("a"); mocks.auth.mockResolvedValue({ userId: "other", role: "waiter" });
  expect((await POST(request({ action: "claim", id: a.id }))).status).toBe(404);
  expect((await (await GET(new Request("http://fixture/api/print/local"))).json()).jobs).toEqual([]);
});
it("retains both existing ticket formats and strips user control bytes", () => {
  const kitchen = renderOrderTicket({ tableNo: "05", createdAt: "2026-10-14T04:00:00Z", waiter: "Staff",
    items: [{ name: "Rice", qty: 2, note: "No salt\u001b\u0040" }] });
  const guest = renderBillTicket({ tableNo: "05", openedAt: "2026-10-14T04:00:00Z", printedAt: "2026-10-14T04:01:00Z",
    items: [{ name: "Rice", qty: 2, unitPrice: 25, amount: 50, note: null }], totalQty: 2, itemAmount: 50, chargeAmount: 0, totalAmount: 50, charges: [] });
  for (const [content, title] of [[kitchen, "RDV KITCHEN COPY"], [guest, "RDV GUEST COPY"]]) {
    const output = escpos(content);
    expect(output.toString()).toContain(title);
    expect(output.toString()).not.toMatch(/<\/?(?:BR|N|B|CB|C)>/);
    expect([...output.subarray(-4)]).toEqual([29, 86, 66, 0]);
  }
  expect(escpos(guest).toString()).toContain("TOTAL     : PHP 50");
  expect(escpos(kitchen).toString()).toContain("No salt @");
});
