"use client";

// Connection recovery never replays a business request. Only the uncached probe is retried.
export const CONNECTION_REFRESH_EVENT = "rdv:connection-refresh";
type Snapshot = { disconnected: boolean; checking: boolean };
const idle: Snapshot = { disconnected: false, checking: false };
let snapshot = idle;
const listeners = new Set<() => void>();
let active = false;
let lifecycleGeneration = 0;
let sequence = 0;
let lastResponse = 0;
let failures = 0;
let recovering = false;
let wakeRequested = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let probe: AbortController | undefined;
let retryStep = 0;
const isHidden = () => document.visibilityState === "hidden";
const retryDelays = [1000, 2000, 5000, 10000, 30000];

function publish(next: Snapshot) {
  if (snapshot.disconnected === next.disconnected && snapshot.checking === next.checking) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}
export const connectionSnapshot = () => snapshot;
export const serverConnectionSnapshot = () => idle;
export function subscribeConnection(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function beginConnectionRequest() { return ++sequence; }
export function connectionResponded(request: number, refreshReads = false) {
  if (request < lastResponse) return;
  lastResponse = request;
  const restored = recovering && failures > 0;
  failures = 0;
  recovering = false;
  wakeRequested = false;
  retryStep = 0;
  clearTimeout(timer);
  timer = undefined;
  publish(idle);
  if (restored && refreshReads && active) {
    // Let the request finish updating its page before asking it to refresh.
    queueMicrotask(() => {
      if (active && !isHidden()) window.dispatchEvent(new Event(CONNECTION_REFRESH_EVENT));
    });
  }
}
export function connectionFailed(request: number) {
  if (request < lastResponse) return;
  recovering = true;
  scheduleProbe(800);
}
function scheduleProbe(delay: number) {
  if (!active || isHidden() || timer || probe) return;
  timer = setTimeout(() => { timer = undefined; void retryConnection(); }, delay);
}
export async function retryConnection() {
  if (!active || isHidden() || probe) return;
  clearTimeout(timer);
  timer = undefined;
  const generation = lifecycleGeneration;
  const controller = new AbortController();
  probe = controller;
  const request = beginConnectionRequest();
  publish({ ...snapshot, checking: true });
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch("/api/connectivity", {
      cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal
    });
    if (!response.ok || (await response.json()).service !== "rdv-order") throw new Error("Unreachable");
    if (generation === lifecycleGeneration) connectionResponded(request, true);
  } catch {
    // Background cancellation and failures superseded by a newer response are not outages.
    if (!active || generation !== lifecycleGeneration || isHidden() || request < lastResponse) return;
    recovering = true;
    failures += 1;
    publish({ disconnected: failures >= 2 || snapshot.disconnected, checking: false });
  } finally {
    clearTimeout(timeout);
    if (probe === controller) probe = undefined;
    publish({ ...snapshot, checking: false });
    if (wakeRequested) { wakeRequested = false; scheduleProbe(350); }
    else if (recovering) scheduleProbe(retryDelays[Math.min(retryStep++, retryDelays.length - 1)]);
  }
}
export function startConnectionMonitoring() {
  active = true;
  let hiddenAt = 0;
  const changed = () => {
    clearTimeout(timer);
    timer = undefined;
    if (probe) wakeRequested = true;
    else scheduleProbe(350);
  };
  const visibility = () => {
    if (isHidden()) {
      hiddenAt = Date.now();
      lifecycleGeneration++;
      clearTimeout(timer);
      timer = undefined;
      probe?.abort();
      return;
    }
    changed();
    if (hiddenAt && Date.now() - hiddenAt >= 30000 && !recovering) {
      window.dispatchEvent(new Event(CONNECTION_REFRESH_EVENT));
    }
    hiddenAt = 0;
  };
  window.addEventListener("online", changed);
  window.addEventListener("offline", changed);
  document.addEventListener("visibilitychange", visibility);
  changed();
  return () => {
    active = false;
    lifecycleGeneration++;
    clearTimeout(timer);
    timer = undefined;
    probe?.abort();
    window.removeEventListener("online", changed);
    window.removeEventListener("offline", changed);
    document.removeEventListener("visibilitychange", visibility);
  };
}
