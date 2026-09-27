import { jwtVerify } from "jose";

export const runtime = "edge";
export const preferredRegion = "hkg1";
export const dynamic = "force-dynamic";

const ROOT = "https://open.xpyun.net/api/openapi/xprinter/";
const MAX_BODY_BYTES = 32 * 1024;
const MAX_REPLY_BYTES = 64 * 1024;

type Operation =
  | { method: "print"; sn: string; content: string; key: string; expireAt: number }
  | { method: "queryPrinterStatus"; sn: string }
  | { method: "queryOrderState"; sn: string; orderId: string };

async function readLimited(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<string | null> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(joined);
}

function notSent() {
  return Response.json({ kind: "not_sent" }, { headers: { "Cache-Control": "no-store" } });
}

function parseOperation(value: unknown, configuredSn: string): Operation | null {
  if (!value || typeof value !== "object" || !("method" in value) || !("sn" in value) || value.sn !== configuredSn) return null;
  if (value.method === "queryPrinterStatus") return { method: value.method, sn: configuredSn };
  if (value.method === "queryOrderState" && "orderId" in value && typeof value.orderId === "string"
    && /^[A-Za-z0-9_-]{1,100}$/.test(value.orderId)) {
    return { method: value.method, sn: configuredSn, orderId: value.orderId };
  }
  if (value.method === "print" && "content" in value && typeof value.content === "string"
    && value.content.trim() && new TextEncoder().encode(value.content).byteLength <= 24 * 1024
    && "key" in value && typeof value.key === "string" && /^[A-Za-z0-9_-]{1,50}$/.test(value.key)
    && "expireAt" in value && typeof value.expireAt === "number" && Number.isFinite(value.expireAt)
    && value.expireAt > Date.now() + 1000 && value.expireAt <= Date.now() + 121_000) {
    return { method: value.method, sn: configuredSn, content: value.content, key: value.key, expireAt: value.expireAt };
  }
  return null;
}

export async function POST(request: Request) {
  const secret = process.env.JWT_SECRET;
  const authorization = request.headers.get("authorization") || "";
  const token = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(authorization)?.[1];
  if (!secret || !token) return new Response(null, { status: 401 });

  let bodyHash: string;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"], issuer: "rdv-print-internal", audience: "rdv-xpyun-gateway"
    });
    if (typeof payload.exp !== "number" || payload.exp > Date.now() / 1000 + 30
      || typeof payload.bodyHash !== "string" || !/^[a-f0-9]{64}$/.test(payload.bodyHash)) throw new Error("invalid claims");
    bodyHash = payload.bodyHash;
  } catch {
    return new Response(null, { status: 401 });
  }

  const bodyText = await readLimited(request.body, MAX_BODY_BYTES);
  if (bodyText === null) return new Response(null, { status: 413 });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bodyText));
  const actualHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (actualHash !== bodyHash) return new Response(null, { status: 401 });

  const user = (process.env.XPYUN_USER || ((process.env.XPYUN_USERKEY || process.env.USERKEY) ? process.env.USER : "") || "").trim();
  const key = (process.env.XPYUN_USER_KEY || process.env.XPYUN_USERKEY || process.env.USERKEY || "").trim();
  const sn = (process.env.XPYUN_SN || process.env.SN || "").trim();
  if (!user || !key || !sn) return notSent();

  let parsed: unknown;
  try { parsed = JSON.parse(bodyText); }
  catch { return notSent(); }
  const operation = parseOperation(parsed, sn);
  if (!operation) return notSent();

  const startedAt = Date.now();
  const timestamp = String(Math.floor(startedAt / 1000));
  const source = new TextEncoder().encode(user + key + timestamp);
  const signature = await crypto.subtle.digest("SHA-1", source);
  const sign = Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
  const providerBody: Record<string, string | number> = { user, timestamp, sign };
  if (operation.method === "print") {
    const expiresIn = Math.min(120, Math.floor((operation.expireAt - Date.now()) / 1000));
    if (expiresIn < 1) return notSent();
    Object.assign(providerBody, { sn, content: operation.content, copies: 1, mode: 1, expiresIn, idempotent: operation.key });
  } else if (operation.method === "queryPrinterStatus") {
    providerBody.sn = sn;
  } else {
    providerBody.orderId = operation.orderId;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), operation.method === "print" ? 10_000 : 4_000);
  try {
    const response = await fetch(ROOT + operation.method, {
      method: "POST", headers: { "Content-Type": "application/json;charset=UTF-8" },
      body: JSON.stringify(providerBody), redirect: "manual", signal: controller.signal
    });
    if (!response.ok) return new Response(null, { status: 502 });
    const text = await readLimited(response.body, MAX_REPLY_BYTES);
    if (text === null) return new Response(null, { status: 502 });
    const result: unknown = JSON.parse(text);
    if (!result || typeof result !== "object" || !("code" in result)
      || typeof result.code !== "number" || !Number.isInteger(result.code)) return new Response(null, { status: 502 });
    let data: unknown;
    if (result.code === 0 && "data" in result) {
      if (operation.method === "print" && typeof result.data === "string" && result.data.length <= 100) data = result.data;
      if (operation.method === "queryPrinterStatus" && typeof result.data === "number") data = result.data;
      if (operation.method === "queryOrderState" && typeof result.data === "boolean") data = result.data;
    }
    return Response.json({ kind: "provider", code: result.code, ...(data !== undefined && { data }), latencyMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response(null, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
