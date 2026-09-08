"use client";

import { useEffect, useRef, useState } from "react";
import { CONNECTION_REFRESH_EVENT } from "./connection";

// Only pass a read operation. Defer recovery while the page is busy or has unsaved edits.
export function useConnectionRefresh(refresh: () => unknown, enabled = true) {
  const latest = useRef(refresh);
  latest.current = refresh;
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const recover = () => setPending(true);
    window.addEventListener(CONNECTION_REFRESH_EVENT, recover);
    return () => window.removeEventListener(CONNECTION_REFRESH_EVENT, recover);
  }, []);
  useEffect(() => {
    if (!pending || !enabled) return;
    setPending(false);
    void latest.current();
  }, [pending, enabled]);
}
