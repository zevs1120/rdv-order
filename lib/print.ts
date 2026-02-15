export type PrintProvider = "cloud" | "agent";

type DispatchResult = {
  provider: PrintProvider;
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
      throw new PrintDispatchError("打印请求超时", true);
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
    3000
  );

  if (!result.ok) {
    const retryable = result.status >= 500 || result.status === 429;
    const message = typeof result.data?.error === "string" ? result.data.error : "云打印失败";
    throw new PrintDispatchError(message, retryable);
  }

  return {
    provider: "cloud",
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
    3000
  );

  if (!result.ok) {
    const retryable = result.status >= 500 || result.status === 429;
    const message = typeof result.data?.error === "string" ? result.data.error : "打印代理失败";
    throw new PrintDispatchError(message, retryable);
  }

  return {
    provider: "agent",
    remoteJobId: typeof result.data?.jobId === "string" ? result.data.jobId : undefined
  };
}

export async function dispatchPrintJob(orderId: string): Promise<DispatchResult> {
  const provider = getProvider();
  if (provider === "agent") {
    return dispatchToAgent(orderId);
  }
  return dispatchToCloud(orderId);
}
