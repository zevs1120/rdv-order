import { pool } from "./db";

export type PrintProvider = "cloud" | "agent";
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

export class PrintDispatchError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

function getProvider(): PrintProvider {
  const raw = (process.env.PRINT_PROVIDER || "cloud").toLowerCase();
  return raw === "agent" ? "agent" : "cloud";
}

function getFallbackProvider(primary: PrintProvider): PrintProvider | null {
  const raw = (process.env.PRINT_FALLBACK_PROVIDER || "").toLowerCase();
  const parsed: PrintProvider | null = raw === "cloud" ? "cloud" : raw === "agent" ? "agent" : null;
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

async function buildOrderPayload(orderId: string) {
  const barCategories = toLowerSet(process.env.PRINT_ROUTE_BAR_CATEGORIES);
  const barKeywords = toLowerList(process.env.PRINT_ROUTE_BAR_KEYWORDS);

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
    const target = resolveTarget(row.category, row.dish_name, barCategories, barKeywords);
    return {
      name: row.dish_name,
      qty: row.qty,
      category: row.category,
      note: row.note,
      target
    };
  });

  const tickets = ["kitchen", "bar"]
    .map((target) => ({
      target,
      items: items.filter((item) => item.target === target)
    }))
    .filter((ticket) => ticket.items.length > 0);

  return {
    type: "order",
    printVersion: 2,
    orderId,
    tableNo: base.table_no,
    createdAt: base.created_at,
    waiter: base.waiter_name || null,
    items,
    tickets,
    routeRules: {
      barCategories: Array.from(barCategories),
      barKeywords
    }
  };
}

function buildSelfTestPayload(target: "kitchen" | "bar" | "both" = "both") {
  const targets = target === "both" ? (["kitchen", "bar"] as const) : ([target] as const);
  return {
    type: "self_test",
    printVersion: 2,
    generatedAt: new Date().toISOString(),
    tableNo: "TEST",
    tickets: targets.map((ticketTarget) => ({
      target: ticketTarget,
      items: [{
        name: ticketTarget === "bar" ? "TEST DRINK" : "TEST DISH",
        qty: 1,
        category: ticketTarget === "bar" ? "Test Bar" : "Test Kitchen",
        note: "printer self test",
        target: ticketTarget
      }]
    }))
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
  payload: Record<string, unknown>,
  slot: "primary" | "backup"
): Promise<DispatchResult> {
  try {
    const result = provider === "agent" ? await dispatchToAgent(payload) : await dispatchToCloud(payload);
    await markDeviceSuccess(slot);
    return { ...result, slot };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : "打印失败";
    await markDeviceFailure(slot, msg);
    throw err;
  }
}

async function dispatchWithFallback(payload: Record<string, unknown>) {
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
