"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    async function cleanupLegacyPwaRuntime() {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (!cancelled) {
          await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
        }
      } catch {
        // Ignore service worker cleanup failures.
      }

      if (!("caches" in window) || cancelled) return;
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith("rdv-"))
            .map((key) => caches.delete(key))
        );
      } catch {
        // Ignore cache cleanup failures.
      }
    }

    void cleanupLegacyPwaRuntime();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
