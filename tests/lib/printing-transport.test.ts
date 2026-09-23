import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XpyunTransport } from "../../lib/printing/transport";

describe("new XPYUN transport", () => {
  beforeEach(() => { vi.stubEnv("XPYUN_USER", "fixture"); vi.stubEnv("XPYUN_USER_KEY", "fixture-key"); vi.stubEnv("XPYUN_SN", "fixture-device"); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("submits both copies once without an online preflight, with bounded cloud buffering", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: "fixture-remote" })));
    vi.stubGlobal("fetch", fetch);
    expect(await XpyunTransport.fromEnvironment().send("KITCHEN<BR>GUEST<BR>", "fixture-key", 90)).toEqual({ kind: "accepted", remoteId: "fixture-remote" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ mode: 1, expiresIn: 90, copies: 1, idempotent: "fixture-key", sn: "fixture-device" });
  });
  it("leaves transport recovery to the durable task and preserves a lost response as unknown", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("connection lost")); vi.stubGlobal("fetch", fetch);
    await expect(XpyunTransport.fromEnvironment().send("ticket", "fixture-key", 120)).rejects.toMatchObject({ kind: "unknown" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not turn a dedup response into a made-up remote order", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 1013, data: null }))));
    expect(await XpyunTransport.fromEnvironment().send("ticket", "fixture-key", 120)).toEqual({ kind: "duplicate" });
  });
});
