import { createHash } from "node:crypto";
import { request as httpsRequest } from "node:https";
import iconv from "iconv-lite";

type TransportPhase = "dns" | "connect" | "tls" | "response" | "body" | "parse";
type TransportReason = "timeout" | "http" | "invalid_json" | "invalid_response" | "body_limit" | "socket";

export class XpyunError extends Error {
  constructor(
    public readonly kind: "offline" | "rejected" | "unknown",
    public readonly code?: number,
    message = "打印连接暂时不可用",
    public readonly diagnostic?: { reason: TransportReason; phase: TransportPhase; durationMs: number; httpStatus?: number; socketCode?: string }
  ) {
    super(message);
    this.name = "XpyunError";
  }
}

const MAX_RESPONSE_BYTES = 64 * 1024;

/** One HTTP attempt. Recovery belongs to the durable job, never to a nested retry loop. */
export class XpyunTransport {
  private constructor(readonly sn: string, private readonly user: string, private readonly key: string, private readonly endpoint: URL) {}

  static fromEnvironment(snOverride?: string) {
    const user = (process.env.XPYUN_USER || process.env.XPYUN_USERKEY && process.env.USER || process.env.USERKEY && process.env.USER || "").trim();
    const key = (process.env.XPYUN_USER_KEY || process.env.XPYUN_USERKEY || process.env.USERKEY || "").trim();
    const sn = (snOverride || process.env.XPYUN_SN || process.env.SN || "").trim();
    if (!user || !key || !sn) throw new XpyunError("rejected", undefined, "打印机尚未配置");
    const endpoint = new URL(process.env.XPYUN_API_URL || "https://open.xpyun.net/api/openapi/xprinter/print");
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/api/openapi/xprinter/print") {
      throw new XpyunError("rejected", undefined, "打印机连接配置有误");
    }
    return new XpyunTransport(sn, user, key, endpoint);
  }

  private async request(method: string, body: Record<string, unknown>, timeoutMs: number) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sign = createHash("sha1").update(this.user + this.key + timestamp).digest("hex");
    const payload = Buffer.from(JSON.stringify({ user: this.user, timestamp, sign, ...body }), "utf8");
    const startedAt = Date.now();
    let phase: TransportPhase = "dns";
    const diagnostic = (reason: TransportReason, details: { httpStatus?: number; socketCode?: string } = {}) =>
      ({ reason, phase, durationMs: Date.now() - startedAt, ...details });
    try {
      const responseBody = await new Promise<string>((resolve, reject) => {
        let settled = false;
        let timer: NodeJS.Timeout;
        const finish = (error?: XpyunError, value?: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(value!);
        };
        const request = httpsRequest(new URL(method, this.endpoint), {
          method: "POST", agent: false,
          headers: { "Content-Type": "application/json;charset=UTF-8", "Content-Length": payload.length }
        }, response => {
          phase = "response";
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            finish(new XpyunError("unknown", undefined, undefined, diagnostic("http", { httpStatus: response.statusCode })));
            response.destroy();
            return;
          }
          phase = "body";
          const chunks: Buffer[] = [];
          let length = 0;
          response.on("data", (chunk: Buffer | string) => {
            if (settled) return;
            const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
            length += bytes.length;
            if (length > MAX_RESPONSE_BYTES) {
              finish(new XpyunError("unknown", undefined, undefined, diagnostic("body_limit")));
              response.destroy();
              request.destroy();
              return;
            }
            chunks.push(bytes);
          });
          response.on("end", () => finish(undefined, Buffer.concat(chunks).toString("utf8")));
          response.on("error", error => finish(new XpyunError("unknown", undefined, undefined, diagnostic("socket", {
            socketCode: safeSocketCode(error)
          }))));
        });
        request.on("socket", socket => {
          phase = "dns";
          socket.once("lookup", () => { phase = "connect"; });
          socket.once("connect", () => { phase = "tls"; });
          socket.once("secureConnect", () => { phase = "response"; });
        });
        request.on("error", error => finish(new XpyunError("unknown", undefined, undefined, diagnostic("socket", {
          socketCode: safeSocketCode(error)
        }))));
        timer = setTimeout(() => {
          finish(new XpyunError("unknown", undefined, undefined, diagnostic("timeout")));
          request.destroy();
        }, timeoutMs);
        request.end(payload);
      });
      phase = "parse";
      let reply: unknown;
      try { reply = JSON.parse(responseBody); }
      catch { throw new XpyunError("unknown", undefined, undefined, diagnostic("invalid_json")); }
      if (!reply || typeof reply !== "object" || !("code" in reply) || typeof reply.code !== "number" || !Number.isInteger(reply.code)) {
        throw new XpyunError("unknown", undefined, undefined, diagnostic("invalid_response"));
      }
      if (reply.code !== 0) console.warn("print.transport", { method, phase, reason: "provider", code: reply.code, ms: Date.now() - startedAt });
      return { code: reply.code, data: "data" in reply ? reply.data : undefined };
    } catch (error) {
      const failure = error instanceof XpyunError ? error : new XpyunError("unknown", undefined, undefined, diagnostic("socket", {
        socketCode: safeSocketCode(error)
      }));
      if (failure.diagnostic) console.warn("print.transport", {
        method, phase: failure.diagnostic.phase, reason: failure.diagnostic.reason,
        code: failure.diagnostic.socketCode, status: failure.diagnostic.httpStatus, ms: failure.diagnostic.durationMs
      });
      throw failure;
    }
  }

  async send(content: string, key: string, expiresIn: number): Promise<{ kind: "accepted"; remoteId: string } | { kind: "duplicate" }> {
    if (!content.trim() || iconv.encode(content, "gbk").length > 12 * 1024 || !/^[a-zA-Z0-9_-]{1,50}$/.test(key)) {
      throw new XpyunError("rejected", 1007, "票据内容无法打印");
    }
    if (!Number.isFinite(expiresIn) || expiresIn < 1) throw new XpyunError("rejected", undefined, "此打印任务已过期");
    // The official queue bridges a brief device disconnect. Its expiry prevents
    // old kitchen orders suddenly printing much later. No online preflight gate.
    const reply = await this.request("print", {
      sn: this.sn, content, copies: 1, mode: 1,
      expiresIn: Math.min(120, Math.floor(expiresIn)), idempotent: key
    }, 10_000);
    if (reply.code === 0 && typeof reply.data === "string" && reply.data.trim()) return { kind: "accepted", remoteId: reply.data };
    if (reply.code === 1013) return { kind: "duplicate" };
    if (reply.code === 0) throw new XpyunError("unknown");
    throw new XpyunError(reply.code === 1003 ? "offline" : "rejected", reply.code);
  }

  async orderState(remoteId: string): Promise<"completed" | "pending" | "unknown"> {
    try {
      const reply = await this.request("queryOrderState", { orderId: remoteId }, 4000);
      return reply.code !== 0 ? "unknown" : reply.data === true ? "completed" : reply.data === false ? "pending" : "unknown";
    } catch { return "unknown"; }
  }

  async printerStatus(): Promise<"online" | "offline" | "degraded" | "unknown"> {
    try {
      const reply = await this.request("queryPrinterStatus", { sn: this.sn }, 4000);
      return reply.code !== 0 ? "unknown" : reply.data === 1 ? "online" : reply.data === 0 ? "offline" : reply.data === 2 ? "degraded" : "unknown";
    } catch { return "unknown"; }
  }
}

function safeSocketCode(error: unknown): string | undefined {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? code : undefined;
}
