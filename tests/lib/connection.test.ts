import { afterEach, beforeEach, expect, it, vi } from "vitest";

let connection: typeof import("../../lib/connection");
let stop: () => void;
let doc: EventTarget & { visibilityState: string };
const fetchMock = vi.fn();
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); fetchMock.mockReset();
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("document", doc); vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("fetch", fetchMock);
  connection = await import("../../lib/connection");
  stop = connection.startConnectionMonitoring();
});
afterEach(() => { stop(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const ok = () => new Response(JSON.stringify({ service: "rdv-order" }));

it("confirms failure twice, coalesces retry, then dismisses and refreshes reads once", async () => {
  const refresh = vi.fn(); window.addEventListener(connection.CONNECTION_REFRESH_EVENT, refresh);
  fetchMock.mockRejectedValue(new TypeError("offline"));
  await vi.advanceTimersByTimeAsync(350);
  expect(connection.connectionSnapshot().disconnected).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);
  expect(connection.connectionSnapshot().disconnected).toBe(true);
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  const retry = connection.retryConnection(); void connection.retryConnection();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  finish(ok()); await retry; await vi.advanceTimersByTimeAsync(0);
  expect(connection.connectionSnapshot().disconnected).toBe(false);
  expect(refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls.every(([url]) => url === "/api/connectivity")).toBe(true);
});

it("ignores a superseded failure and a background cancellation, resumes on foreground", async () => {
  fetchMock.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  await vi.advanceTimersByTimeAsync(350);
  connection.connectionResponded(connection.beginConnectionRequest());
  doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(40_000);
  expect(connection.connectionSnapshot().disconnected).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockResolvedValue(ok());
  doc.visibilityState = "visible"; doc.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(350);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("rejects captive portal content and ignores old failures after a newer response", async () => {
  fetchMock.mockResolvedValue(new Response("<html>sign in</html>"));
  await vi.advanceTimersByTimeAsync(350);
  await vi.advanceTimersByTimeAsync(1000);
  expect(connection.connectionSnapshot().disconnected).toBe(true);
  const old = connection.beginConnectionRequest();
  connection.connectionResponded(connection.beginConnectionRequest());
  connection.connectionFailed(old);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(connection.connectionSnapshot().disconnected).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
