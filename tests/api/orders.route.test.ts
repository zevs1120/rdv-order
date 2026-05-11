import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  requirePermission: vi.fn(),
  requireOrderCreate: vi.fn()
}));

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
  });
});
