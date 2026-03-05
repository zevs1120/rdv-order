import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  requirePermission: vi.fn(),
  writeAuditLogSafe: vi.fn()
}));

vi.mock("../../lib/db", () => ({
  pool: {
    query: mocks.poolQuery
  }
}));

vi.mock("../../lib/permissions", () => ({
  requirePermission: mocks.requirePermission
}));

vi.mock("../../lib/audit", () => ({
  writeAuditLogSafe: mocks.writeAuditLogSafe
}));

import { DELETE } from "../../app/api/admin/menu-categories/[key]/route";

describe("menu category delete route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ userId: "manager-1", role: "manager" });
    mocks.writeAuditLogSafe.mockResolvedValue(undefined);
  });

  it("deletes major category and its subcategories", async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [{ count: "3" }] })
      .mockResolvedValueOnce({ rows: [] }) // begin
      .mockResolvedValueOnce({ rows: [{ key: "beverage" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }); // commit

    const res = await DELETE(new Request("http://localhost/api/admin/menu-categories/beverage"), {
      params: Promise.resolve({ key: "beverage" })
    });

    expect(res.status).toBe(200);
    expect(mocks.writeAuditLogSafe).toHaveBeenCalledTimes(1);
  });

  it("rejects delete when only one major category remains", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ count: "1" }] });
    const res = await DELETE(new Request("http://localhost/api/admin/menu-categories/beverage"), {
      params: Promise.resolve({ key: "beverage" })
    });
    expect(res.status).toBe(409);
  });

  it("rejects delete for non-manager role", async () => {
    mocks.requirePermission.mockResolvedValueOnce({ userId: "waiter-1", role: "waiter" });
    const res = await DELETE(new Request("http://localhost/api/admin/menu-categories/beverage"), {
      params: Promise.resolve({ key: "beverage" })
    });
    expect(res.status).toBe(403);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });
});
