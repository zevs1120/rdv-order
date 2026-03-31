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

import { GET } from "../../app/api/summary/route";

describe("summary api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ userId: "manager-1", role: "manager" });

    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("WITH filtered_orders AS")) {
        return { rows: [{ order_count: 2, total_amount: 1080 }] };
      }
      if (sql.includes("SELECT mi.id AS menu_item_id")) {
        return { rows: [{ menu_item_id: "dish-1", name: "Chicken Curry", qty: 2 }] };
      }
      throw new Error(`Unhandled SQL in summary test: ${sql.slice(0, 120)}`);
    });
  });

  it("counts orders once and includes charges in total amount", async () => {
    const res = await GET(new Request("http://localhost/api/summary"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.orderCount).toBe(2);
    expect(body.totalAmount).toBe(1080);

    const totalCall = mocks.poolQuery.mock.calls.find(
      (args: unknown[]) => typeof args[0] === "string" && String(args[0]).includes("WITH filtered_orders AS")
    );
    const sql = String(totalCall?.[0] || "");
    expect(sql).toContain("LEFT JOIN charge_total ct");
    expect(sql).toContain("COUNT(*)::int AS order_count");
    expect(sql).toContain("o.merged_into_order_id IS NULL");
    expect(sql).not.toContain("JOIN order_items oi ON o.id = oi.order_id");
  });
});
