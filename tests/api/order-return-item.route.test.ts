import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  requirePermission: vi.fn(),
  writeAuditLogSafe: vi.fn()
}));

vi.mock("../../lib/db", () => ({
  pool: {
    connect: mocks.connect
  }
}));

vi.mock("../../lib/permissions", () => ({
  requirePermission: mocks.requirePermission
}));

vi.mock("../../lib/audit", () => ({
  writeAuditLogSafe: mocks.writeAuditLogSafe
}));

import { POST } from "../../app/api/orders/[id]/return-item/route";

const orderId = "4d8bb2ac-81b6-430e-aa0f-9962365dc0e4";
const dishId = "a63e17ad-b791-41a9-8b79-bfa207ae16d1";

function makeRequest(qty = 1) {
  return new Request(`http://localhost/api/orders/${orderId}/return-item`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      menuItemId: dishId,
      qty,
      reason: "manual"
    })
  });
}

describe("order return-item api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ userId: "u-1", role: "waiter" });
    mocks.writeAuditLogSafe.mockResolvedValue(undefined);
  });

  it("returns 200 and recalculates auto charges for active rules", async () => {
    const release = vi.fn();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) {
        return { rows: [] };
      }
      if (sql.includes("SELECT status") && sql.includes("FROM orders")) {
        return { rows: [{ status: "submitted" }] };
      }
      if (sql.includes("FROM order_items") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "item-1", qty: 2 }] };
      }
      if (sql.includes("UPDATE order_items SET qty")) {
        return { rows: [] };
      }
      if (sql.includes("DELETE FROM order_charges")) {
        return { rows: [] };
      }
      if (sql.includes("SUM(oi.qty * COALESCE(oi.unit_price, mi.price))")) {
        return { rows: [{ item_amount: 450 }] };
      }
      if (sql.includes("FROM pricing_rules") && sql.includes("is_active = true")) {
        return {
          rows: [{ id: "rule-1", charge_type: "service_fee", mode: "percent", value: 10 }]
        };
      }
      if (sql.includes("INSERT INTO order_charges")) {
        return { rows: [] };
      }
      if (sql.includes("INSERT INTO order_events")) {
        return { rows: [] };
      }
      throw new Error(`Unhandled SQL in return-item test: ${sql.slice(0, 120)}`);
    });

    mocks.connect.mockResolvedValue({ query, release });

    const res = await POST(makeRequest(1), { params: Promise.resolve({ id: orderId }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.returnedQty).toBe(1);
    expect(body.orderId).toBe(orderId);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("returns 409 when order is already paid", async () => {
    const release = vi.fn();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) {
        return { rows: [] };
      }
      if (sql.includes("SELECT status") && sql.includes("FROM orders")) {
        return { rows: [{ status: "paid" }] };
      }
      throw new Error(`Unhandled SQL in return-item paid test: ${sql.slice(0, 120)}`);
    });
    mocks.connect.mockResolvedValue({ query, release });

    const res = await POST(makeRequest(1), { params: Promise.resolve({ id: orderId }) });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe("当前状态不可退菜");
    expect(release).toHaveBeenCalledTimes(1);
  });
});

