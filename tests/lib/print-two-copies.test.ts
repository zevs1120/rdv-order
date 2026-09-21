import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), metadata: vi.fn() }));
vi.mock("../../lib/db", () => ({ pool: { query: mocks.query }, printMetadataPool: { query: mocks.metadata } }));
import { dispatchPrintJob } from "../../lib/print";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock);
  for (const [key, value] of Object.entries({ PRINT_PROVIDER: "xpyun", PRINT_FALLBACK_PROVIDER: "", XPYUN_USER: "fixture", XPYUN_USER_KEY: "fixture", XPYUN_SN: "fixture", XPYUN_API_URL: "https://fixture.invalid/api/openapi/xprinter/print" })) vi.stubEnv(key, value);
  mocks.query.mockResolvedValue({ rows: [{ order_id: "fixture-order", table_no: "06", created_at: "2026-09-21T06:00:00Z", waiter_name: "Waiter", dish_name: "Rice Platter", unit_price: 150, qty: 2, category: "Lunch", note: "no salt" }] });
  mocks.metadata.mockResolvedValue({ rows: [] });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("submits kitchen then priced front-desk copy in one cloud job, once", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 0, data: "OM-pair" })));
  expect(await dispatchPrintJob("fixture-order")).toMatchObject({ remoteJobId: "OM-pair" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.idempotent).toBe("fixture-order"); expect(body.copies).toBe(1);
  const [kitchen, guest] = body.content.split("<CB>RDV GUEST COPY<BR></CB>");
  expect(kitchen).toContain("RDV KITCHEN COPY"); expect(kitchen).toContain("RICE PLATTER"); expect(kitchen).toContain("QTY: 2");
  expect(kitchen).not.toContain("150"); expect(guest).toContain("2 x 150"); expect(guest).toContain("TOTAL     : PHP 300");
  expect(guest).toContain("ROOM NO:"); expect(guest).toContain("PRINT FULL NAME:"); expect(guest).toContain("PAYMENT METHOD:");
});
it("retries the whole same-key pair after a lost acknowledgement without a second kitchen-only request", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("lost response")).mockResolvedValueOnce(new Response(JSON.stringify({ code: 1013 })));
  expect(await dispatchPrintJob("fixture-order")).toMatchObject({ provider: "xpyun", remoteJobId: undefined });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const bodies = fetchMock.mock.calls.map(call => JSON.parse(call[1].body));
  expect(bodies[1].content).toBe(bodies[0].content); expect(bodies[1].idempotent).toBe(bodies[0].idempotent);
  expect(bodies[1].content.match(/RDV KITCHEN COPY/g)).toHaveLength(1); expect(bodies[1].content.match(/RDV GUEST COPY/g)).toHaveLength(1);
});
