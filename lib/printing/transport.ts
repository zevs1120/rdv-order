import { createHash } from "node:crypto";
import iconv from "iconv-lite";

export class XpyunError extends Error {
  constructor(public readonly kind: "offline" | "rejected" | "unknown", public readonly code?: number, message = "打印连接暂时不可用") {
    super(message);
    this.name = "XpyunError";
  }
}

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
    try {
      const response = await fetch(new URL(method, this.endpoint), {
        method: "POST", redirect: "error", cache: "no-store",
        headers: { "Content-Type": "application/json;charset=UTF-8" },
        body: JSON.stringify({ user: this.user, timestamp, sign, ...body }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) throw new XpyunError("unknown");
      const reply: unknown = await response.json();
      if (!reply || typeof reply !== "object" || !("code" in reply) || typeof reply.code !== "number" || !Number.isInteger(reply.code)) throw new XpyunError("unknown");
      return { code: reply.code, data: "data" in reply ? reply.data : undefined };
    } catch (error) {
      if (error instanceof XpyunError) throw error;
      throw new XpyunError("unknown");
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
