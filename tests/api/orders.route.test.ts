import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), txQuery: vi.fn(), permission: vi.fn(), prepare: vi.fn(), start: vi.fn(), drain: vi.fn(), after: vi.fn() }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: mocks.after }));
vi.mock("../../lib/db", () => ({ pool: { connect: mocks.connect } }));
vi.mock("../../lib/permissions", () => ({ requireOrderCreate: mocks.permission, requirePermission: mocks.permission }));
vi.mock("../../lib/printing/service", () => ({ prepareOrderDelivery: mocks.prepare }));
vi.mock("../../lib/printing/start", () => ({ startPrintDelivery: mocks.start }));
vi.mock("../../lib/printing/queue", () => ({ drainDeliveryQueue: mocks.drain }));

import { POST } from "../../app/api/orders/route";
import { buildItemSignature, parseItems } from "../../lib/orders-utils";

const dishIdA = "11111111-1111-4111-8111-111111111111";
const dishIdB = "22222222-2222-4222-8222-222222222222";
const makeRequest = (key = "idem_12345678") => new Request("http://localhost/api/orders", {
  method: "POST", headers: { "Content-Type": "application/json", "x-idempotency-key": key },
  body: JSON.stringify({ tableNo: "01", items: [
    { menuItemId: dishIdA, qty: 1, note: "no onion" }, { menuItemId: dishIdB, qty: 2, note: null }
  ] })
});

describe("orders API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ userId: "actor", role: "waiter" });
    mocks.txQuery.mockImplementation((sql: string) => sql.includes("WITH input_items")
      ? { rows: [{ session_open: true, valid_items: true, order_id: "order-1", inserted: true }] }
      : { rows: [] });
    mocks.connect.mockResolvedValue({ query: mocks.txQuery, release: vi.fn() });
    mocks.prepare.mockResolvedValue({ id: "job-1" });
    mocks.start.mockResolvedValue(undefined);
    mocks.drain.mockResolvedValue({ picked: 1, accepted: 1, unknown: 0, failed: 0 });
  });

  it("merges duplicate dish lines and signs them independent of order", () => {
    expect(parseItems([{ menuItemId: dishIdA, qty: 1, note: "no onion" },
      { menuItemId: dishIdA, qty: 2, note: "no onion" }])).toMatchObject([{ qty: 3 }]);
    expect(buildItemSignature([{ menuItemId: dishIdA, qty: 1, note: "N" }, { menuItemId: dishIdB, qty: 2, note: null }]))
      .toBe(buildItemSignature([{ menuItemId: dishIdB, qty: 2, note: null }, { menuItemId: dishIdA, qty: 1, note: "n" }]));
  });

  it("creates one durable print intent for a new order", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ orderId: "order-1", deduped: false });
    expect(mocks.prepare).toHaveBeenCalledWith(expect.anything(), "order-1");
    expect(mocks.start).toHaveBeenCalledWith("job-1");
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.drain).not.toHaveBeenCalled();
  });

  it("returns an existing order without preparing or waking a second print", async () => {
    mocks.txQuery.mockImplementation((sql: string) => sql.includes("WITH input_items")
      ? { rows: [{ session_open: true, valid_items: true, order_id: "order-1", inserted: false }] }
      : { rows: [] });
    expect(await (await POST(makeRequest())).json()).toMatchObject({ orderId: "order-1", deduped: true });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("does not prepare a print when the table is closed", async () => {
    mocks.txQuery.mockImplementation((sql: string) => sql.includes("WITH input_items")
      ? { rows: [{ session_open: false, valid_items: true, order_id: null, inserted: null }] }
      : { rows: [] });
    expect((await POST(makeRequest())).status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("rejects an invalid request key before touching the database", async () => {
    expect((await POST(makeRequest("bad"))).status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("rejects unavailable dishes without a print intent", async () => {
    mocks.txQuery.mockImplementation((sql: string) => sql.includes("WITH input_items")
      ? { rows: [{ session_open: true, valid_items: false, order_id: null, inserted: null }] }
      : { rows: [] });
    expect((await POST(makeRequest())).status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("rolls back a database failure without waking printing", async () => {
    mocks.txQuery.mockImplementation((sql: string) => {
      if (sql.includes("WITH input_items")) throw new Error("database unavailable");
      return { rows: [] };
    });
    expect((await POST(makeRequest())).status).toBe(500);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("does not write or print an unauthorized order", async () => {
    mocks.permission.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await POST(makeRequest())).status).toBe(401);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
