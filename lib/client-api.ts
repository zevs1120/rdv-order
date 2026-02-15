"use client";

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  useAuth?: boolean;
};

export const NETWORK_POLICY = {
  timeoutMs: 5500,
  retriesGet: 2,
  retriesWrite: 1,
  backoffBaseMs: 220
} as const;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function readErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string") {
    return (data as { error: string }).error;
  }
  return fallback;
}

export function getStoredAuth() {
  if (typeof window === "undefined") {
    return { token: "", role: "" };
  }
  return {
    token: localStorage.getItem("rdv_token") || "",
    role: localStorage.getItem("rdv_role") || ""
  };
}

export async function apiFetchJson<T>(url: string, options: ApiFetchOptions = {}): Promise<T> {
  const {
    timeoutMs = NETWORK_POLICY.timeoutMs,
    retries,
    useAuth = true,
    headers,
    body,
    signal: externalSignal,
    ...rest
  } = options;

  const method = String(rest.method || "GET").toUpperCase();
  const retryCount = typeof retries === "number"
    ? Math.max(0, retries)
    : (method === "GET" ? NETWORK_POLICY.retriesGet : NETWORK_POLICY.retriesWrite);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    externalSignal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const auth = getStoredAuth();
      const requestHeaders = new Headers(headers);
      if (body !== undefined && !requestHeaders.has("Content-Type")) {
        requestHeaders.set("Content-Type", "application/json");
      }
      if (useAuth && auth.token && !requestHeaders.has("Authorization")) {
        requestHeaders.set("Authorization", `Bearer ${auth.token}`);
      }

      const response = await fetch(url, {
        ...rest,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        return data as T;
      }

      if (attempt < retryCount && isRetryableStatus(response.status)) {
        await delay(NETWORK_POLICY.backoffBaseMs * (attempt + 1));
        continue;
      }

      throw new Error(readErrorMessage(data, `请求失败 (${response.status})`));
    } catch (err: any) {
      if (err?.name === "AbortError") {
        lastError = new Error("请求超时，请检查网络");
      } else {
        lastError = err instanceof Error ? err : new Error("网络请求失败");
      }

      if (attempt < retryCount) {
        await delay(NETWORK_POLICY.backoffBaseMs * (attempt + 1));
        continue;
      }
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onAbort);
    }
  }

  throw lastError || new Error("请求失败");
}
