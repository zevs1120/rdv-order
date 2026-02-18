"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "./i18n-provider";

type NetState = "online" | "weak" | "offline";

function detectWeakConnection() {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      saveData?: boolean;
      rtt?: number;
      downlink?: number;
      addEventListener?: (type: "change", cb: () => void) => void;
      removeEventListener?: (type: "change", cb: () => void) => void;
    };
  };
  const connection = nav.connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  if (connection.effectiveType === "slow-2g" || connection.effectiveType === "2g") return true;
  if (typeof connection.rtt === "number" && connection.rtt > 380) return true;
  if (typeof connection.downlink === "number" && connection.downlink > 0 && connection.downlink < 1.2) return true;
  return false;
}

export default function NetworkStatusBar() {
  const { t } = useI18n();
  const [online, setOnline] = useState(true);
  const [weak, setWeak] = useState(false);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      setWeak(detectWeakConnection());
    };
    const onOffline = () => {
      setOnline(false);
      setWeak(false);
    };
    const onConnChange = () => {
      if (navigator.onLine) {
        setWeak(detectWeakConnection());
      }
    };

    setOnline(navigator.onLine);
    setWeak(navigator.onLine && detectWeakConnection());
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const nav = navigator as Navigator & {
      connection?: {
        addEventListener?: (type: "change", cb: () => void) => void;
        removeEventListener?: (type: "change", cb: () => void) => void;
      };
    };
    nav.connection?.addEventListener?.("change", onConnChange);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      nav.connection?.removeEventListener?.("change", onConnChange);
    };
  }, []);

  const state = useMemo<NetState>(() => {
    if (!online) return "offline";
    if (weak) return "weak";
    return "online";
  }, [online, weak]);

  const text = state === "offline"
    ? t("network.offline", "离线")
    : state === "weak"
      ? t("network.weak", "弱网")
      : t("network.online", "在线");

  return (
    <div className={`network-status ${state}`} role="status" aria-live="polite">
      <span>{t("network.label", "网络")}:</span>
      <strong>{text}</strong>
    </div>
  );
}

