import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  requirePermission: vi.fn(),
  writeAuditLogSafe: vi.fn(),
  loadMenuMajorCategories: vi.fn(),
  findMenuMajorCategory: vi.fn()
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
  loadMenuMajorCategories: mocks.loadMenuMajorCategories,
  findMenuMajorCategory: mocks.findMenuMajorCategory
}));

import { GET, POST } from "../../app/api/admin/menu-subcategories/route";

function makePostRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/menu-subcategories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("menu subcategories route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ userId: "manager-1", role: "manager" });
    mocks.writeAuditLogSafe.mockResolvedValue(undefined);
    mocks.loadMenuMajorCategories.mockResolvedValue([
      {
        key: "beverage",
        menu_group: "lunch_dinner",
        label_en: "Beverage",
        label_zh: "饮品",
        include_empty_shift_items: false,
        sort_order: 40
      }
    ]);
    mocks.findMenuMajorCategory.mockImplementation((rows: Array<{ key: string }>, key: string) => {
      const normalized = String(key || "").trim().toLowerCase();
      return rows.find((row) => row.key === normalized) || null;
    });
  });

  it("creates subcategory with trimmed name", async () => {
    mocks.poolQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "sub-1",
          shift_key: "beverage",
          name: "Tea",
          display_name_zh: "茶",
          sort_order: 1000
        }]
      });

    const res = await POST(makePostRequest({
      shift: "beverage",
      name: "  Tea  ",
      displayNameZh: " 茶 "
    }));

    expect(res.status).toBe(201);
    expect(mocks.poolQuery).toHaveBeenCalledTimes(2);
    const duplicateArgs = mocks.poolQuery.mock.calls[0];
    expect(duplicateArgs?.[1]).toEqual(["beverage", "tea"]);
    const insertArgs = mocks.poolQuery.mock.calls[1];
    expect(insertArgs?.[1]).toEqual(["beverage", "Tea", "tea", "茶", 1000]);

    const body = await res.json();
    expect(body.subcategory.name).toBe("Tea");
    expect(mocks.writeAuditLogSafe).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate subcategory under same major category", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [{ id: "exists-1" }] });

    const res = await POST(makePostRequest({
      shift: "beverage",
      name: "tea"
    }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("子类目已存在");
  });

  it("rejects invalid shift in GET", async () => {
    mocks.findMenuMajorCategory.mockReturnValueOnce(null);
    const req = new Request("http://localhost/api/admin/menu-subcategories?shift=invalid");
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("rejects create for non-manager role", async () => {
    mocks.requirePermission.mockResolvedValueOnce({ userId: "waiter-1", role: "waiter" });
    const res = await POST(makePostRequest({
      shift: "beverage",
      name: "tea"
    }));
    expect(res.status).toBe(403);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });
});
