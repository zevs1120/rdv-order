"use client";

type PerfDebugInteraction = {
  name: string;
  durationMs: number;
  startedAt: number;
  finishedAt: number;
  meta?: Record<string, unknown>;
};

type PerfDebugLongTask = {
  durationMs: number;
  startedAt: number;
  name: string;
};

type PerfDebugStore = {
  enabled: boolean;
  interactions: PerfDebugInteraction[];
  longTasks: PerfDebugLongTask[];
  observerAttached: boolean;
};

const QUERY_FLAG = "perfDebug";
const STORAGE_FLAG = "rdv_perf_debug";

declare global {
  interface Window {
    __rdvPerfDebug?: PerfDebugStore;
  }
}

function detectPerfDebug() {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return true;

  const params = new URLSearchParams(window.location.search);
  if (params.get(QUERY_FLAG) === "1") return true;

  try {
    return localStorage.getItem(STORAGE_FLAG) === "1";
  } catch {
    return false;
  }
}

function getStore() {
  if (typeof window === "undefined") return null;
  if (!window.__rdvPerfDebug) {
    const enabled = detectPerfDebug();
    window.__rdvPerfDebug = {
      enabled,
      interactions: [],
      longTasks: [],
      observerAttached: false
    };
  }
  return window.__rdvPerfDebug;
}

function trimBuffer<T>(bucket: T[], maxSize: number) {
  if (bucket.length <= maxSize) return;
  bucket.splice(0, bucket.length - maxSize);
}

export function isPerfDebugEnabled() {
  return Boolean(getStore()?.enabled);
}

export function setupPerfDebugObserver() {
  const store = getStore();
  if (!store || !store.enabled) return () => undefined;
  if (store.observerAttached) return () => undefined;
  if (typeof PerformanceObserver === "undefined") return () => undefined;

  const observer = new PerformanceObserver((list) => {
    const target = getStore();
    if (!target || !target.enabled) return;
    for (const entry of list.getEntries()) {
      const longTask: PerfDebugLongTask = {
        name: entry.name || "longtask",
        durationMs: Number(entry.duration.toFixed(1)),
        startedAt: Number(entry.startTime.toFixed(1))
      };
      target.longTasks.push(longTask);
      trimBuffer(target.longTasks, 300);
      console.info("[perf-debug] long-task", longTask);
    }
  });

  try {
    observer.observe({ type: "longtask", buffered: true } as PerformanceObserverInit);
    store.observerAttached = true;
  } catch {
    return () => undefined;
  }

  return () => {
    observer.disconnect();
    const target = getStore();
    if (target) {
      target.observerAttached = false;
    }
  };
}

export function beginPerfInteraction(name: string, meta?: Record<string, unknown>) {
  const store = getStore();
  if (!store || !store.enabled) {
    return null;
  }

  const startedAt = performance.now();
  let closed = false;

  return (extraMeta?: Record<string, unknown>) => {
    if (closed) return;
    closed = true;
    const finishedAt = performance.now();
    const event: PerfDebugInteraction = {
      name,
      durationMs: Number((finishedAt - startedAt).toFixed(1)),
      startedAt: Number(startedAt.toFixed(1)),
      finishedAt: Number(finishedAt.toFixed(1)),
      meta: {
        ...(meta || {}),
        ...(extraMeta || {})
      }
    };
    store.interactions.push(event);
    trimBuffer(store.interactions, 300);
    console.info(`[perf-debug] ${name}`, event);
  };
}
