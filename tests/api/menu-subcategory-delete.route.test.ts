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

import { DELETE } from "../../app/api/admin/menu-subcategories/[id]/route";

describe("menu subcategory delete route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ userId: "manager-1", role: "manager" });
    mocks.writeAuditLogSafe.mockResolvedValue(undefined);
  });

  it("deletes subcategory", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [{ id: "sub-1", shift_key: "beverage", name: "Tea" }]
    });

    const res = await DELETE(new Request("http://localhost/api/admin/menu-subcategories/sub-1"), {
      params: Promise.resolve({ id: "sub-1" })
    });

    expect(res.status).toBe(200);
    expect(mocks.writeAuditLogSafe).toHaveBeenCalledTimes(1);
  });

  it("rejects non-manager", async () => {
    mocks.requirePermission.mockResolvedValueOnce({ userId: "waiter-1", role: "waiter" });
    const res = await DELETE(new Request("http://localhost/api/admin/menu-subcategories/sub-1"), {
      params: Promise.resolve({ id: "sub-1" })
    });
    expect(res.status).toBe(403);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });
});
