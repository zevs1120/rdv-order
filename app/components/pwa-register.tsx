"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    async function registerRuntime() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (cancelled) return;

        const timer = window.setInterval(() => {
          void registration.update().catch(() => undefined);
        }, 30 * 60 * 1000);

        return () => window.clearInterval(timer);
      } catch {
        // PWA support should never block ordering.
        return undefined;
      }
    }

    let cleanup: (() => void) | undefined;
    void registerRuntime().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
