import { createHash } from "crypto";
import { pool } from "./db";

export type PrintProvider = "cloud" | "agent" | "xpyun";
type PrintTarget = "kitchen" | "bar";

type DispatchResult = {
  provider: PrintProvider;
  slot: "primary" | "backup";
  remoteJobId?: string;
};

type OrderPrintRow = {
  order_id: string;
  table_no: string;
  created_at: string;
  waiter_name: string | null;
  dish_name: string;
  qty: number;
  category: string | null;
  note: string | null;
};

type PrintItem = {
  name: string;
  qty: number;
  category: string | null;
  note: string | null;
  target: PrintTarget;
};

type PrintTicket = {
  target: PrintTarget;
  items: PrintItem[];
};

type OrderPrintPayload = {
  type: "order";
  printVersion: number;
  tableNo: string;
  createdAt: string;
  waiter: string | null;
  items: PrintItem[];
  tickets: PrintTicket[];
};

type SelfTestPrintPayload = {
  type: "self_test";
  printVersion: number;
  generatedAt: string;
  tableNo: string;
  tickets: PrintTicket[];
};

type PrintPayload = OrderPrintPayload | SelfTestPrintPayload;

export class PrintDispatchError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

function getProvider(): PrintProvider {
  const raw = (process.env.PRINT_PROVIDER || "cloud").toLowerCase();
  if (raw === "agent") return "agent";
  if (raw === "xpyun") return "xpyun";
  return "cloud";
}

function getFallbackProvider(primary: PrintProvider): PrintProvider | null {
  const raw = (process.env.PRINT_FALLBACK_PROVIDER || "").toLowerCase();
  const parsed: PrintProvider | null = raw === "cloud" || raw === "agent" || raw === "xpyun"
    ? raw
    : null;
  if (!parsed || parsed === primary) return null;
  return parsed;
}

function getPrintTimeoutMs() {
  const raw = Number(process.env.PRINT_TIMEOUT_MS || 3000);
  if (!Number.isFinite(raw) || raw < 500) return 3000;
  return Math.min(Math.round(raw), 15000);
}

function toLowerSet(csv: string | undefined) {
  return new Set(
    String(csv || "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

function toLowerList(csv: string | undefined) {
  return String(csv || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function shouldSplitByTarget() {
  return String(process.env.PRINT_SPLIT_BY_TARGET || "").trim().toLowerCase() === "true";
}

function resolveTarget(
  category: string | null,
  dishName: string,
  barCategories: Set<string>,
  barKeywords: string[]
): PrintTarget {
  const categoryKey = String(category || "").trim().toLowerCase();
  if (categoryKey && barCategories.has(categoryKey)) {
    return "bar";
  }

  const nameKey = dishName.toLowerCase();
  if (barKeywords.some((keyword) => keyword && nameKey.includes(keyword))) {
    return "bar";
  }

  return "kitchen";
}

async function buildOrderPayload(orderId: string): Promise<OrderPrintPayload> {
  const barCategories = toLowerSet(process.env.PRINT_ROUTE_BAR_CATEGORIES);
  const barKeywords = toLowerList(process.env.PRINT_ROUTE_BAR_KEYWORDS);
  const splitByTarget = shouldSplitByTarget();

  const { rows } = await pool.query<OrderPrintRow>(
    `SELECT o.id AS order_id,
            o.table_no,
            o.created_at,
            u.username AS waiter_name,
            mi.name AS dish_name,
            oi.qty,
            mi.category,
            oi.note
     FROM orders o
     LEFT JOIN users u ON u.id = o.waiter_id
     JOIN order_items oi ON oi.order_id = o.id
     JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE o.id = $1
     ORDER BY mi.category ASC NULLS FIRST, mi.name ASC`,
    [orderId]
  );

  if (rows.length === 0) {
    throw new PrintDispatchError("打印订单不存在或无菜品", false);
  }

  const base = rows[0];
  const items = rows.map((row) => {
    const target = splitByTarget ? resolveTarget(row.category, row.dish_name, barCategories, barKeywords) : "kitchen";
    return {
      name: row.dish_name,
      qty: row.qty,
      category: row.category,
      note: row.note,
      target
    };
  });

  const tickets: PrintTicket[] = splitByTarget
    ? (["kitchen", "bar"] as const)
        .map((target) => ({
          target,
          items: items.filter((item) => item.target === target)
        }))
        .filter((ticket) => ticket.items.length > 0)
    : [{ target: "kitchen", items }];

  return {
    type: "order",
    printVersion: 2,
    tableNo: base.table_no,
    createdAt: base.created_at,
    waiter: base.waiter_name || null,
    items,
    tickets
  };
}

function buildSelfTestPayload(target: "kitchen" | "bar" | "both" = "both"): SelfTestPrintPayload {
  const splitByTarget = shouldSplitByTarget();
  const targets = splitByTarget
    ? (target === "both" ? (["kitchen", "bar"] as const) : ([target] as const))
    : (["kitchen"] as const);
  const items = target === "bar"
    ? [{
        name: "TEST DRINK",
        qty: 1,
        category: "Test Bar",
        note: "printer self test",
        target: "bar" as const
      }]
    : target === "kitchen"
      ? [{
          name: "TEST DISH",
          qty: 1,
          category: "Test Kitchen",
          note: "printer self test",
          target: "kitchen" as const
        }]
      : [{
          name: "TEST DISH",
          qty: 1,
          category: "Test Kitchen",
          note: "printer self test",
          target: "kitchen" as const
        }, {
          name: "TEST DRINK",
          qty: 1,
          category: "Test Bar",
          note: "printer self test",
          target: "bar" as const
        }];

  return {
    type: "self_test",
    printVersion: 2,
    generatedAt: new Date().toISOString(),
    tableNo: "TEST",
    tickets: targets.map((ticketTarget) => ({
      target: ticketTarget,
      items: splitByTarget ? items.filter((item) => item.target === ticketTarget) : items
    }))
  };
}

function escapeXpyunText(value: string) {
  return value
    .replace(/&/g, "＆")
    .replace(/</g, "&lt")
    .replace(/>/g, "&gt");
}

function line(text = "") {
  return `${escapeXpyunText(text)}<BR>`;
}

function formatPrintDateTime(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.valueOf())) return iso;
  const timezone = process.env.PRINT_TIMEZONE || "Asia/Manila";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function toXpyunContent(payload: PrintPayload) {
  const items = payload.tickets.flatMap((ticket) => ticket.items);
  const totalQty = items.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0);
  const headerDate = payload.type === "order" ? payload.createdAt : payload.generatedAt;

  const lines: string[] = [
    "<CB>RDV ORDER<BR></CB>",
    line(`桌号: ${payload.tableNo}`),
    line(`时间: ${formatPrintDateTime(headerDate)}`)
  ];

  if (payload.type === "order" && payload.waiter) {
    lines.push(line(`服务员: ${payload.waiter}`));
  }

  lines.push(line("--------------------------------"));
  for (const item of items) {
    lines.push(line(`${item.name} x${item.qty}`));
    if (item.note) {
      lines.push(line(`备注: ${item.note}`));
    }
    lines.push("<BR>");
  }
  lines.push(line("--------------------------------"));
  lines.push(line(`菜品数: ${items.length}`));
  lines.push(line(`总份数: ${totalQty}`));
  lines.push("<BR><BR>");

  let content = lines.join("");
  const maxBytes = 11_500; // XPYUN content hard limit is 12KB
  while (Buffer.byteLength(content, "utf8") > maxBytes && lines.length > 8) {
    lines.splice(Math.max(8, lines.length - 4), 2);
    content = lines.join("");
  }
  return content;
}

function isRetryableXpyunError(code: number) {
  return code === 1003 || code === 1006 || code === 2001 || code === 5000;
}

async function dispatchToXpyun(payload: PrintPayload): Promise<DispatchResult> {
  const url = process.env.XPYUN_API_URL || "https://open.xpyun.net/api/openapi/xprinter/print";
  const user = (process.env.XPYUN_USER || "").trim();
  const userKey = (process.env.XPYUN_USER_KEY || "").trim();
  const sn = (process.env.XPYUN_SN || "").trim();
  if (!url || !user || !userKey || !sn) {
    throw new PrintDispatchError("芯烨云打印配置缺失", false);
  }

  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = createHash("sha1").update(`${user}${userKey}${timestamp}`).digest("hex");
  const copiesRaw = Number(process.env.XPYUN_COPIES || 1);
  const copies = Number.isFinite(copiesRaw) ? Math.min(65535, Math.max(1, Math.round(copiesRaw))) : 1;
  const voiceRaw = Number(process.env.XPYUN_VOICE || 2);
  const voice = Number.isFinite(voiceRaw) ? Math.min(4, Math.max(0, Math.round(voiceRaw))) : 2;
  const modeRaw = process.env.XPYUN_MODE;
  const modeNum = modeRaw === undefined || modeRaw === "" ? null : Number(modeRaw);
  const mode = Number.isFinite(modeNum) ? Math.max(0, Math.round(modeNum as number)) : null;

  const body: Record<string, unknown> = {
    user,
    timestamp,
    sign,
    sn,
    content: toXpyunContent(payload),
    copies,
    voice
  };
  if (mode !== null) body.mode = mode;

  const result = await postJsonWithTimeout(url, body, {}, getPrintTimeoutMs());
  if (!result.ok) {
    const retryable = result.status >= 500 || result.status === 429;
    throw new PrintDispatchError(`芯烨云打印失败(${result.status})`, retryable);
  }

  const code = Number(result.data?.code);
  const msg = typeof result.data?.msg === "string" ? result.data.msg : "xpyun provider error";
  if (!Number.isFinite(code) || code !== 0) {
    throw new PrintDispatchError(`芯烨云打印失败(${code}) ${msg}`, isRetryableXpyunError(code));
  }

  return {
    provider: "xpyun",
    slot: "primary",
    remoteJobId: typeof result.data?.data === "string" ? result.data.data : undefined
  };
}

async function postJsonWithTimeout(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new PrintDispatchError(`打印请求超时（>${timeoutMs}ms）`, true);
    }
    throw new PrintDispatchError("打印请求网络异常", true);
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchToCloud(payload: Record<string, unknown>): Promise<DispatchResult> {
  const url = process.env.PRINT_CLOUD_URL;
  const token = process.env.PRINT_CLOUD_API_KEY;
  if (!url || !token) {
    throw new PrintDispatchError("云打印配置缺失", false);
  }

  const result = await postJsonWithTimeout(
    url,
    payload,
    { Authorization: `Bearer ${token}` },
    getPrintTimeoutMs()
  );

  if (!result.ok) {
    const retryable = result.status >= 500 || result.status === 429;
    const detail = typeof result.data?.error === "string" ? result.data.error : "cloud provider error";
    const message = `云打印失败(${result.status}) ${detail}`;
    throw new PrintDispatchError(message, retryable);
  }

  return {
    provider: "cloud",
    slot: "primary",
    remoteJobId: typeof result.data?.jobId === "string" ? result.data.jobId : undefined
  };
}

async function dispatchToAgent(payload: Record<string, unknown>): Promise<DispatchResult> {
  const url = process.env.PRINT_AGENT_URL;
  const token = process.env.PRINT_AGENT_TOKEN;
  if (!url || !token) {
    throw new PrintDispatchError("店内打印代理配置缺失", false);
  }

  const result = await postJsonWithTimeout(
    url,
    payload,
    { "X-Agent-Token": token },
    getPrintTimeoutMs()
  );

  if (!result.ok) {
    const retryable = result.status >= 500 || result.status === 429;
    const detail = typeof result.data?.error === "string" ? result.data.error : "agent provider error";
    const message = `打印代理失败(${result.status}) ${detail}`;
    throw new PrintDispatchError(message, retryable);
  }

  return {
    provider: "agent",
    slot: "primary",
    remoteJobId: typeof result.data?.jobId === "string" ? result.data.jobId : undefined
  };
}

async function markDeviceSuccess(slot: "primary" | "backup") {
  const deviceCode = slot === "primary" ? "printer-primary" : "printer-backup";
  try {
    await pool.query(
      `INSERT INTO device_status (device_code, device_type, label, status, is_backup, fail_count, last_seen_at, updated_at, last_error)
       VALUES ($1, 'printer', $2, 'online', $3, 0, now(), now(), NULL)
       ON CONFLICT (device_code) DO UPDATE
       SET status = 'online',
           fail_count = 0,
           last_seen_at = now(),
           updated_at = now(),
           last_error = NULL`,
      [deviceCode, slot === "primary" ? "Primary Printer" : "Backup Printer", slot === "backup"]
    );
  } catch {
    // Ignore device status write errors to avoid blocking print flow.
  }
}

async function markDeviceFailure(slot: "primary" | "backup", message: string) {
  const deviceCode = slot === "primary" ? "printer-primary" : "printer-backup";
  try {
    await pool.query(
      `INSERT INTO device_status (device_code, device_type, label, status, is_backup, fail_count, last_seen_at, updated_at, last_error)
       VALUES ($1, 'printer', $2, 'degraded', $3, 1, now(), now(), $4)
       ON CONFLICT (device_code) DO UPDATE
       SET fail_count = device_status.fail_count + 1,
           status = CASE WHEN device_status.fail_count + 1 >= 3 THEN 'offline' ELSE 'degraded' END,
           last_seen_at = now(),
           updated_at = now(),
           last_error = $4`,
      [deviceCode, slot === "primary" ? "Primary Printer" : "Backup Printer", slot === "backup", message.slice(0, 500)]
    );
  } catch {
    // Ignore device status write errors to keep print retries running.
  }
}

async function dispatchWithTracking(
  provider: PrintProvider,
  payload: PrintPayload,
  slot: "primary" | "backup"
): Promise<DispatchResult> {
  try {
    const result = provider === "agent"
      ? await dispatchToAgent(payload)
      : provider === "xpyun"
        ? await dispatchToXpyun(payload)
        : await dispatchToCloud(payload);
    await markDeviceSuccess(slot);
    return { ...result, slot };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : "打印失败";
    await markDeviceFailure(slot, msg);
    throw err;
  }
}

async function dispatchWithFallback(payload: PrintPayload) {
  const primary = getProvider();
  const fallback = getFallbackProvider(primary);

  try {
    return await dispatchWithTracking(primary, payload, "primary");
  } catch (err: any) {
    if (!fallback) {
      throw err;
    }
    return dispatchWithTracking(fallback, payload, "backup");
  }
}

export async function dispatchPrintJob(orderId: string): Promise<DispatchResult> {
  const payload = await buildOrderPayload(orderId);
  return dispatchWithFallback(payload);
}

export async function dispatchPrintSelfTest(target: "kitchen" | "bar" | "both" = "both") {
  const payload = buildSelfTestPayload(target);
  return dispatchWithFallback(payload);
}
