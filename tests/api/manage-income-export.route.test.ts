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

import { GET } from "../../app/api/manage/income/export/route";

describe("manage income export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ userId: "manager-1", role: "manager" });
  });

  it("rejects invalid month params", async () => {
    const req = new Request("http://localhost/api/manage/income/export?fromMonth=2026-2&toMonth=2026-03");
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("rejects when end month is before start month", async () => {
    const req = new Request("http://localhost/api/manage/income/export?fromMonth=2026-04&toMonth=2026-03");
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("exports single month csv with natural-month UTC window", async () => {
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [{
        created_at: "2026-02-03T00:15:00.000Z",
        table_no: "05",
        order_id: "abc-123",
        subtotal: 450,
        fees: 0,
        total: 450
      }]
    });

    const req = new Request("http://localhost/api/manage/income/export?fromMonth=2026-02&toMonth=2026-02&tzOffsetMin=-480");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("RDV_Revenue_2026-02.csv");

    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
    const params = mocks.poolQuery.mock.calls[0]?.[1];
    expect(params).toEqual(["2026-01-31T16:00:00.000Z", "2026-02-28T16:00:00.000Z"]);

    const body = await res.text();
    expect(body).toContain("created_at,table,order_id,subtotal,fees,total,currency");
    expect(body).toContain("2026-02-03 08:15:00,05,abc-123,450,0,450,PHP");
  });

  it("exports month range csv filename with to-month suffix", async () => {
    mocks.poolQuery.mockResolvedValueOnce({ rows: [] });

    const req = new Request("http://localhost/api/manage/income/export?fromMonth=2026-01&toMonth=2026-06&tzOffsetMin=-480");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("RDV_Revenue_2026-01_to_2026-06.csv");
    const params = mocks.poolQuery.mock.calls[0]?.[1];
    expect(params).toEqual(["2025-12-31T16:00:00.000Z", "2026-06-30T16:00:00.000Z"]);
  });
});
