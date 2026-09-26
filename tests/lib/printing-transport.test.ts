import { EventEmitter } from "node:events";
import { request as httpsRequest } from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XpyunTransport } from "../../lib/printing/transport";

vi.mock("node:https", () => ({ request: vi.fn() }));

type FakeRequest = EventEmitter & { end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
const requestMock = httpsRequest as unknown as ReturnType<typeof vi.fn>;

function replyWith(body: string, statusCode = 200) {
  const requests: FakeRequest[] = [];
  const payloads: string[] = [];
  requestMock.mockImplementation((_url: URL, _options: object, callback: (response: EventEmitter & { statusCode: number; destroy: () => void }) => void) => {
    const request = new EventEmitter() as FakeRequest;
    request.destroy = vi.fn(() => request);
    request.end = vi.fn((payload: Buffer) => {
      payloads.push(payload.toString("utf8"));
      queueMicrotask(() => {
        const response = Object.assign(new EventEmitter(), { statusCode, destroy: vi.fn() });
        callback(response);
        response.emit("data", Buffer.from(body));
        response.emit("end");
      });
    });
    requests.push(request);
    return request;
  });
  return { requests, payloads };
}

describe("new XPYUN transport", () => {
  beforeEach(() => {
    vi.stubEnv("XPYUN_USER", "fixture");
    vi.stubEnv("XPYUN_USER_KEY", "fixture-key");
    vi.stubEnv("XPYUN_SN", "fixture-device");
    requestMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("sends the same signed protocol in one fresh TLS request per call", async () => {
    const { requests, payloads } = replyWith(JSON.stringify({ code: 0, data: "fixture-remote" }));
    const transport = XpyunTransport.fromEnvironment();
    expect(await transport.send("KITCHEN<BR>GUEST<BR>", "fixture-key", 90)).toEqual({ kind: "accepted", remoteId: "fixture-remote" });
    expect(await transport.send("next ticket", "next-key", 90)).toEqual({ kind: "accepted", remoteId: "fixture-remote" });
    expect(requests).toHaveLength(2);
    expect(requests[0]).not.toBe(requests[1]);
    for (const [url, options] of requestMock.mock.calls) {
      expect(url.toString()).toBe("https://open.xpyun.net/api/openapi/xprinter/print");
      expect(options).toMatchObject({ method: "POST", agent: false, headers: { "Content-Type": "application/json;charset=UTF-8" } });
    }
    const body = JSON.parse(payloads[0]);
    expect(body).toMatchObject({ mode: 1, expiresIn: 90, copies: 1, idempotent: "fixture-key", sn: "fixture-device", content: "KITCHEN<BR>GUEST<BR>" });
    expect(body.sign).toMatch(/^[a-f0-9]{40}$/);
  });

  it("destroys the request at the full deadline and keeps its result unknown", async () => {
    vi.useFakeTimers();
    const request = new EventEmitter() as FakeRequest;
    request.end = vi.fn();
    request.destroy = vi.fn(() => { request.emit("error", Object.assign(new Error("closed"), { code: "ECONNRESET" })); return request; });
    requestMock.mockReturnValue(request);
    const pending = XpyunTransport.fromEnvironment().send("ticket", "fixture-key", 120);
    const assertion = expect(pending).rejects.toMatchObject({ kind: "unknown", diagnostic: { reason: "timeout", phase: "dns", durationMs: 10_000 } });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(request.destroy).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("keeps socket failures unknown with only safe structured diagnostics", async () => {
    const request = new EventEmitter() as FakeRequest;
    request.end = vi.fn(() => queueMicrotask(() => request.emit("error", Object.assign(new Error("private network detail"), { code: "ECONNRESET" }))));
    request.destroy = vi.fn();
    requestMock.mockReturnValue(request);
    await expect(XpyunTransport.fromEnvironment().send("secret ticket", "fixture-key", 120)).rejects.toMatchObject({
      kind: "unknown", diagnostic: { reason: "socket", socketCode: "ECONNRESET" }
    });
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logged).not.toMatch(/secret ticket|fixture-device|fixture-key|private network detail/);
  });

  it("preserves provider deduplication and rejects malformed responses as unknown", async () => {
    replyWith(JSON.stringify({ code: 1013, data: null }));
    expect(await XpyunTransport.fromEnvironment().send("ticket", "fixture-key", 120)).toEqual({ kind: "duplicate" });
    replyWith("not JSON");
    await expect(XpyunTransport.fromEnvironment().send("ticket", "fixture-key", 120)).rejects.toMatchObject({
      kind: "unknown", diagnostic: { reason: "invalid_json", phase: "parse" }
    });
  });
});
