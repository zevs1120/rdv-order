import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:https", () => ({ request: mocks.request }));
import { Xpyun, PrintError } from "../../lib/printing/xpyun";
const calls: Array<{ url: URL; options: any; body: any }> = [];
let replies: unknown[];
beforeEach(() => {
  vi.clearAllMocks(); calls.length = 0; replies = [{ code: 0, data: "remote-1" }];
  vi.stubEnv("XPYUN_USER", "fixture"); vi.stubEnv("XPYUN_USER_KEY", "fixture-key"); vi.stubEnv("XPYUN_SN", "fixture-sn");
  vi.stubEnv("XPYUN_API_URL", "https://open.xpyun.net/api/openapi/xprinter/print");
  mocks.request.mockImplementation((url, options, callback) => {
    const req = new EventEmitter() as any;
    req.destroy = (error: Error) => { req.emit("error", error); req.emit("close"); };
    req.end = (body: string) => {
      calls.push({ url, options, body: JSON.parse(body) });
      queueMicrotask(() => {
        const reply = replies.shift();
        if (reply instanceof Error) return req.destroy(reply);
        const res = new EventEmitter() as any; res.statusCode = 200; res.setEncoding = () => {};
        callback(res); res.emit("data", JSON.stringify(reply)); res.emit("end"); req.emit("close");
      });
    };
    return req;
  });
});
afterEach(() => vi.unstubAllEnvs());
it("uses the official direct JSON protocol on Vercel too", async () => {
  vi.stubEnv("VERCEL", "1");
  expect(await Xpyun.configured().print("<CB>KITCHEN<BR></CB>", "same-key")).toBe("remote-1");
  expect(calls).toHaveLength(1);
  const { url, options, body } = calls[0];
  expect(url.href).toBe("https://open.xpyun.net/api/openapi/xprinter/print");
  expect(options.headers["Content-Type"]).toBe("application/json;charset=UTF-8");
  expect(body).toEqual({ user: "fixture", timestamp: expect.stringMatching(/^\d{10}$/),
    sign: createHash("sha1").update("fixturefixture-key" + body.timestamp).digest("hex"),
    sn: "fixture-sn", content: "<CB>KITCHEN<BR></CB>", copies: 1, voice: 2, mode: 0, idempotent: "same-key" });
});
it("retries only explicit official 1004 once with the identical intent", async () => {
  replies = [{ code: 1004 }, { code: 1004 }];
  await expect(Xpyun.configured().print("TEST", "one")).rejects.toMatchObject({ definite: true, code: 1004 });
  expect(calls).toHaveLength(2); expect(calls[0].body.idempotent).toBe(calls[1].body.idempotent);
});
it("never resends a lost response", async () => {
  replies = [new Error("ECONNRESET")];
  await expect(Xpyun.configured().print("TEST", "one")).rejects.toMatchObject({ definite: false });
  expect(calls).toHaveLength(1);
});
it("does not call an empty success or duplicate acknowledgement printed", async () => {
  for (const code of [0, 1013]) {
    replies = [{ code, data: null }];
    await expect(Xpyun.configured().print("TEST", "one")).rejects.toMatchObject({ definite: false });
  }
});
it("rejects oversized content intact before opening a connection", async () => {
  await expect(Xpyun.configured().print("菜".repeat(7000), "one")).rejects.toBeInstanceOf(PrintError);
  expect(calls).toHaveLength(0);
});
it("queries status and completion without calling print", async () => {
  replies = [{ code: 0, data: 1 }, { code: 0, data: true }];
  expect(await Xpyun.configured().printerStatus()).toBe("online");
  expect(await Xpyun.configured().completed("remote-1")).toBe(true);
  expect(calls.map(c => c.url.pathname)).toEqual(["/api/openapi/xprinter/queryPrinterStatus", "/api/openapi/xprinter/queryOrderState"]);
});
