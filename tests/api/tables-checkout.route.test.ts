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

vi.mock("../../lib/table-lock", () => ({
  lockSessionName: vi.fn().mockResolvedValue(undefined)
}));

import { POST } from "../../app/api/tables/checkout/route";

function makeRequest() {
  return new Request("http://localhost/api/tables/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tableNo: "05" })
  });
}

describe("tables checkout api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ userId: "manager-1", role: "manager" });
    mocks.writeAuditLogSafe.mockResolvedValue(undefined);
  });

  it("excludes cancelled and merged orders from checkout summary and events", async () => {
    const release = vi.fn();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) return { rows: [] };
      if (sql.includes("FROM table_sessions") && sql.includes("FOR UPDATE")) {
        return { rows: [{ id: "session-1", table_no: "05", opened_at: "2026-03-31T10:00:00.000Z" }] };
      }
      if (sql.includes("SELECT id, status") && sql.includes("FROM orders")) {
        return { rows: [{ id: "order-1", status: "submitted" }] };
      }
      if (sql.includes("FROM pricing_rules") && sql.includes("charge_type = 'tax'")) {
        return { rows: [] };
      }
      if (sql.includes("WHERE oi.order_id = $1") && sql.includes("SUM(oi.qty * mi.price)")) {
        return { rows: [{ item_amount: 450, charge_amount: 0 }] };
      }
      if (sql.includes("WITH order_total AS")) {
        return { rows: [{ order_count: 1, total_amount: 450 }] };
      }
      if (sql.includes("INSERT INTO order_events") && sql.includes("'checkout'")) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE orders") || sql.includes("UPDATE table_sessions")) {
        return { rows: [] };
      }
      throw new Error(`Unhandled SQL in tables checkout test: ${sql.slice(0, 120)}`);
    });

    mocks.connect.mockResolvedValue({ query, release });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalAmount).toBe(450);

    const summaryCall = query.mock.calls.find(
      (args: unknown[]) => typeof args[0] === "string" && String(args[0]).includes("WITH order_total AS")
    );
    expect(String(summaryCall?.[0] || "")).toContain("o.cancelled_at IS NULL");
    expect(String(summaryCall?.[0] || "")).toContain("o.merged_into_order_id IS NULL");

    const eventCall = query.mock.calls.find(
      (args: unknown[]) => typeof args[0] === "string" && String(args[0]).includes("INSERT INTO order_events")
    );
    expect(String(eventCall?.[0] || "")).toContain("o.cancelled_at IS NULL");
    expect(String(eventCall?.[0] || "")).toContain("o.merged_into_order_id IS NULL");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
