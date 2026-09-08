"use client";

import { beginConnectionRequest, connectionResponded, connectionFailed } from "./connection";
import { safeStorageGet } from "./browser-storage";

type ApiFetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  useAuth?: boolean;
  dedupeGet?: boolean;
  cacheTtlMs?: number;
  adaptiveTimeout?: boolean;
};

export const NETWORK_POLICY = {
  timeoutMs: 5500,
  retriesGet: 2,
  // Writes only retry when their call site explicitly opts in.
  retriesWrite: 0,
  backoffBaseMs: 220
} as const;

const inflightGet = new Map<string, Promise<unknown>>();
const responseCache = new Map<string, { expiresAt: number; data: unknown }>();
const MAX_CACHED_RESPONSES = 64;
let cacheGeneration = 0;
class HttpResponseError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
type UiLang = "zh" | "en";

const serverErrorEn: Record<string, string> = {
  "未登录": "Not signed in",
  "无权限": "Insufficient permission",
  "缺少桌号": "Table number is required",
  "该桌未开台，请先开台": "Table is not open yet. Open the table first.",
  "该桌已开台": "Table is already open",
  "查询桌台失败": "Failed to load tables",
  "桌号或人数无效": "Invalid table or guest count",
  "开台失败": "Failed to open table",
  "查询失败": "Query failed",
  "存在无效或已下架菜品": "Some items are invalid or unavailable",
  "提交失败": "Failed to submit order",
  "桌台未开台": "Table is not open",
  "账单查询失败": "Failed to load bill",
  "账单打印失败": "Failed to print receipt",
  "暂无可打印账单": "No receipt content to print",
  "当前无可结账订单": "No payable orders for this table",
  "结账失败": "Checkout failed",
  "当前桌台有未结订单，请先结账": "Table has unpaid orders. Checkout first.",
  "关台失败": "Failed to close table",
  "拼桌桌号无效": "Invalid table numbers for merge",
  "人数无效": "Invalid guest count",
  "有桌台已开台，无法拼桌": "One selected table is already open",
  "拼桌失败": "Failed to merge tables",
  "该桌不是拼桌": "This table is not merged",
  "拼桌会话不存在": "Merged table session not found",
  "当前不是有效拼桌": "Invalid merged table state",
  "该拼桌已有订单，不能取消拼桌，请先结账": "Cannot unmerge because orders exist. Checkout first.",
  "取消拼桌失败": "Failed to unmerge tables",
  "请填写反结账原因": "Reverse checkout reason is required",
  "该桌当前是开台状态，无需反结账": "Table is open; reverse checkout is not needed",
  "未找到可反结账会话": "No checkout session to reverse",
  "反结账失败": "Reverse checkout failed",
  "订单不存在": "Order not found",
  "请填写取消原因": "Cancel reason is required",
  "已结账或已关闭订单不能取消": "Paid or closed orders cannot be cancelled",
  "订单已取消": "Order already cancelled",
  "取消订单失败": "Failed to cancel order",
  "参数不完整": "Missing required parameters",
  "退菜数量无效": "Invalid return quantity",
  "当前状态不可退菜": "Item return is not allowed in current status",
  "该订单无此菜品": "Dish not found in order",
  "退菜数量超过已点数量": "Return quantity exceeds ordered quantity",
  "退菜失败": "Failed to return item",
  "分单菜品参数错误": "Invalid split item parameters",
  "菜品 ID 格式错误": "Invalid dish ID format",
  "订单没有可分单菜品": "No items available to split",
  "分单数量超过原订单菜品数量": "Split quantity exceeds source order",
  "分单失败": "Failed to split order",
  "并单参数错误": "Invalid merge parameters",
  "订单 ID 格式错误": "Invalid order ID format",
  "目标单不能包含在来源单中": "Target order cannot be included in source orders",
  "存在无效订单 ID": "Some source order IDs are invalid",
  "仅支持同一桌号并单": "Only orders from the same table can be merged",
  "仅未结账订单可并单": "Only unpaid orders can be merged",
  "并单失败": "Failed to merge orders",
  "仅未结账订单可调整费用": "Only unpaid orders can be adjusted",
  "折扣不能超过菜品金额": "Discount cannot exceed item amount",
  "调整费用失败": "Failed to adjust charges",
  "缺少时间范围": "Time range is required",
  "时间格式错误": "Invalid time format",
  "收入查询失败": "Failed to load revenue",
  "热销查询失败": "Failed to load hot items",
  "订单查询失败": "Failed to load orders",
  "时间范围无效": "Invalid time range",
  "实收金额无效": "Invalid actual received amount",
  "日结失败": "Failed to submit day close",
  "日结记录查询失败": "Failed to load day-close records",
  "菜名或价格无效": "Invalid dish name or price",
  "新增模式无效": "Invalid add-dish mode",
  "班次无效": "Invalid shift",
  "新增菜失败": "Failed to add dish",
  "缺少必填字段": "Required fields are missing",
  "大类目无效": "Invalid major category",
  "子类目查询失败": "Failed to load subcategories",
  "子类目名称不能为空": "Subcategory name is required",
  "子类目名称长度不能超过 60": "Subcategory name must be 60 characters or fewer",
  "子类目已存在": "Subcategory already exists",
  "子类目创建失败": "Failed to create subcategory",
  "大类目查询失败": "Failed to load major categories",
  "大类目英文名称不能为空": "Main category English name is required",
  "大类目中文名称不能为空": "Main category Chinese name is required",
  "大类目 Key 无效": "Main category key is invalid",
  "大类目已存在": "Main category already exists",
  "大类目创建失败": "Failed to create main category",
  "请先执行 021 迁移": "Run migration 021 first",
  "仅经理可操作": "Manager only",
  "至少保留一个主目录": "At least one main category must remain",
  "大类目不存在": "Main category not found",
  "大类目删除失败": "Failed to delete main category",
  "子类目不存在": "Subcategory not found",
  "子类目删除失败": "Failed to delete subcategory",
  "菜单分组无效": "Invalid menu group",
  "菜品类型无效": "Invalid dish type",
  "参数错误": "Invalid parameters",
  "菜品不存在": "Dish not found",
  "更新失败": "Failed to update",
  "该菜品已有订单记录，不能删除": "Dish has order history and cannot be deleted",
  "删除失败": "Failed to delete",
  "创建失败": "Failed to create",
  "规则查询失败": "Failed to load fee rules",
  "规则保存失败": "Failed to save fee rules",
  "缺少规则数据": "Missing fee rules payload",
  "规则参数无效": "Invalid fee rule parameters",
  "规则不存在": "Fee rule not found",
  "规则删除失败": "Failed to delete fee rule",
  "设备状态查询失败": "Failed to load device status",
  "设备状态更新失败": "Failed to update device status",
  "设备不存在": "Device not found",
  "参数无效": "Invalid parameters",
  "打印自检失败": "Print self-test failed",
  "清空打印队列失败": "Failed to clear print queue",
  "打印失败": "Print failed",
  "请求失败": "Request failed"
};

function delay(ms: number, signal?: AbortSignal | null) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException("Request cancelled", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) { signal.removeEventListener("abort", abort); abort(); }
  });
}

function backoffMs(attempt: number) {
  const base = NETWORK_POLICY.backoffBaseMs * Math.max(1, attempt + 1);
  const jitter = Math.floor(Math.random() * 60);
  return base + jitter;
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function getUiLang(): UiLang {
  if (typeof window === "undefined") {
    return "en";
  }
  const stored = safeStorageGet("local", "rdv_lang");
  if (stored === "zh" || stored === "en") return stored;
  const browserLang = (navigator.language || "").toLowerCase();
  return browserLang.startsWith("zh") ? "zh" : "en";
}

function localizeErrorMessage(input: string, lang: UiLang) {
  const message = String(input || "").trim();
  if (!message || lang === "zh") return message;
  if (serverErrorEn[message]) return serverErrorEn[message];
  if (message.startsWith("请求超时，请检查网络")) {
    return "Request timed out. Check network and retry.";
  }
  if (message.startsWith("请求失败 (")) {
    return message.replace("请求失败", "Request failed");
  }
  if (message.startsWith("打印失败队列")) {
    return "Print queue has failures. Please check printer status.";
  }
  return message;
}

function readErrorMessage(data: unknown, fallback: string, lang: UiLang) {
  if (data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string") {
    return localizeErrorMessage((data as { error: string }).error, lang);
  }
  return localizeErrorMessage(fallback, lang);
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

function makeGetDedupeKey(url: string, requestHeaders: Headers) {
  const sorted = Array.from(requestHeaders.entries())
    .map(([k, v]) => `${k.toLowerCase()}:${v}`)
    .sort()
    .join("|");
  return `${url}::${sorted}`;
}

function cloneCachePayload<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getStoredAuth() {
  if (typeof window === "undefined") {
    return { token: "", role: "" };
  }
  return {
    token: safeStorageGet("local", "rdv_token"),
    role: safeStorageGet("local", "rdv_role")
  };
}

export async function apiFetchJson<T>(url: string, options: ApiFetchOptions = {}): Promise<T> {
  const {
    timeoutMs = NETWORK_POLICY.timeoutMs,
    retries,
    useAuth = true,
    dedupeGet = true,
    cacheTtlMs = 0,
    adaptiveTimeout = true,
    headers,
    body,
    signal: externalSignal,
    ...rest
  } = options;

  const method = String(rest.method || "GET").toUpperCase();
  const lang = getUiLang();
  const retryCount = resolveRetryCount(method, retries);
  const effectiveTimeoutMs = adaptiveTimeout ? resolveTimeout(timeoutMs) : timeoutMs;
  // Pin identity and payload for this logical request, including every retry.
  const requestHeaders = new Headers(headers);
  const auth = getStoredAuth();
  if (body !== undefined && !requestHeaders.has("Content-Type")) requestHeaders.set("Content-Type", "application/json");
  if (useAuth && auth.token && !requestHeaders.has("Authorization")) requestHeaders.set("Authorization", `Bearer ${auth.token}`);
  const requestBody = body === undefined ? undefined : JSON.stringify(body);
  const generation = cacheGeneration;

  const execute = async (): Promise<T> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      if (externalSignal?.aborted) throw new DOMException("Request cancelled", "AbortError");
      if (attempt > 0) await delay(backoffMs(attempt - 1), externalSignal);

      const connectionRequest = beginConnectionRequest();
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      externalSignal?.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);

      try {
        const response = await fetch(url, {
          ...rest,
          headers: requestHeaders,
          body: requestBody,
          signal: controller.signal
        });

        // Menu responses may come from the service worker cache; they cannot prove connectivity.
        if (!url.split("?")[0].endsWith("/api/menu")) connectionResponded(connectionRequest);
        const data = await response.json().catch((error) => {
          if (response.ok) throw error; // An invalid success payload is not a successful order/read.
          return {};
        });
        if (response.ok) {
          if (method !== "GET") {
            responseCache.clear();
            cacheGeneration += 1;
          }
          return data as T;
        }

        throw new HttpResponseError(response.status, readErrorMessage(data, `Request failed (${response.status})`, lang));
      } catch (err: any) {
        if (externalSignal?.aborted) throw new DOMException("Request cancelled", "AbortError");
        if (!(err instanceof HttpResponseError) && !(err instanceof SyntaxError)) connectionFailed(connectionRequest);
        if (err instanceof HttpResponseError && !isRetryableStatus(err.status)) throw err;
        // Do not replay a successful write merely because its response was malformed.
        if (err instanceof SyntaxError) throw new Error(lang === "zh" ? "服务器响应无效，请刷新确认" : "Invalid server response. Refresh to confirm.");
        if (err?.name === "AbortError") {
          lastError = new Error(
            lang === "zh"
              ? `请求超时，请检查网络（${url}）`
              : `Request timed out. Check network and retry (${url})`
          );
        } else {
          lastError = err instanceof Error
            ? new Error(localizeErrorMessage(err.message, lang))
            : new Error(lang === "zh" ? "网络请求失败" : "Network request failed");
        }

      } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener("abort", onAbort);
      }
    }

    throw lastError || new Error(lang === "zh" ? "请求失败" : "Request failed");
  };

  const canDedupeGet = dedupeGet && method === "GET" && body === undefined && !externalSignal;
  if (!canDedupeGet) {
    return execute();
  }

  const dedupeKey = `${generation}:${rest.credentials || "same-origin"}:${rest.cache || "default"}:${makeGetDedupeKey(url, requestHeaders)}`;
  const canCacheGet = cacheTtlMs > 0;
  if (canCacheGet) {
    const cached = responseCache.get(dedupeKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cloneCachePayload(cached.data as T);
    }
    if (cached) {
      responseCache.delete(dedupeKey);
    }
  }

  const existing = inflightGet.get(dedupeKey);
  if (existing) {
    return existing as Promise<T>;
  }

  const pending = execute()
    .then((result) => {
      if (canCacheGet && generation === cacheGeneration) {
        const now = Date.now();
        for (const [key, entry] of responseCache) if (entry.expiresAt <= now) responseCache.delete(key);
        if (responseCache.size >= MAX_CACHED_RESPONSES) responseCache.delete(responseCache.keys().next().value!);
        responseCache.set(dedupeKey, {
          expiresAt: Date.now() + cacheTtlMs,
          data: cloneCachePayload(result)
        });
      }
      return result;
    })
    .finally(() => {
      inflightGet.delete(dedupeKey);
    });
  inflightGet.set(dedupeKey, pending);
  return pending;
}
