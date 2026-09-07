import { describe, expect, it, vi } from "vitest";
import { DispatchError, dispatchOnce, readConfig, runDispatcher } from "../scripts/print-dispatcher.mjs";

const config = readConfig({ PRINT_DISPATCH_ORIGIN: "https://fixture.invalid", PRINT_WORKER_KEY: "test-only" });
const empty = { picked: 0, printed: 0, failed: 0 };

describe("cloud print dispatcher (isolated, no printer calls)", () => {
  it("rejects missing credentials and unsafe/non-root URLs", () => {
    for (const url of ["http://example.com", "https://user:pass@example.com", "https://example.com/order", "https://example.com?token=a", "ftp://localhost", "invalid"]) {
      expect(() => readConfig({ PRINT_DISPATCH_ORIGIN: url, PRINT_WORKER_KEY: "test" })).toThrow();
    }
    expect(() => readConfig({ PRINT_DISPATCH_ORIGIN: "https://example.com" })).toThrow("PRINT_WORKER_KEY");
    expect(readConfig({ PRINT_DISPATCH_ORIGIN: "http://127.0.0.1:3000", PRINT_WORKER_KEY: "test" }).endpoint).toBe("http://127.0.0.1:3000/api/print/dispatch");
  });
  it("authenticates the existing endpoint, disables redirects and processes one job", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ picked: 1, printed: 1, failed: 0 }));
    expect(await dispatchOnce(config, fetcher)).toEqual({ picked: 1, printed: 1, failed: 0 });
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://fixture.invalid/api/print/dispatch");
    expect(request).toMatchObject({ method: "POST", redirect: "error", body: '{"limit":1}', headers: { "x-print-worker-key": "test-only" } });
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([401, 403, 404])("stops on HTTP %i instead of retrying configuration failures", async status => {
    await expect(dispatchOnce(config, async () => new Response("secret detail", { status }))).rejects.toMatchObject({ fatal: true, message: `dispatch HTTP ${status}` });
  });
  it("treats server and malformed outcomes as unknown without logging response details", async () => {
    await expect(dispatchOnce(config, async () => new Response("secret detail", { status: 500 }))).rejects.toMatchObject({ fatal: false, message: "dispatch HTTP 500" });
    for (const result of [null, {}, { picked: 1, printed: 0, failed: 0 }, { picked: 2, printed: 2, failed: 0 }]) {
      await expect(dispatchOnce(config, async () => Response.json(result))).rejects.toThrow("invalid dispatch response");
    }
    await expect(dispatchOnce(config, async () => { throw new Error("test-only secret URL"); })).rejects.toThrow("dispatch transport/response error; outcome may be unknown");
  });
  it("waits for the in-flight call before polling and drains it on shutdown", async () => {
    const controller = new AbortController();
    let release;
    const dispatch = vi.fn(() => new Promise(resolve => { release = resolve; }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const run = runDispatcher(config, { signal: controller.signal, dispatch, sleep, log: vi.fn() });
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    expect(sleep.mock.calls.map(c => c[0])).toEqual([60_000]);
    controller.abort();
    release(empty);
    await run;
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it("backs off uncertain failures then resumes, without leaking exception contents", async () => {
    const controller = new AbortController();
    const dispatch = vi.fn().mockRejectedValueOnce(new Error("secret"))
      .mockImplementationOnce(async () => { controller.abort(); return { picked: 1, printed: 0, failed: 1 }; });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const log = vi.fn();
    await runDispatcher(config, { signal: controller.signal, dispatch, sleep, log });
    expect(sleep.mock.calls.map(c => c[0])).toEqual([60_000, 60_000]);
    expect(log.mock.calls.flat().join(" ")).not.toContain("secret");
    expect(log).toHaveBeenCalledWith("print dispatcher picked=1 printed=0 failed=1");
  });
  it("exits on fatal errors and can stop during startup without dispatching", async () => {
    const dispatch = vi.fn().mockRejectedValue(new DispatchError("dispatch HTTP 403", true));
    await expect(runDispatcher(config, { dispatch, sleep: vi.fn(), log: vi.fn() })).rejects.toMatchObject({ fatal: true });
    expect(dispatch).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    controller.abort();
    dispatch.mockClear();
    await runDispatcher(config, { signal: controller.signal, dispatch, log: vi.fn() });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
