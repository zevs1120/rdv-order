import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  requirePermission: vi.fn()
}));

vi.mock("../../lib/db", () => ({
  pool: {
    query: mocks.poolQuery
  }
}));

vi.mock("../../lib/permissions", () => ({
  requirePermission: mocks.requirePermission
}));

import { GET } from "../../app/api/tables/bill/route";

describe("tables bill api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ userId: "u-1", role: "waiter" });

    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM table_sessions")) {
        return {
          rows: [{ id: "session-1", table_no: "05", guest_count: 2, opened_at: "2026-03-31T10:00:00.000Z" }]
        };
      }
      if (sql.includes("SUM(oi.qty)::int AS qty") && sql.includes("FROM orders o")) {
        return {
          rows: [{ menu_item_id: "dish-1", name: "Chicken Curry", qty: 2, amount: 900, note: null }]
        };
      }
      if (sql.includes("WITH order_base AS")) {
        return { rows: [] };
      }
      if (sql.includes("WITH filtered_orders AS")) {
        return { rows: [{ total_qty: 2, total_amount: 900 }] };
      }
      throw new Error(`Unhandled SQL in tables bill test: ${sql.slice(0, 120)}`);
    });
  });

  it("filters cancelled and merged orders out of aggregated bill items", async () => {
    const res = await GET(new Request("http://localhost/api/tables/bill?tableNo=05"));
    expect(res.status).toBe(200);

    const itemQueryCall = mocks.poolQuery.mock.calls.find(
      (args: unknown[]) => typeof args[0] === "string" && String(args[0]).includes("SUM(oi.qty)::int AS qty")
    );

    expect(itemQueryCall).toBeTruthy();
    const sql = String(itemQueryCall?.[0] || "");
    expect(sql).toContain("AND o.cancelled_at IS NULL");
    expect(sql).toContain("AND o.merged_into_order_id IS NULL");
  });
});
