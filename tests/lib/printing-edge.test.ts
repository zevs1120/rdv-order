import { createHash } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/print/provider/route";
import { XpyunTransport } from "../../lib/printing/transport";

vi.mock("node:https", () => ({ request: vi.fn(() => { throw new Error("Unexpected direct connection"); }) }));
const gateway = "https://order.resortdejavu.cn/api/print/provider";
const secret = "fixture-gateway-secret-for-isolated-tests";

async function signedRequest(body: string, hashBody = body) {
  const token = await new SignJWT({ bodyHash: createHash("sha256").update(hashBody).digest("hex") })
    .setProtectedHeader({ alg: "HS256" }).setIssuer("rdv-print-internal").setAudience("rdv-xpyun-gateway")
    .setIssuedAt().setExpirationTime("20s").sign(new TextEncoder().encode(secret));
  return new Request(gateway, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body });
}

describe("production Edge print path", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("JWT_SECRET", secret);
    vi.stubEnv("XPYUN_USER", "fixture-user");
    vi.stubEnv("XPYUN_USER_KEY", "fixture-provider-key");
    vi.stubEnv("XPYUN_SN", "fixture-sn");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.mocked(httpsRequest).mockClear();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("binds the ticket to internal authorization and keeps the original key and deadline through both hops", async () => {
    const providerCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === gateway) {
        expect(init?.redirect).toBe("manual");
        expect(new Headers(init?.headers).get("authorization")?.length).toBeLessThan(1000);
        return POST(new Request(url, init));
      }
      expect(init?.redirect).toBe("manual");
      expect(init?.cache).toBeUndefined();
      providerCalls.push({ url, body: JSON.parse(String(init?.body)) });
      return Response.json({ code: 0, data: "remote-fixture" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const expiresAt = Date.now() + 73_500;
    expect(await XpyunTransport.fromEnvironment().send("KITCHEN<BR>GUEST PHP100<BR>", "original-key", 120, expiresAt))
      .toEqual({ kind: "accepted", remoteId: "remote-fixture" });
    expect(providerCalls).toHaveLength(1);
    expect(providerCalls[0].url).toBe("https://open.xpyun.net/api/openapi/xprinter/print");
    expect(providerCalls[0].body).toMatchObject({ copies: 1, mode: 1, sn: "fixture-sn", idempotent: "original-key",
      content: "KITCHEN<BR>GUEST PHP100<BR>", expiresIn: 73 });
    expect(providerCalls[0].body.sign).toMatch(/^[a-f0-9]{40}$/);
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it("rejects missing, ordinary app, and tampered authorization without contacting XPYUN", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify({ method: "queryPrinterStatus", sn: "fixture-sn" });
    expect((await POST(new Request(gateway, { method: "POST", body }))).status).toBe(401);
    const appToken = await new SignJWT({ role: "manager" }).setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("20s").sign(new TextEncoder().encode(secret));
    expect((await POST(new Request(gateway, { method: "POST", body, headers: { Authorization: `Bearer ${appToken}` } }))).status).toBe(401);
    expect((await POST(await signedRequest(body, body + " "))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send expired tickets, other devices, or arbitrary provider methods", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    for (const value of [
      { method: "print", sn: "fixture-sn", content: "ticket", key: "same-key", expireAt: Date.now() - 1 },
      { method: "queryPrinterStatus", sn: "another-sn" },
      { method: "deletePrinter", sn: "fixture-sn" }
    ]) {
      expect(await (await POST(await signedRequest(JSON.stringify(value)))).json()).toEqual({ kind: "not_sent" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps response loss on either hop unknown and never falls back to a second sender", async () => {
    for (const failAtProvider of [false, true]) {
      vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input) === gateway && failAtProvider) return POST(new Request(gateway, init));
        throw new TypeError("fixture response lost");
      }));
      await expect(XpyunTransport.fromEnvironment().send("ticket", "original-key", 120))
        .rejects.toMatchObject({ kind: "unknown", diagnostic: { requestStarted: true } });
    }
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it("uses the same gateway for printer and existing remote-order queries", async () => {
    const methods: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === gateway) return POST(new Request(url, init));
      methods.push(url.split("/").pop()!);
      return Response.json({ code: 0, data: url.endsWith("queryOrderState") ? true : 1 });
    }));
    const transport = XpyunTransport.fromEnvironment();
    expect(await transport.printerStatus()).toBe("online");
    expect(await transport.orderState("remote-fixture")).toBe("completed");
    expect(methods).toEqual(["queryPrinterStatus", "queryOrderState"]);
    expect(httpsRequest).not.toHaveBeenCalled();
  });
});
