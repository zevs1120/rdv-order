"use client";

type StorageKind = "local" | "session";

function getStorage(kind: StorageKind) {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function safeStorageGet(kind: StorageKind, key: string) {
  try {
    return getStorage(kind)?.getItem(key) || "";
  } catch {
    return "";
  }
}

export function safeStorageSet(kind: StorageKind, key: string, value: string) {
  try {
    getStorage(kind)?.setItem(key, value);
  } catch {
    // Storage can be disabled or full on older Android WebViews.
  }
}

export function safeStorageRemove(kind: StorageKind, key: string) {
  try {
    getStorage(kind)?.removeItem(key);
  } catch {
    // Ignore storage failures; app state should remain usable in memory.
  }
}

export function safeStorageClear(kind: StorageKind) {
  try {
    getStorage(kind)?.clear();
  } catch {
    // Ignore storage failures.
  }
}
