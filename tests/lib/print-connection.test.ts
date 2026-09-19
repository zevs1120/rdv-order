import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../lib/db", () => ({ printMetadataPool: { query: mocks.query }, pool: { query: mocks.query } }));
import { dispatchPrintSelfTest, queryPrimaryPrinterStatus } from "../../lib/print";
const fetchMock = vi.fn();
const response = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
describe("cloud print connection recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); mocks.query.mockResolvedValue({ rows: [] });
    vi.stubGlobal("fetch", fetchMock);
    for (const [key, value] of Object.entries({ PRINT_PROVIDER: "xpyun", XPYUN_USER: "fixture", XPYUN_USER_KEY: "fixture-key", XPYUN_SN: "fixture-sn", XPYUN_API_URL: "https://fixture.invalid/api/openapi/xprinter/print", PRINT_TIMEOUT_MS: "3000", PRINT_FALLBACK_PROVIDER: "" })) vi.stubEnv(key, value);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("accepts a 4-second cloud response without aborting at the legacy 3-second timeout", async () => {
    fetchMock.mockImplementationOnce((_url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")));
      setTimeout(() => resolve(response({ code: 0, data: "cloud-1" })), 4000);
    }));
    const pending = dispatchPrintSelfTest(); await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toMatchObject({ remoteJobId: "cloud-1" }); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("retries a lost response with identical content and provider deduplication key", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("socket closed")).mockResolvedValueOnce(response({ code: 0, data: "cloud-2" }));
    expect(await dispatchPrintSelfTest()).toMatchObject({ remoteJobId: "cloud-2" });
    const bodies = fetchMock.mock.calls.map(call => JSON.parse(call[1].body));
    expect(bodies[0].idempotent).toBeTruthy(); expect(bodies[1]).toEqual(bodies[0]);
  });
  it("accepts a deduplicated cloud acknowledgement without sending a third copy", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("lost response")).mockResolvedValueOnce(response({ code: 1013, msg: "ORDER_IDEMPOTENT" }));
    expect(await dispatchPrintSelfTest()).toMatchObject({ provider: "xpyun" }); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("stops after two unknown outcomes, disallows later blind retries and does not use fallback", async () => {
    vi.stubEnv("PRINT_FALLBACK_PROVIDER", "cloud"); fetchMock.mockRejectedValue(new TypeError("socket closed"));
    await expect(dispatchPrintSelfTest()).rejects.toMatchObject({ retryable: false, outcome: "unknown" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[mocks.query.mock.calls.length - 1]?.[1]?.[4]).toBe("degraded");
  });
  it("reports a confirmed offline printer without a blind transport retry", async () => {
    fetchMock.mockResolvedValue(response({ code: 1003, msg: "PRINTER_OFFLINE" }));
    await expect(dispatchPrintSelfTest()).rejects.toMatchObject({ outcome: "offline" });
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(mocks.query.mock.calls[mocks.query.mock.calls.length - 1]?.[1]?.[4]).toBe("offline");
  });
  it("does not retry invalid credentials", async () => {
    fetchMock.mockResolvedValue(response({ code: -3, msg: "REQUEST_SIGN_FAILED" }));
    await expect(dispatchPrintSelfTest()).rejects.toMatchObject({ retryable: false }); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("reads live status without sending content or changing database status", async () => {
    fetchMock.mockResolvedValue(response({ code: 0, data: 0 }));
    expect(await queryPrimaryPrinterStatus()).toMatchObject({ status: "offline" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://fixture.invalid/api/openapi/xprinter/queryPrinterStatus");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("content"); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("does not treat unavailable status query as offline", async () => {
    fetchMock.mockRejectedValue(new TypeError("network"));
    expect(await queryPrimaryPrinterStatus()).toMatchObject({ status: "unknown" }); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
