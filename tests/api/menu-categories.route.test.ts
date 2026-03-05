import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  requirePermission: vi.fn(),
  writeAuditLogSafe: vi.fn(),
  loadMenuMajorCategories: vi.fn()
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

vi.mock("../../lib/menu-categories", () => ({
  loadMenuMajorCategories: mocks.loadMenuMajorCategories
}));

import { GET, POST } from "../../app/api/admin/menu-categories/route";

function makePostRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/menu-categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("menu categories route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ userId: "manager-1", role: "manager" });
    mocks.writeAuditLogSafe.mockResolvedValue(undefined);
  });

  it("returns major categories in GET", async () => {
    mocks.loadMenuMajorCategories.mockResolvedValue([
      {
        key: "breakfast",
        menu_group: "breakfast",
        label_en: "Breakfast",
        label_zh: "早餐",
        include_empty_shift_items: true,
        sort_order: 10
      }
    ]);

    const res = await GET(new Request("http://localhost/api/admin/menu-categories"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.majorCategories).toHaveLength(1);
  });

  it("creates main category with normalized key", async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ sort_order: 70 }] })
      .mockResolvedValueOnce({
        rows: [{
          key: "tea",
          menu_group: "lunch_dinner",
          label_en: "Tea",
          label_zh: "茶",
          include_empty_shift_items: false,
          sort_order: 70
        }]
      });

    const res = await POST(makePostRequest({
      labelEn: "Tea",
      labelZh: "茶",
      menuGroup: "lunch_dinner"
    }));

    expect(res.status).toBe(201);
    expect(mocks.poolQuery).toHaveBeenCalledTimes(3);
    const insertArgs = mocks.poolQuery.mock.calls[2];
    expect(insertArgs?.[1][0]).toBe("tea");
  });

  it("rejects duplicate key", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ id: "dup-1" }] });
    const res = await POST(makePostRequest({
      labelEn: "Breakfast",
      labelZh: "早餐",
      menuGroup: "breakfast"
    }));
    expect(res.status).toBe(409);
  });

  it("rejects create for non-manager role", async () => {
    mocks.requirePermission.mockResolvedValueOnce({ userId: "waiter-1", role: "waiter" });
    const res = await POST(makePostRequest({
      labelEn: "Tea",
      labelZh: "茶",
      menuGroup: "lunch_dinner"
    }));
    expect(res.status).toBe(403);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });
});
