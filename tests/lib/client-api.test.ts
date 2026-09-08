import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("../../lib/browser-storage", () => ({ safeStorageGet: (_: string, key: string) => storage.get(key) || "" }));
let api: typeof import("../../lib/client-api").apiFetchJson;
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); fetchMock.mockReset(); storage.clear();
  vi.stubGlobal("window", {}); vi.stubGlobal("navigator", { onLine: true, language: "en" });
  vi.stubGlobal("fetch", fetchMock);
  api = (await import("../../lib/client-api")).apiFetchJson;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("shared request performance and safety", () => {
  it.each([400, 401, 403, 409])("does not retry HTTP %i", async (status) => {
    fetchMock.mockResolvedValue(json({ error: "invalid" }, status));
    await expect(api("/api/test")).rejects.toThrow("invalid");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("retries a transient failure once and retains the request identity", async () => {
    storage.set("rdv_token", "original");
    fetchMock.mockImplementationOnce(() => {
      storage.set("rdv_token", "other-account");
      return Promise.resolve(json({}, 503));
    }).mockResolvedValueOnce(json({ ok: true }));
    const result = api("/api/test", { retries: 1 });
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchMock.mock.calls) expect(options.headers.get("Authorization")).toBe("Bearer original");
  });
  it("does not send a request with an already cancelled signal", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(api("/api/test", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("cancels backoff instead of retrying an obsolete request", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValue(json({}, 503));
    const result = expect(api("/api/test", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1); controller.abort();
    await result; await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed success without replaying a write", async () => {
    fetchMock.mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(api("/api/test", { method: "POST", body: { value: 1 } })).rejects.toThrow("Invalid server response");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("shares simultaneous GET work and bounds cached responses", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ ok: true })));
    await Promise.all([api("/api/test"), api("/api/test")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 65; i++) await api(`/api/test/${i}`, { cacheTtlMs: 60_000 });
    await api("/api/test/64", { cacheTtlMs: 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(66);
    await api("/api/test/0", { cacheTtlMs: 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(67);
  });
  it("a pre-write GET cannot repopulate the cache or serve a post-write reader", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(json({ ok: true })).mockResolvedValueOnce(json({ value: "new" }));
    const old = api("/api/test", { cacheTtlMs: 60_000 });
    await api("/api/write", { method: "POST", body: {} });
    await expect(api("/api/test", { cacheTtlMs: 60_000 })).resolves.toEqual({ value: "new" });
    finish(json({ value: "old" })); await old;
    await expect(api("/api/test", { cacheTtlMs: 60_000 })).resolves.toEqual({ value: "new" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
