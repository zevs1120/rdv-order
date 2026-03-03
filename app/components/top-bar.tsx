"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { lang, setLang, t } = useI18n();
  const [openMenu, setOpenMenu] = useState(false);
  const [online, setOnline] = useState(true);
  const [weak, setWeak] = useState(false);
  const isLogin = pathname === "/";

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
      if (navigator.onLine) setWeak(detectWeakConnection());
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

  useEffect(() => {
    setOpenMenu(false);
  }, [pathname]);

  const netState = useMemo<NetState>(() => {
    if (!online) return "offline";
    if (weak) return "weak";
    return "online";
  }, [online, weak]);

  const netText = netState === "offline"
    ? t("network.offline", "Offline")
    : netState === "weak"
      ? t("network.weak", "Weak")
      : t("network.online", "Online");

  function logout() {
    localStorage.removeItem("rdv_token");
    localStorage.removeItem("rdv_role");
    localStorage.removeItem("rdv_recent_table");
    localStorage.removeItem("rdv_recent_guests");
    router.replace("/");
  }

  return (
    <>
      <div className="topbar-shell">
        <div className="topbar-shell__inner">
          <div className={`topbar-net-pill ${netState}`}>
            {netText}
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="topbar-btn"
              onClick={() => setLang(lang === "zh" ? "en" : "zh")}
              aria-label="toggle language"
            >
              {t("lang.toggle", lang === "zh" ? "EN" : "中")}
            </button>

            {!isLogin ? (
              <div className="topbar-menu-wrap">
                <button
                  type="button"
                  className="topbar-btn"
                  onClick={() => setOpenMenu((v) => !v)}
                  aria-expanded={openMenu}
                  aria-haspopup="menu"
                >
                  {t("common.more", "More")}
                </button>
                {openMenu ? (
                  <div className="topbar-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => router.refresh()}>
                      {t("common.refresh", "Refresh")}
                    </button>
                    <button type="button" role="menuitem" onClick={logout}>
                      {t("common.logout", "Logout")}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {netState === "offline" ? (
        <div className="topbar-offline-banner">
          {lang === "en" ? "Offline mode: use handwritten backup if needed." : "当前离线：必要时请使用手写单。"}
        </div>
      ) : null}
    </>
  );
}
