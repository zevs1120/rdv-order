import { pool } from "./db";

export type PrintProvider = "cloud" | "agent";

type DispatchResult = {
  provider: PrintProvider;
  slot: "primary" | "backup";
  remoteJobId?: string;
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

async function dispatchToCloud(orderId: string): Promise<DispatchResult> {
  const url = process.env.PRINT_CLOUD_URL;
  const token = process.env.PRINT_CLOUD_API_KEY;
  if (!url || !token) {
    throw new PrintDispatchError("云打印配置缺失", false);
  }

  const result = await postJsonWithTimeout(
    url,
    { orderId },
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

async function dispatchToAgent(orderId: string): Promise<DispatchResult> {
  const url = process.env.PRINT_AGENT_URL;
  const token = process.env.PRINT_AGENT_TOKEN;
  if (!url || !token) {
    throw new PrintDispatchError("店内打印代理配置缺失", false);
  }

  const result = await postJsonWithTimeout(
    url,
    { orderId },
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
  orderId: string,
  slot: "primary" | "backup"
): Promise<DispatchResult> {
  try {
    const result = provider === "agent" ? await dispatchToAgent(orderId) : await dispatchToCloud(orderId);
    await markDeviceSuccess(slot);
    return { ...result, slot };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : "打印失败";
    await markDeviceFailure(slot, msg);
    throw err;
  }
}

export async function dispatchPrintJob(orderId: string): Promise<DispatchResult> {
  const primary = getProvider();
  const fallback = getFallbackProvider(primary);

  try {
    return await dispatchWithTracking(primary, orderId, "primary");
  } catch (err: any) {
    if (!fallback) {
      throw err;
    }
    return dispatchWithTracking(fallback, orderId, "backup");
  }
}
