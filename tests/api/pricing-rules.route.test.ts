import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  connect: vi.fn(),
  requirePermission: vi.fn(),
  writeAuditLogSafe: vi.fn()
}));

vi.mock("../../lib/db", () => ({
  pool: {
    query: mocks.poolQuery,
    connect: mocks.connect
  }
}));

vi.mock("../../lib/permissions", () => ({
  requirePermission: mocks.requirePermission
}));

vi.mock("../../lib/audit", () => ({
  writeAuditLogSafe: mocks.writeAuditLogSafe
}));

import { PATCH } from "../../app/api/pricing/rules/route";

function makePatchRequest(rules: Array<Record<string, unknown>>) {
  return new Request("http://localhost/api/pricing/rules", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules })
  });
}

describe("pricing rules route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ userId: "manager-1", role: "manager" });
    mocks.writeAuditLogSafe.mockResolvedValue(undefined);
  });

  it("active rule should apply to submitted and paid orders", async () => {
    const release = vi.fn();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) return { rows: [] };
      if (sql.includes("INSERT INTO pricing_rules") && sql.includes("RETURNING id")) {
        return { rows: [{ id: "rule-1" }] };
      }
      if (sql.includes("WITH order_base AS")) {
        return { rows: [] };
      }
      throw new Error(`Unhandled SQL(active): ${sql.slice(0, 120)}`);
    });

    mocks.connect.mockResolvedValue({ query, release });
    mocks.poolQuery.mockResolvedValue({ rows: [{ id: "rule-1" }] });

    const res = await PATCH(
      makePatchRequest([
        {
          name: "Service Fee",
          charge_type: "service_fee",
          mode: "percent",
          value: 10,
          is_active: true,
          sort_order: 10
        }
      ])
    );

    expect(res.status).toBe(200);
    const applySqlCall = query.mock.calls.find(
      (args: unknown[]) => typeof args[0] === "string" && (args[0] as string).includes("WITH order_base AS")
    );
    expect(applySqlCall).toBeTruthy();
    const applySql = String(applySqlCall?.[0] || "");
    expect(applySql).toContain("o.status IN ('submitted', 'paid')");
    expect(applySql).toContain("o.merged_into_order_id IS NULL");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("inactive rule should remove auto charges from submitted and paid orders", async () => {
    const release = vi.fn();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) return { rows: [] };
      if (sql.includes("UPDATE pricing_rules") && sql.includes("RETURNING id")) {
        return { rows: [{ id: "rule-2" }] };
      }
      if (sql.includes("DELETE FROM order_charges oc") && sql.includes("oc.source = 'rule_auto'")) {
        return { rows: [] };
      }
      throw new Error(`Unhandled SQL(inactive): ${sql.slice(0, 120)}`);
    });

    mocks.connect.mockResolvedValue({ query, release });
    mocks.poolQuery.mockResolvedValue({ rows: [{ id: "rule-2" }] });

    const res = await PATCH(
      makePatchRequest([
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          name: "Discount",
          charge_type: "discount",
          mode: "amount",
          value: 50,
          is_active: false,
          sort_order: 20
        }
      ])
    );

    expect(res.status).toBe(200);
    const removeSqlCall = query.mock.calls.find(
      (args: unknown[]) => typeof args[0] === "string" && (args[0] as string).includes("DELETE FROM order_charges oc")
    );
    expect(removeSqlCall).toBeTruthy();
    const removeSql = String(removeSqlCall?.[0] || "");
    expect(removeSql).toContain("o.status IN ('submitted', 'paid')");
    expect(removeSql).toContain("o.merged_into_order_id IS NULL");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("string false should be treated as inactive to avoid accidental auto-charge enable", async () => {
    const release = vi.fn();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) return { rows: [] };
      if (sql.includes("INSERT INTO pricing_rules") && sql.includes("RETURNING id")) {
        return { rows: [{ id: "rule-3" }] };
      }
      if (sql.includes("DELETE FROM order_charges oc") && sql.includes("oc.source = 'rule_auto'")) {
        return { rows: [] };
      }
      throw new Error(`Unhandled SQL(string-false): ${sql.slice(0, 120)}`);
    });

    mocks.connect.mockResolvedValue({ query, release });
    mocks.poolQuery.mockResolvedValue({ rows: [{ id: "rule-3" }] });

    const res = await PATCH(
      makePatchRequest([
        {
          name: "Tax",
          charge_type: "tax",
          mode: "percent",
          value: 5,
          is_active: "false",
          sort_order: 30
        }
      ])
    );

    expect(res.status).toBe(200);
    const removeSqlCall = query.mock.calls.find(
      (args: unknown[]) => typeof args[0] === "string" && (args[0] as string).includes("DELETE FROM order_charges oc")
    );
    expect(removeSqlCall).toBeTruthy();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
