import { jwtVerify } from "jose";

export const runtime = "edge";
export const preferredRegion = "hkg1";
export const dynamic = "force-dynamic";

const STATUS_URL = "https://open.xpyun.net/api/openapi/xprinter/queryPrinterStatus";
const TIMEOUT_MS = 6000;

function reply(status: "online" | "offline" | "degraded" | "unknown", latencyMs: number, providerCode: number | null) {
  return Response.json(
    { region: process.env.VERCEL_REGION || "local", latencyMs, status, providerCode },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const secret = process.env.JWT_SECRET;
  const authorization = request.headers.get("authorization") || "";
  const token = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(authorization)?.[1];
  if (!secret || !token) return new Response(null, { status: 401 });

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"], issuer: "rdv-maintenance", audience: "rdv-print-probe"
    });
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) throw new Error("missing expiry");
  } catch {
    return new Response(null, { status: 401 });
  }

  const user = (process.env.XPYUN_USER || ((process.env.XPYUN_USERKEY || process.env.USERKEY) ? process.env.USER : "") || "").trim();
  const key = (process.env.XPYUN_USER_KEY || process.env.XPYUN_USERKEY || process.env.USERKEY || "").trim();
  const sn = (process.env.XPYUN_SN || process.env.SN || "").trim();
  if (!user || !key || !sn) return reply("unknown", 0, null);

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const timestamp = String(Math.floor(startedAt / 1000));
    const source = new TextEncoder().encode(user + key + timestamp);
    const digest = await crypto.subtle.digest("SHA-1", source);
    const sign = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const response = await fetch(STATUS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json;charset=UTF-8" },
      body: JSON.stringify({ user, timestamp, sign, sn }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal
    });
    if (!response.ok) return reply("unknown", Date.now() - startedAt, null);
    const text = await response.text();
    if (text.length > 8192) return reply("unknown", Date.now() - startedAt, null);
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== "object" || !("code" in data) || typeof data.code !== "number") {
      return reply("unknown", Date.now() - startedAt, null);
    }
    const providerCode = Number.isInteger(data.code) ? data.code : null;
    const state = "data" in data ? data.data : undefined;
    const status = providerCode !== 0 ? "unknown" : state === 1 ? "online" : state === 0 ? "offline" : state === 2 ? "degraded" : "unknown";
    return reply(status, Date.now() - startedAt, providerCode);
  } catch {
    return reply("unknown", Date.now() - startedAt, null);
  } finally {
    clearTimeout(timeout);
  }
}
