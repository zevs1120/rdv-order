import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requireOrderCreate: vi.fn() }));
vi.mock("../../lib/db", () => ({ pool: { query: mocks.query } }));
vi.mock("../../lib/permissions", () => ({ requireOrderCreate: mocks.requireOrderCreate }));
import { GET } from "../../app/api/orders/request-status/route";

function request(key = "request-12345678") {
  return new Request(`http://localhost/api/orders/request-status?key=${encodeURIComponent(key)}`);
}

describe("order request status recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrderCreate.mockResolvedValue({ userId: "waiter-a", role: "waiter" });
    mocks.query.mockResolvedValue({ rows: [] });
  });
  it("finds an already committed order using the same authenticated owner and request key", async () => {
    mocks.query.mockResolvedValue({ rows: [{ id: "existing-order" }] });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ found: true, orderId: "existing-order" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toContain("WHERE waiter_id = $1 AND client_request_id = $2");
    expect(params).toEqual(["waiter-a", "request-12345678"]);
    // Recovery must also work after checkout and must never create print jobs.
    expect(sql).not.toMatch(/INSERT|UPDATE|DELETE|table_sessions|status\s*=/i);
  });
  it("returns found:false without exposing another owner's request", async () => {
    const response = await GET(request());
    expect(await response.json()).toEqual({ found: false });
    expect(mocks.query.mock.calls[0][1][0]).toBe("waiter-a");
  });
  it.each(["", "short", "x".repeat(81), "invalid/key", "key' OR 1=1 --"])("rejects invalid key %j before querying", async (key) => {
    const response = await GET(request(key));
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each([["UNAUTHORIZED", 401], ["FORBIDDEN", 403]] as const)("rejects %s without database access", async (message, status) => {
    mocks.requireOrderCreate.mockRejectedValue(new Error(message));
    const response = await GET(request());
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("does not expose database details on failure", async () => {
    mocks.query.mockRejectedValue(new Error("internal db connection details"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "订单查询失败" });
  });
});
