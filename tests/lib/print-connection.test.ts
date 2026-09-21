import { createHash } from "node:crypto";
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
  it("does not report provider deduplication as device failure or send a third copy", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("lost response")).mockResolvedValueOnce(response({ code: 1013, msg: "ORDER_IDEMPOTENT" }));
    expect(await dispatchPrintSelfTest()).toMatchObject({ provider: "xpyun", remoteJobId: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[mocks.query.mock.calls.length - 1]?.[0]).not.toContain("fail_count = device_status.fail_count + 1");
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
  it("retries official ADD_ORDER_FAILED once with the same content and key", async () => {
    fetchMock.mockResolvedValueOnce(response({ code: 1004, msg: "ADD_ORDER_FAILED" }))
      .mockResolvedValueOnce(response({ code: 0, data: "recovered-order" }));
    expect(await dispatchPrintSelfTest()).toMatchObject({ remoteJobId: "recovered-order" });
    const bodies = fetchMock.mock.calls.map(call => JSON.parse(call[1].body));
    expect(bodies[1]).toEqual(bodies[0]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("bounds ADD_ORDER_FAILED retries and never schedules repeated invalid tickets", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(response({ code: 1004 })));
    await expect(dispatchPrintSelfTest()).rejects.toMatchObject({ retryable: false, outcome: "rejected" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([1001, 1002, 1006, 1007, 1014, 1022])("does not retry official permanent error %i", async code => {
    fetchMock.mockResolvedValue(response({ code }));
    await expect(dispatchPrintSelfTest()).rejects.toMatchObject({ retryable: false, outcome: "rejected" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([null, "0", undefined])("does not coerce malformed success code %s", async code => {
    fetchMock.mockResolvedValue(response({ code, data: "not-a-confirmed-order" }));
    await expect(dispatchPrintSelfTest()).rejects.toMatchObject({ retryable: false, outcome: "unknown" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([null, true, "", 123])("requires a nonempty cloud order ID instead of %s", async data => {
    fetchMock.mockResolvedValue(response({ code: 0, data }));
    await expect(dispatchPrintSelfTest()).rejects.toMatchObject({ outcome: "unknown" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([["XPYUN_MODE", "2"], ["XPYUN_VOICE", "4"], ["XPYUN_API_URL", "https://fixture.invalid/not-print"]])("validates %s before sending", async (key, value) => {
    vi.stubEnv(key, value);
    await expect(dispatchPrintSelfTest()).rejects.toMatchObject({ retryable: false, outcome: "rejected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses official UTF-8 JSON, seconds timestamp and SHA1 signature without sending the secret", async () => {
    vi.setSystemTime(new Date("2026-09-20T06:00:00Z"));
    fetchMock.mockResolvedValue(response({ code: 0, data: "signed-order" }));
    await dispatchPrintSelfTest();
    const [url, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(url).toBe("https://fixture.invalid/api/openapi/xprinter/print");
    expect(options.headers["Content-Type"]).toBe("application/json;charset=UTF-8");
    expect(options.redirect).toBe("error");
    expect(body.timestamp).toBe("1789884000");
    expect(body.sign).toBe(createHash("sha1").update("fixturefixture-key1789884000").digest("hex"));
    expect(body.sn).toBe("fixture-sn");
    expect(body.copies).toBe(1);
    expect(body).not.toHaveProperty("mode");
    expect(body).not.toHaveProperty("userKey");
    expect(body).not.toHaveProperty("debug");
    expect(options.body).not.toContain("fixture-key");
  });
  it("does not turn an earlier unknown submission into a safely retryable offline error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("lost acknowledgement"))
      .mockResolvedValueOnce(response({ code: 1003 }));
    await expect(dispatchPrintSelfTest()).rejects.toMatchObject({ retryable: false, outcome: "unknown" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("refreshes authentication on retry while preserving content and deduplication", async () => {
    vi.setSystemTime(new Date("2026-09-20T06:00:00Z"));
    fetchMock.mockImplementationOnce(() => {
      vi.setSystemTime(new Date("2026-09-20T06:00:10Z"));
      throw new TypeError("connection reset");
    }).mockResolvedValueOnce(response({ code: 0, data: "retried-order" }));
    await dispatchPrintSelfTest();
    const [first, second] = fetchMock.mock.calls.map(call => JSON.parse(call[1].body));
    expect(second.content).toBe(first.content);
    expect(second.idempotent).toBe(first.idempotent);
    expect(second.timestamp).toBe("1789884010");
    expect(second.sign).toBe(createHash("sha1").update("fixturefixture-key1789884010").digest("hex"));
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
