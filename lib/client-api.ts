"use client";

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  useAuth?: boolean;
  dedupeGet?: boolean;
};

export const NETWORK_POLICY = {
  timeoutMs: 5500,
  retriesGet: 2,
  retriesWrite: 1,
  backoffBaseMs: 220
} as const;

const inflightGet = new Map<string, Promise<unknown>>();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number) {
  const base = NETWORK_POLICY.backoffBaseMs * Math.max(1, attempt + 1);
  const jitter = Math.floor(Math.random() * 60);
  return base + jitter;
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

function getNetworkProfile() {
  if (typeof navigator === "undefined") {
    return { weak: false, saveData: false };
  }
  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      saveData?: boolean;
      rtt?: number;
      downlink?: number;
    };
  };
  const conn = nav.connection;
  if (!conn) {
    return { weak: false, saveData: false };
  }
  const effectiveType = String(conn.effectiveType || "").toLowerCase();
  const weak = effectiveType === "slow-2g" || effectiveType === "2g" || (typeof conn.rtt === "number" && conn.rtt > 380);
  return { weak, saveData: Boolean(conn.saveData) };
}

function resolveTimeout(baseTimeoutMs: number) {
  const profile = getNetworkProfile();
  if (!profile.weak && !profile.saveData) return baseTimeoutMs;
  const extra = (profile.weak ? 2200 : 0) + (profile.saveData ? 1200 : 0);
  return Math.min(baseTimeoutMs + extra, 15000);
}

function resolveRetryCount(method: string, retries: number | undefined) {
  if (typeof retries === "number") {
    return Math.max(0, retries);
  }
  const base = method === "GET" ? NETWORK_POLICY.retriesGet : NETWORK_POLICY.retriesWrite;
  const profile = getNetworkProfile();
  if (method === "GET" && profile.weak) {
    return Math.min(base + 1, 3);
  }
  return base;
}

function makeGetDedupeKey(url: string, headers: HeadersInit | undefined, useAuth: boolean) {
  const auth = getStoredAuth();
  const requestHeaders = new Headers(headers);
  if (useAuth && auth.token && !requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${auth.token}`);
  }
  const sorted = Array.from(requestHeaders.entries())
    .map(([k, v]) => `${k.toLowerCase()}:${v}`)
    .sort()
    .join("|");
  return `${url}::${sorted}`;
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
    dedupeGet = true,
    headers,
    body,
    signal: externalSignal,
    ...rest
  } = options;

  const method = String(rest.method || "GET").toUpperCase();
  const retryCount = resolveRetryCount(method, retries);
  const effectiveTimeoutMs = resolveTimeout(timeoutMs);

  const execute = async (): Promise<T> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("设备离线，请检查网络后重试");
      }

      const controller = new AbortController();
      const onAbort = () => controller.abort();
      externalSignal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);

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
          await delay(backoffMs(attempt));
          continue;
        }

        throw new Error(readErrorMessage(data, `请求失败 (${response.status})`));
      } catch (err: any) {
        if (err?.name === "AbortError") {
          lastError = new Error(`请求超时，请检查网络（${url}）`);
        } else {
          lastError = err instanceof Error ? err : new Error("网络请求失败");
        }

        if (attempt < retryCount) {
          await delay(backoffMs(attempt));
          continue;
        }
      } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener("abort", onAbort);
      }
    }

    throw lastError || new Error("请求失败");
  };

  const canDedupeGet = dedupeGet && method === "GET" && body === undefined && !externalSignal;
  if (!canDedupeGet) {
    return execute();
  }

  const dedupeKey = makeGetDedupeKey(url, headers, useAuth);
  const existing = inflightGet.get(dedupeKey);
  if (existing) {
    return existing as Promise<T>;
  }

  const pending = execute().finally(() => {
    inflightGet.delete(dedupeKey);
  });
  inflightGet.set(dedupeKey, pending);
  return pending;
}
