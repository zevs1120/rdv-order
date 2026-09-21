import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ audit: vi.fn() }));
vi.mock("../../lib/audit", () => ({ writePrintAuditLogSafe: mocks.audit }));
import { recordPrintConfirmation } from "../../lib/print-confirmation";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock);
  for (const [key, value] of Object.entries({ XPYUN_USER: "fixture", XPYUN_USER_KEY: "fixture", XPYUN_SN: "fixture", XPYUN_API_URL: "https://fixture.invalid/api/openapi/xprinter/print" })) vi.stubEnv(key, value);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("official order confirmation without resubmission", () => {
  it("records completion only after the specific order returns true", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: false })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: true })));
    const pending = recordPrintConfirmation({ provider: "xpyun", remoteJobId: "OM-fixture" }, "order", "business-id");
    await vi.advanceTimersByTimeAsync(5000); await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(url).toBe("https://fixture.invalid/api/openapi/xprinter/queryOrderState");
      expect(JSON.parse(options.body)).toMatchObject({ orderId: "OM-fixture" });
      expect(JSON.parse(options.body)).not.toHaveProperty("content");
    }
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ state: "completed", physicalPaperVerified: false }) }));
  });
  it("keeps a pending order pending after bounded queries and never resends", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ code: 0, data: false }))));
    const pending = recordPrintConfirmation({ provider: "xpyun", remoteJobId: "OM-fixture" }, "order", "id");
    await vi.advanceTimersByTimeAsync(10000); await pending;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ state: "pending" }) }));
  });
  it("does not turn failed confirmation into failed printing", async () => {
    fetchMock.mockRejectedValue(new TypeError("network"));
    await recordPrintConfirmation({ provider: "xpyun", remoteJobId: "OM-fixture" }, "table", "01");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ state: "unknown" }) }));
  });
  it("does not invent an order ID or completion for a deduplicated acknowledgement", async () => {
    await recordPrintConfirmation({ provider: "xpyun" }, "table", "01");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ remoteJobId: null, state: "unknown" }) }));
  });
});
