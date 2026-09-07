import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  requirePermission: vi.fn(),
  requireOrderCreate: vi.fn(),
  after: vi.fn(),
  runOrderPrintWorker: vi.fn()
}));

vi.mock("next/server", async importOriginal => ({
  ...await importOriginal<typeof import("next/server")>(),
  after: mocks.after
}));
vi.mock("../../lib/print-worker", () => ({ runOrderPrintWorker: mocks.runOrderPrintWorker }));

vi.mock("../../lib/db", () => ({
  pool: {
    query: mocks.poolQuery
  }
}));

vi.mock("../../lib/permissions", () => ({
  requirePermission: mocks.requirePermission,
  requireOrderCreate: mocks.requireOrderCreate
}));

import { POST } from "../../app/api/orders/route";
import { buildItemSignature, parseItems } from "../../lib/orders-utils";

const dishIdA = "11111111-1111-4111-8111-111111111111";
const dishIdB = "22222222-2222-4222-8222-222222222222";

function makeRequest(idempotencyKey?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (idempotencyKey) headers["x-idempotency-key"] = idempotencyKey;
  return new Request("http://localhost/api/orders", {
    method: "POST",
    headers,
    body: JSON.stringify({
      tableNo: "01",
      items: [
        { menuItemId: dishIdA, qty: 1, note: "no onion" },
        { menuItemId: dishIdB, qty: 2, note: null }
      ]
    })
  });
}

describe("orders api route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.after.mockReset();
    mocks.runOrderPrintWorker.mockReset();
    mocks.runOrderPrintWorker.mockResolvedValue({ picked: 1, printed: 1, failed: 0 });
    vi.stubEnv("PRINT_WAKE_ON_ORDER", "true");
    mocks.requirePermission.mockResolvedValue({ userId: "u-1", role: "waiter" });
    mocks.requireOrderCreate.mockResolvedValue({ userId: "u-1", role: "waiter" });
    mocks.poolQuery.mockResolvedValue({
      rows: [{
        session_open: true,
        valid_items: true,
        order_id: "order-new-1",
        inserted: true
      }]
    });
  });

  it("parseItems should merge duplicate line items by dish+note", () => {
    const parsed = parseItems([
      { menuItemId: dishIdA, qty: 1, note: "no onion" },
      { menuItemId: dishIdA, qty: 2, note: "no onion" },
      { menuItemId: dishIdA, qty: 1, note: "extra spicy" }
    ]);

    expect(parsed).toHaveLength(2);
    expect(parsed.find((row) => row.note === "no onion")?.qty).toBe(3);
    expect(parsed.find((row) => row.note === "extra spicy")?.qty).toBe(1);
  });

  it("buildItemSignature should be stable regardless of item order", () => {
    const a = buildItemSignature([
      { menuItemId: dishIdA, qty: 1, note: "N" },
      { menuItemId: dishIdB, qty: 2, note: null }
    ]);
    const b = buildItemSignature([
      { menuItemId: dishIdB, qty: 2, note: null },
      { menuItemId: dishIdA, qty: 1, note: "n" }
    ]);
    expect(a).toBe(b);
  });

  it("POST should create order and queue print job in one database call", async () => {
    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.orderId).toBe("order-new-1");
    expect(body.deduped).toBe(false);
    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
    const sql = String(mocks.poolQuery.mock.calls[0][0]);
    expect(sql).toContain("INSERT INTO orders");
    expect(sql).toContain("INSERT INTO order_items");
    expect(sql).toContain("INSERT INTO print_jobs");
    expect(sql).not.toContain("FOR UPDATE");
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.runOrderPrintWorker).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0]();
    expect(mocks.runOrderPrintWorker).toHaveBeenCalledWith("order-new-1");
  });

  it("POST idempotency hit should return existing order without duplicate items", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [{
        session_open: true,
        valid_items: true,
        order_id: "order-existing-1",
        inserted: false
      }]
    });

    const res = await POST(makeRequest("idem_12345678"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.orderId).toBe("order-existing-1");
    expect(body.deduped).toBe(true);
    expect(body.dedupeReason).toBe("idempotency");
    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("POST should reject when table is not open", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [{
        session_open: false,
        valid_items: true,
        order_id: null,
        inserted: null
      }]
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("该桌未开台，请先开台");
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("POST should reject invalid menu items", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [{
        session_open: true,
        valid_items: false,
        order_id: null,
        inserted: null
      }]
    });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("存在无效或已下架菜品");
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("returns the same committed receipt on retry without scheduling a second print", async () => {
    const first = await POST(makeRequest("idem_12345678"));
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ session_open: true, valid_items: true, order_id: "order-new-1", inserted: false }] });
    const retry = await POST(makeRequest("idem_12345678"));
    expect((await first.json()).orderId).toBe((await retry.json()).orderId);
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it.each(["false", " FALSE "])("respects the existing PRINT_WAKE_ON_ORDER=%s switch", async value => {
    vi.stubEnv("PRINT_WAKE_ON_ORDER", value);
    expect((await POST(makeRequest())).status).toBe(200);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
  });

  it("automatically prints when the optional switch is unset", async () => {
    vi.stubEnv("PRINT_WAKE_ON_ORDER", undefined);
    await POST(makeRequest());
    expect(mocks.after).toHaveBeenCalledTimes(1);
  });

  it("keeps a committed order successful if the printer or worker fails after response", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.runOrderPrintWorker.mockRejectedValue(new Error("provider secret detail"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    await expect(mocks.after.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("[order-print] worker failed; inspect print queue");
    expect(log.mock.calls.flat().join(" ")).not.toContain("provider secret detail");
    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
  });

  it("reports a recorded print failure without changing the order receipt", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.runOrderPrintWorker.mockResolvedValue({ picked: 1, printed: 0, failed: 1 });
    expect((await POST(makeRequest())).status).toBe(200);
    await mocks.after.mock.calls[0][0]();
    expect(log).toHaveBeenCalledWith("[order-print] print failed; inspect print queue");
  });

  it("preserves the committed receipt if lifecycle registration fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.after.mockImplementation(() => { throw new Error("missing request context"); });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect((await res.json()).orderId).toBe("order-new-1");
    expect(mocks.runOrderPrintWorker).not.toHaveBeenCalled();
  });

  it("never schedules printing on a database failure", async () => {
    mocks.poolQuery.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await POST(makeRequest())).status).toBe(500);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it.each(["UNAUTHORIZED", "FORBIDDEN"])("never creates or prints an unauthorized order: %s", async message => {
    mocks.requireOrderCreate.mockRejectedValueOnce(new Error(message));
    expect((await POST(makeRequest())).status).toBe(message === "UNAUTHORIZED" ? 401 : 403);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
