import type { ProfilerOnRenderCallback } from "react";

type ReactProfileEntry = {
  id: string;
  phase: "mount" | "update" | "nested-update";
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
};

declare global {
  interface Window {
    __rdvReactProfiler?: ReactProfileEntry[];
  }
}

function canCapture() {
  return process.env.NODE_ENV !== "production" && typeof window !== "undefined";
}

export const captureReactProfile: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime
) => {
  if (!canCapture()) return;
  const bucket = window.__rdvReactProfiler || [];
  bucket.push({
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime
  });
  // Keep a bounded history to avoid memory growth during long sessions.
  if (bucket.length > 2000) {
    bucket.splice(0, bucket.length - 2000);
  }
  window.__rdvReactProfiler = bucket;
};

export function resetReactProfileCapture() {
  if (!canCapture()) return;
  window.__rdvReactProfiler = [];
}
