import { createHash, randomUUID } from "node:crypto";
import { PrintDispatchError } from "./print-error";

// XPYUN protocol boundary. No database, business rules or alternate print route.
// Contract: https://www.xpyun.net/open/ (reviewed 2026-09-20).
type Config = {
  url: URL; user: string; key: string; sn: string;
  copies: number; mode?: number; voice?: number; timeoutMs: number;
};
type Reply = { code: number; data: unknown };

class XpyunFailure extends PrintDispatchError {
  constructor(message: string, retryable: boolean, outcome: "unknown" | "offline" | "rejected", readonly code?: number) {
    super(message, retryable, outcome);
  }
}

function integerSetting(name: string, min: number, max: number): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new PrintDispatchError(`芯烨云配置错误：${name}`, false);
  }
  return value;
}

export class XpyunClient {
  private constructor(private readonly config: Config) {}

  static fromEnvironment() {
    const aliasUser = process.env.USERKEY || process.env.XPYUN_USERKEY || process.env.SN ? process.env.USER : "";
    const user = (process.env.XPYUN_USER || aliasUser || "").trim();
    const key = (process.env.XPYUN_USER_KEY || process.env.XPYUN_USERKEY || process.env.USERKEY || "").trim();
    const sn = (process.env.XPYUN_SN || process.env.SN || "").trim();
    if (!user || !key || !sn) throw new PrintDispatchError("芯烨云打印配置缺失", false);
    let url: URL;
    try {
      url = new URL(process.env.XPYUN_API_URL || "https://open.xpyun.net/api/openapi/xprinter/print");
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
          url.pathname !== "/api/openapi/xprinter/print") throw new Error("Invalid endpoint");
    } catch { throw new PrintDispatchError("芯烨云打印接口地址配置错误", false); }
    const forceSingle = String(process.env.PRINT_FORCE_SINGLE_COPY || "true").trim().toLowerCase() !== "false";
    const copies = forceSingle ? 1 : integerSetting("XPYUN_COPIES", 1, 65535) ?? 1;
    const timeout = Number(process.env.PRINT_TIMEOUT_MS || 10000);
    return new XpyunClient({ url, user, key, sn, copies,
      mode: integerSetting("XPYUN_MODE", 0, 1), voice: integerSetting("XPYUN_VOICE", 0, 3),
      timeoutMs: Number.isFinite(timeout) ? Math.min(15000, Math.max(10000, timeout)) : 10000 });
  }

  private async request(method: "print" | "queryPrinterStatus", params: Record<string, unknown>, timeoutMs: number): Promise<Reply> {
    const { user, key, url } = this.config;
    const endpoint = new URL(method, url);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sign = createHash("sha1").update(user + key + timestamp).digest("hex");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint.toString(), {
        method: "POST", redirect: "error", cache: "no-store",
        headers: { "Content-Type": "application/json;charset=UTF-8" },
        body: JSON.stringify({ user, timestamp, sign, ...params }), signal: controller.signal
      });
      if (!response.ok) {
        throw new XpyunFailure(`芯烨云打印失败(${response.status})`, response.status >= 500 || response.status === 429, "unknown");
      }
      let reply: unknown;
      try { reply = await response.json(); }
      catch { throw new XpyunFailure("打印结果未确认，请先核对是否出纸，勿重复打印", true, "unknown"); }
      if (!reply || typeof reply !== "object" || !("code" in reply) ||
          typeof reply.code !== "number" || !Number.isInteger(reply.code)) {
        throw new XpyunFailure("打印结果未确认，请先核对是否出纸，勿重复打印", true, "unknown");
      }
      return { code: reply.code, data: "data" in reply ? reply.data : undefined };
    } catch (error) {
      if (error instanceof PrintDispatchError) throw error;
      throw new XpyunFailure(controller.signal.aborted
        ? "打印服务响应超时，结果未确认，请先核对是否出纸"
        : "打印服务连接中断，结果未确认，请先核对是否出纸", true, "unknown");
    } finally { clearTimeout(timer); }
  }

  async print(content: string, requestKey: string = randomUUID(), copies = this.config.copies): Promise<string> {
    if (!content.trim() || !requestKey || requestKey.length > 50 || !Number.isInteger(copies) || copies < 1 || copies > 65535) {
      throw new PrintDispatchError("芯烨云打印参数错误", false);
    }
    const { sn, mode, voice, timeoutMs } = this.config;
    // Stable content/key across the bounded retry; refresh only timestamp/sign.
    const params = { sn, content, copies, idempotent: requestKey,
      ...(mode === undefined ? {} : { mode }), ...(voice === undefined ? {} : { voice }) };
    let previousUnknown = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const reply = await this.request("print", params, timeoutMs);
        if (reply.code === 0) {
          if (typeof reply.data === "string" && reply.data.trim()) return reply.data;
          throw new XpyunFailure("打印结果未确认，请先核对是否出纸，勿重复打印", true, "unknown");
        }
        if (reply.code === 1013) {
          // The documented meaning is deduplication, not successful delivery.
          // There is no documented lookup by idempotent key. Never forge success.
          throw new XpyunFailure("打印结果未确认，请先核对是否出纸，勿重复打印", false, "unknown", 1013);
        }
        if (reply.code === 1003) throw new XpyunFailure("打印机未连接芯烨云，请检查打印机网络后重试", true, "offline", 1003);
        // Official 1004 guidance: retry the API once. Other parameter/auth errors
        // cannot be repaired by repeating them (1006 means invalid order date).
        throw new XpyunFailure(`芯烨云打印失败(${reply.code})`, reply.code === 1004, "rejected", reply.code);
      } catch (error) {
        if (attempt === 0 && error instanceof XpyunFailure && error.retryable &&
            (error.outcome === "unknown" || error.code === 1004)) {
          previousUnknown = error.outcome === "unknown";
          continue;
        }
        if (error instanceof XpyunFailure) {
          if (previousUnknown) {
            throw new PrintDispatchError("打印结果未确认，请先核对是否出纸，勿重复打印", false, "unknown");
          }
          // This invocation already exhausted the allowed retry for 1004/unknown.
          throw new PrintDispatchError(error.message, error.outcome === "offline", error.outcome);
        }
        throw error;
      }
    }
    throw new PrintDispatchError("打印结果未确认，请先核对是否出纸，勿重复打印", false, "unknown");
  }

  async printerStatus(): Promise<"online" | "offline" | "degraded" | "unknown"> {
    const reply = await this.request("queryPrinterStatus", { sn: this.config.sn }, 4000);
    if (reply.code !== 0) return "unknown";
    return reply.data === 1 ? "online" : reply.data === 0 ? "offline" : reply.data === 2 ? "degraded" : "unknown";
  }
}
