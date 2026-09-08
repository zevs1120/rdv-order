import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), categories: vi.fn() }));
vi.mock("../../lib/db", () => ({ pool: { query: mocks.query } }));
vi.mock("../../lib/menu-categories", () => ({
  loadMenuMajorCategories: mocks.categories,
  findMenuMajorCategory: (categories: Array<{ key: string }>, key: string) => categories.find((c) => c.key === key)
}));
import { GET } from "../../app/api/menu/route";
beforeEach(() => {
  mocks.query.mockReset();
  mocks.categories.mockResolvedValue([{ key: "lunch", menu_group: "lunch_dinner", include_empty_shift_items: true }]);
});
describe("menu reads", () => {
  it("starts independent reads together and preserves dish-first category ordering", async () => {
    let finishItems!: (value: unknown) => void;
    mocks.query.mockImplementation((sql: string) => sql.includes('ORDER BY code NULLS LAST') ? Promise.resolve({ rows: [] }) : sql.includes("FROM menu_items")
      ? new Promise((resolve) => { finishItems = resolve; })
      : Promise.resolve({ rows: [{ name: "Rice" }, { name: "Empty" }] }));
    const pending = GET(new Request("http://localhost/api/menu?shift=lunch"));
    await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(3));
    finishItems({ rows: [{ id: "one", category: "Rice" }, { id: "two", category: "Fish" }] });
    const body = await (await pending).json();
    expect(body.subcategories).toEqual(["Rice", "Fish", "Empty"]);
    expect(body.items.map((item: { id: string }) => item.id)).toEqual(["one", "two"]);
  });
  it("preserves the missing-subcategories-table fallback but does not hide other failures", async () => {
    mocks.query.mockImplementation((sql: string) => sql.includes("FROM menu_items")
      ? Promise.resolve({ rows: [] }) : Promise.reject({ code: "42P01" }));
    expect((await (await GET(new Request("http://localhost/api/menu"))).json()).subcategories).toEqual([]);
    mocks.query.mockRejectedValue({ code: "08006" });
    await expect(GET(new Request("http://localhost/api/menu"))).rejects.toMatchObject({ code: "08006" });
  });
});
