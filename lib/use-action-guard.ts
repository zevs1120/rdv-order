"use client";

import { useCallback, useRef } from "react";

export function useActionGuard(intervalMs = 450) {
  const lastAtRef = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - lastAtRef.current < intervalMs) {
      return false;
    }
    lastAtRef.current = now;
    return true;
  }, [intervalMs]);
}
