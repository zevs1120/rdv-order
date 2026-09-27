import { createHash } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import iconv from "iconv-lite";
import { callEdgeProvider, EdgeGatewayError, type EdgeOperation } from "./provider-edge";

type TransportPhase = "dns" | "connect" | "tls" | "response" | "body" | "parse";
type TransportReason = "timeout" | "http" | "invalid_json" | "invalid_response" | "body_limit" | "socket" | "provider" | "response";

export type XpyunDiagnostic = {
  reason: TransportReason;
  phase: TransportPhase;
  durationMs: number;
  hostname?: string;
  lookup?: { address?: string; family?: 4 | 6; errorCode?: string };
  attempts?: Array<{ address: string; family: 4 | 6; code?: string }>;
  tcpConnectedMs?: number;
  tlsConnectedMs?: number;
  httpStatus?: number;
  socketCode?: string;
  providerCode?: number;
  requestStarted?: boolean;
};

export class XpyunError extends Error {
  constructor(
    public readonly kind: "offline" | "rejected" | "unknown" | "unreachable",
    public readonly code?: number,
    message = "打印连接暂时不可用",
    public readonly diagnostic?: XpyunDiagnostic
  ) {
    super(message);
    this.name = "XpyunError";
  }
}

const MAX_RESPONSE_BYTES = 64 * 1024;

/** One HTTP attempt. Recovery belongs to the durable job, never to a nested retry loop. */
export class XpyunTransport {
  private _lastDiagnostic: XpyunDiagnostic | undefined;
  private constructor(readonly sn: string, private readonly user: string, private readonly key: string, private readonly endpoint: URL) {}

  get lastDiagnostic(): XpyunDiagnostic | undefined { return this._lastDiagnostic; }

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
    if (process.env.VERCEL === "1" || process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") {
      return this.requestViaEdge(method, body);
    }
    this._lastDiagnostic = undefined;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sign = createHash("sha1").update(this.user + this.key + timestamp).digest("hex");
    const payload = Buffer.from(JSON.stringify({ user: this.user, timestamp, sign, ...body }), "utf8");
    const startedAt = Date.now();
    let phase: TransportPhase = "dns";
    let lookup: XpyunDiagnostic["lookup"];
    const attempts: NonNullable<XpyunDiagnostic["attempts"]> = [];
    let tcpConnectedMs: number | undefined;
    let tlsConnectedMs: number | undefined;
    // No HTTP headers/body are handed to the socket until TLS is ready.
    // This is an explicit safe-reconnect boundary, not an inference from an error code.
    let requestStarted = false;
    const diagnostic = (reason: TransportReason, details: { httpStatus?: number; socketCode?: string; providerCode?: number } = {}): XpyunDiagnostic =>
      ({ reason, phase, durationMs: Date.now() - startedAt, hostname: this.endpoint.hostname, requestStarted,
        ...(lookup && { lookup: { ...lookup } }), attempts: attempts.map(attempt => ({ ...attempt })),
        ...(tcpConnectedMs !== undefined && { tcpConnectedMs }),
        ...(tlsConnectedMs !== undefined && { tlsConnectedMs }), ...details });
    const recordAttempt = (address: string, family: number, code?: string) => {
      if (typeof address !== "string" || isIP(address) !== family || family !== 4 && family !== 6) return;
      if (code) {
        const existing = [...attempts].reverse().find(attempt => attempt.address === address && attempt.family === family);
        if (existing) { existing.code = code; return; }
      }
      if (attempts.length < 6) attempts.push({ address, family, ...(code && { code }) });
    };
    try {
      const responseBody = await new Promise<string>((resolve, reject) => {
        let settled = false;
        let timer: NodeJS.Timeout | undefined;
        let connectTimer: NodeJS.Timeout | undefined;
        const finish = (error?: XpyunError, value?: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          clearTimeout(connectTimer);
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
          socket.once("lookup", (error: Error | null, address: string, family: number) => {
            lookup = {
              ...(typeof address === "string" && isIP(address) && { address }),
              ...((family === 4 || family === 6) && { family }),
              ...(safeSocketCode(error) && { errorCode: safeSocketCode(error) })
            };
            phase = error ? "dns" : "connect";
          });
          socket.on("connectionAttempt", (address: string, _port: number, family: number) => recordAttempt(address, family));
          socket.on("connectionAttemptFailed", (address: string, _port: number, family: number, error: Error) =>
            recordAttempt(address, family, safeSocketCode(error) || "FAILED"));
          socket.on("connectionAttemptTimeout", (address: string, _port: number, family: number) =>
            recordAttempt(address, family, "TIMEOUT"));
          socket.once("connect", () => { phase = "tls"; tcpConnectedMs = Date.now() - startedAt; });
          socket.once("secureConnect", () => {
            if (settled) return;
            phase = "response";
            tlsConnectedMs = Date.now() - startedAt;
            clearTimeout(connectTimer);
            requestStarted = true;
            request.end(payload);
          });
        });
        request.on("error", error => finish(new XpyunError(requestStarted ? "unknown" : "unreachable", undefined, undefined, diagnostic("socket", {
          socketCode: safeSocketCode(error)
        }))));
        timer = setTimeout(() => {
          finish(new XpyunError(requestStarted ? "unknown" : "unreachable", undefined, undefined, diagnostic("timeout")));
          request.destroy();
        }, timeoutMs);
        connectTimer = setTimeout(() => {
          finish(new XpyunError("unreachable", undefined, undefined, diagnostic("timeout")));
          request.destroy();
        }, Math.min(timeoutMs, 4000));
      });
      phase = "parse";
      let reply: unknown;
      try { reply = JSON.parse(responseBody); }
      catch { throw new XpyunError("unknown", undefined, undefined, diagnostic("invalid_json")); }
      if (!reply || typeof reply !== "object" || !("code" in reply) || typeof reply.code !== "number" || !Number.isInteger(reply.code)) {
        throw new XpyunError("unknown", undefined, undefined, diagnostic("invalid_response"));
      }
      this._lastDiagnostic = diagnostic(reply.code === 0 ? "response" : "provider", { providerCode: reply.code });
      if (reply.code !== 0) console.warn("print.transport", { method, ...this._lastDiagnostic });
      return { code: reply.code, data: "data" in reply ? reply.data : undefined };
    } catch (error) {
      const failure = error instanceof XpyunError ? error : new XpyunError(requestStarted ? "unknown" : "unreachable", undefined, undefined, diagnostic("socket", {
        socketCode: safeSocketCode(error)
      }));
      this._lastDiagnostic = failure.diagnostic || diagnostic("socket", { socketCode: safeSocketCode(error) });
      console.warn("print.transport", { method, ...this._lastDiagnostic });
      throw failure;
    }
  }

  private async requestViaEdge(method: string, body: Record<string, unknown>) {
    this._lastDiagnostic = undefined;
    const startedAt = Date.now();
    const diagnostic = (reason: TransportReason, httpStatus?: number, providerCode?: number): XpyunDiagnostic => ({
      reason, phase: "response", durationMs: Date.now() - startedAt,
      hostname: "order.resortdejavu.cn", requestStarted: true,
      ...(httpStatus !== undefined && { httpStatus }),
      ...(providerCode !== undefined && { providerCode })
    });
    try {
      let operation: EdgeOperation;
      if (method === "print" && typeof body.content === "string" && typeof body.idempotent === "string"
        && typeof body.expiresIn === "number") {
        operation = { method, sn: this.sn, content: body.content, key: body.idempotent,
          expireAt: typeof body.expireAt === "number" ? body.expireAt : Date.now() + body.expiresIn * 1000 };
      } else if (method === "queryPrinterStatus") {
        operation = { method, sn: this.sn };
      } else if (method === "queryOrderState" && typeof body.orderId === "string") {
        operation = { method, sn: this.sn, orderId: body.orderId };
      } else {
        throw new XpyunError("rejected", undefined, "打印请求参数无效");
      }
      const reply = await callEdgeProvider(operation);
      if (reply.kind === "not_sent") throw new XpyunError("rejected", reply.code, "打印任务未发送");
      this._lastDiagnostic = diagnostic(reply.code === 0 ? "response" : "provider", undefined, reply.code);
      if (reply.code !== 0) console.warn("print.transport", { method, ...this._lastDiagnostic });
      return { code: reply.code, data: reply.data };
    } catch (cause) {
      const gatewayError = cause instanceof EdgeGatewayError ? cause : undefined;
      // The Edge function may have sent the print before either hop failed.
      // Only its explicit pre-provider not_sent response is a known rejection.
      const error = cause instanceof XpyunError ? cause : new XpyunError("unknown", undefined, undefined,
        diagnostic(gatewayError?.reason || "socket", gatewayError?.httpStatus));
      this._lastDiagnostic = error.diagnostic || diagnostic(gatewayError?.reason || "invalid_response", gatewayError?.httpStatus);
      console.warn("print.transport", { method, ...this._lastDiagnostic });
      throw error;
    }
  }

  async send(content: string, key: string, expiresIn: number, expiresAt?: number): Promise<{ kind: "accepted"; remoteId: string } | { kind: "duplicate" }> {
    if (!content.trim() || iconv.encode(content, "gbk").length > 12 * 1024 || !/^[a-zA-Z0-9_-]{1,50}$/.test(key)) {
      throw new XpyunError("rejected", 1007, "票据内容无法打印");
    }
    if (!Number.isFinite(expiresIn) || expiresIn < 1) throw new XpyunError("rejected", undefined, "此打印任务已过期");
    // The official queue bridges a brief device disconnect. Its expiry prevents
    // old kitchen orders suddenly printing much later. No online preflight gate.
    const reply = await this.request("print", {
      sn: this.sn, content, copies: 1, mode: 1,
      expiresIn: Math.min(120, Math.floor(expiresIn)), idempotent: key,
      ...((process.env.VERCEL === "1" || process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview")
        && expiresAt !== undefined ? { expireAt: expiresAt } : {})
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
