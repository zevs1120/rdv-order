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

import { POST } from "../../app/api/tables/reverse-checkout/route";

function makeRequest() {
  return new Request("http://localhost/api/tables/reverse-checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tableNo: "05", reason: "cash correction" })
  });
}

describe("tables reverse-checkout api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ userId: "manager-1", role: "manager" });
    mocks.writeAuditLogSafe.mockResolvedValue(undefined);
  });

  it("reapplies active auto charges after reopening orders", async () => {
    const release = vi.fn();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) return { rows: [] };
      if (sql.includes("FROM table_sessions") && sql.includes("closed_at IS NULL")) {
        return { rows: [] };
      }
      if (sql.includes("FROM table_sessions") && sql.includes("closed_at IS NOT NULL")) {
        return {
          rows: [{
            id: "session-1",
            table_no: "05",
            opened_at: "2026-03-31T10:00:00.000Z",
            closed_at: "2026-03-31T12:00:00.000Z"
          }]
        };
      }
      if (sql.includes("UPDATE table_sessions") && sql.includes("closed_at = NULL")) {
        return { rows: [] };
      }
      if (sql.includes("UPDATE orders") && sql.includes("reversed_at = now()")) {
        return { rows: [{ id: "order-1" }] };
      }
      if (sql.includes("DELETE FROM order_charges") && sql.includes("source = 'rule_auto'")) {
        return { rows: [] };
      }
      if (sql.includes("SUM(oi.qty * COALESCE(oi.unit_price, mi.price))")) {
        return { rows: [{ item_amount: 480 }] };
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
      throw new Error(`Unhandled SQL in reverse-checkout test: ${sql.slice(0, 120)}`);
    });

    mocks.connect.mockResolvedValue({ query, release });

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reopened).toBe(true);

    const insertChargeCall = query.mock.calls.find(
      (args: unknown[]) => typeof args[0] === "string" && String(args[0]).includes("INSERT INTO order_charges")
    );
    expect(insertChargeCall).toBeTruthy();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
