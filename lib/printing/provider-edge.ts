import { createHash } from "node:crypto";
import { SignJWT } from "jose";

export type EdgeOperation =
  | { method: "print"; sn: string; content: string; key: string; expireAt: number }
  | { method: "queryPrinterStatus"; sn: string }
  | { method: "queryOrderState"; sn: string; orderId: string };

export type EdgeReply =
  | { kind: "provider"; code: number; data?: unknown; latencyMs: number }
  | { kind: "not_sent"; code?: number };

export class EdgeGatewayError extends Error {
  constructor(readonly reason: "timeout" | "http" | "invalid_response" | "socket", readonly httpStatus?: number) {
    super("Print gateway unavailable");
  }
}

const GATEWAY_URL = "https://order.resortdejavu.cn/api/print/provider";

export async function callEdgeProvider(operation: EdgeOperation): Promise<EdgeReply> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new EdgeGatewayError("invalid_response");
  const body = JSON.stringify(operation);
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const token = await new SignJWT({ bodyHash })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("rdv-print-internal")
    .setAudience("rdv-xpyun-gateway")
    .setIssuedAt()
    .setExpirationTime("20s")
    .sign(new TextEncoder().encode(secret));
  const controller = new AbortController();
  const timeoutMs = operation.method === "print" ? 14_000 : 7_000;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(GATEWAY_URL, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body, redirect: "manual", signal: controller.signal
      });
    } catch {
      throw new EdgeGatewayError(timedOut ? "timeout" : "socket");
    }
    if (!response.ok) throw new EdgeGatewayError("http", response.status);
    let result: unknown;
    try {
      const text = await response.text();
      if (text.length > 8192) throw new Error("oversize");
      result = JSON.parse(text);
    } catch {
      throw new EdgeGatewayError(timedOut ? "timeout" : "invalid_response");
    }
    if (!result || typeof result !== "object" || !("kind" in result)) throw new EdgeGatewayError("invalid_response");
    if (result.kind === "not_sent") {
      const code = "code" in result && typeof result.code === "number" && Number.isInteger(result.code) ? result.code : undefined;
      return { kind: "not_sent", ...(code !== undefined && { code }) };
    }
    if (result.kind !== "provider" || !("code" in result) || typeof result.code !== "number" || !Number.isInteger(result.code)
      || !("latencyMs" in result) || typeof result.latencyMs !== "number" || !Number.isFinite(result.latencyMs)) {
      throw new EdgeGatewayError("invalid_response");
    }
    return { kind: "provider", code: result.code, data: "data" in result ? result.data : undefined, latencyMs: result.latencyMs };
  } finally {
    clearTimeout(timer);
  }
}
