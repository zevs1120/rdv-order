import { createHash } from "node:crypto";
import { request } from "node:https";
import iconv from "iconv-lite";

// Official protocol: https://www.xpyun.net/open/ and the official NodeJS demo.
// One direct JSON POST. There is no internal gateway or background print worker.
export class PrintError extends Error {
  constructor(public readonly definite: boolean, public readonly code?: number) {
    super(code === undefined ? "芯烨云请求未确认，请核对纸张" : `芯烨云拒绝打印 (${code})`);
  }
}

export class Xpyun {
  constructor(readonly sn: string, private user: string, private key: string, private base: URL) {}

  static configured(sn?: string) {
    const user = (process.env.XPYUN_USER || "").trim();
    const key = (process.env.XPYUN_USER_KEY || process.env.XPYUN_USERKEY || "").trim();
    const printer = (sn || process.env.XPYUN_SN || "").trim();
    if (!user || !key || !printer) throw new Error("打印机尚未配置");
    const url = new URL(process.env.XPYUN_API_URL || "https://open.xpyun.net/api/openapi/xprinter/print");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || !["open.xpyun.net", "sg.open.xpyun.net", "gm.open.xpyun.net"].includes(url.hostname)
      || url.pathname !== "/api/openapi/xprinter/print") throw new Error("芯烨云接口配置有误");
    return new Xpyun(printer, user, key, url);
  }

  private post(method: string, fields: Record<string, unknown>, timeoutMs = 10_000): Promise<{ code: number; data: unknown }> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sign = createHash("sha1").update(this.user + this.key + timestamp).digest("hex");
    const body = JSON.stringify({ user: this.user, timestamp, sign, ...fields });
    return new Promise((resolve, reject) => {
      const req = request(new URL(method, this.base), {
        method: "POST", agent: false,
        headers: { "Content-Type": "application/json;charset=UTF-8", "Content-Length": Buffer.byteLength(body) }
      }, res => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", chunk => {
          text += chunk;
          if (text.length > 65536) req.destroy(new PrintError(false));
        });
        res.on("error", () => reject(new PrintError(false)));
        res.on("end", () => {
          try {
            if (res.statusCode !== 200) throw new Error();
            const value = JSON.parse(text);
            if (!value || !Number.isInteger(value.code)) throw new Error();
            resolve(value);
          } catch { reject(new PrintError(false)); }
        });
      });
      const timer = setTimeout(() => req.destroy(new PrintError(false)), timeoutMs);
      req.on("close", () => clearTimeout(timer));
      req.on("error", () => reject(new PrintError(false)));
      req.end(body);
    });
  }

  async print(content: string, idempotent: string): Promise<string> {
    if (!content.trim() || iconv.encode(content, "gbk").length > 12 * 1024) throw new PrintError(true, 1006);
    const fields = { sn: this.sn, content, copies: 1, voice: 2, mode: 0, idempotent };
    let result = await this.post("print", fields);
    // Official ADD_ORDER_FAILED guidance: retry once, with the identical key.
    if (result.code === 1004) result = await this.post("print", fields);
    if (result.code === 0 && typeof result.data === "string" && result.data.trim()) return result.data;
    // A duplicate acknowledgement without its remote ID is not paper confirmation.
    throw new PrintError(result.code !== 0 && result.code !== 1013, result.code);
  }

  async printerStatus(): Promise<"online" | "offline" | "degraded" | "unknown"> {
    try {
      const reply = await this.post("queryPrinterStatus", { sn: this.sn }, 4000);
      return reply.code !== 0 ? "unknown" : reply.data === 1 ? "online" : reply.data === 0 ? "offline" : reply.data === 2 ? "degraded" : "unknown";
    } catch { return "unknown"; }
  }

  async completed(orderId: string): Promise<boolean> {
    try {
      const reply = await this.post("queryOrderState", { orderId }, 4000);
      return reply.code === 0 && reply.data === true;
    } catch { return false; }
  }
}
