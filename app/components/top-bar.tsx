"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "./i18n-provider";
import { createDebounced } from "../../lib/scheduler";
import {
  dispatchTopbarAction,
  RDV_TOPBAR_STATE_EVENT,
  type TopbarActionDetail,
  type TopbarStateDetail
} from "../../lib/topbar-events";

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

type BarMeta = {
  title: string;
  backHref: string | null;
};

function resolveBarMeta(pathname: string, lang: "zh" | "en", searchParams: URLSearchParams | null): BarMeta {
  if (pathname === "/tables") {
    return {
      title: lang === "en" ? "Select Table" : "请选择桌号",
      backHref: null
    };
  }

  if (pathname === "/order") {
    const tableNo = searchParams?.get("tableNo") || "";
    const guests = searchParams?.get("guests") || "";
    const tableLabel = tableNo
      ? (lang === "en" ? `Table ${tableNo}` : `桌号 ${tableNo}`)
      : (lang === "en" ? "New Order" : "新订单");
    const guestLabel = guests
      ? (lang === "en" ? `${guests} Guests` : `${guests} 人`)
      : "";
    return {
      title: guestLabel ? `${tableLabel} · ${guestLabel}` : tableLabel,
      backHref: "/tables"
    };
  }

  if (pathname === "/manage") {
    return {
      title: lang === "en" ? "Manage" : "管理",
      backHref: null
    };
  }

  if (pathname === "/summary") {
    return {
      title: lang === "en" ? "Summary" : "汇总",
      backHref: "/manage"
    };
  }

  const map: Array<{ match: (value: string) => boolean; title: string; titleEn: string; backHref: string | null }> = [
    { match: (value) => value === "/manage/orders", title: "订单", titleEn: "Orders", backHref: "/manage" },
    { match: (value) => value === "/manage/income", title: "收入", titleEn: "Revenue", backHref: "/manage" },
    { match: (value) => value === "/manage/fees", title: "费用", titleEn: "Fees", backHref: "/manage" },
    { match: (value) => value === "/manage/hot", title: "热销菜", titleEn: "Hot Items", backHref: "/manage" },
    { match: (value) => value === "/manage/devices", title: "设备", titleEn: "Devices", backHref: "/manage" },
    { match: (value) => value === "/manage/rbac", title: "权限", titleEn: "Access", backHref: "/manage" },
    { match: (value) => value.startsWith("/admin/menu"), title: "菜单管理", titleEn: "Menu", backHref: "/manage" }
  ];

  const hit = map.find((item) => item.match(pathname));
  if (!hit) {
    return {
      title: "",
      backHref: null
    };
  }

  return {
    title: lang === "en" ? hit.titleEn : hit.title,
    backHref: hit.backHref
  };
}

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { lang, setLang, t } = useI18n();
  const [online, setOnline] = useState(true);
  const [weak, setWeak] = useState(false);
  const [routeState, setRouteState] = useState<TopbarStateDetail | null>(null);

  useEffect(() => {
    const applyOnlineSnapshot = () => {
      setOnline(true);
      setWeak(detectWeakConnection());
    };
    const applyOfflineSnapshot = () => {
      setOnline(false);
      setWeak(false);
    };
    const onOnline = createDebounced(applyOnlineSnapshot, 120);
    const onOffline = createDebounced(applyOfflineSnapshot, 100);
    const onConnChange = createDebounced(() => {
      if (!navigator.onLine) return;
      setWeak(detectWeakConnection());
    }, 140);

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
      onOnline.cancel();
      onOffline.cancel();
      onConnChange.cancel();
    };
  }, []);

  useEffect(() => {
    setRouteState(null);
  }, [pathname]);

  useEffect(() => {
    function onState(event: Event) {
      const custom = event as CustomEvent<TopbarStateDetail>;
      setRouteState(custom.detail || null);
    }
    window.addEventListener(RDV_TOPBAR_STATE_EVENT, onState as EventListener);
    return () => window.removeEventListener(RDV_TOPBAR_STATE_EVENT, onState as EventListener);
  }, []);

  const netState = useMemo<NetState>(() => {
    if (!online) return "offline";
    if (weak) return "weak";
    return "online";
  }, [online, weak]);

  const barMeta = useMemo(
    () => resolveBarMeta(pathname, lang, searchParams),
    [lang, pathname, searchParams]
  );
  const dotState = netState === "online" ? "online" : "offline";
  const netText = dotState === "online"
    ? t("network.online", "Online")
    : t("network.offline", "Offline");
  const isTables = pathname === "/tables";
  const isOrder = pathname === "/order";
  const tablesSelectMode = isTables && routeState?.route === "tables" ? Boolean(routeState.selectMode) : false;
  const tablesSelectDisabled = isTables && routeState?.route === "tables" ? Boolean(routeState.disableMultiSelect) : false;

  return (
    <div className="topbar-shell">
      <div className="topbar-shell__inner">
        <div className="topbar-side topbar-side--left">
          {barMeta.backHref ? (
            <button
              type="button"
              className="topbar-btn topbar-btn--back"
              onClick={() => router.push(barMeta.backHref!)}
              aria-label={lang === "en" ? "Back" : "返回"}
            >
              <span className="topbar-back-chevron" aria-hidden="true">‹</span>
              <span>{lang === "en" ? "Back" : "返回"}</span>
            </button>
          ) : (
            <span className="topbar-side-placeholder" aria-hidden="true" />
          )}
        </div>

        <div className="topbar-title" aria-live="polite">
          {barMeta.title}
        </div>

        <div className="topbar-side topbar-side--right">
          {isTables ? (
            <>
              <button
                type="button"
                className={`topbar-btn topbar-btn--icon ${tablesSelectMode ? "topbar-btn--active" : ""}`}
                onClick={() => dispatchTopbarAction({ action: "tables-toggle-select" })}
                disabled={tablesSelectDisabled}
                aria-label={tablesSelectMode ? (lang === "en" ? "Done" : "完成") : (lang === "en" ? "Multi-select" : "拼桌选择")}
                title={tablesSelectMode ? (lang === "en" ? "Done" : "完成") : (lang === "en" ? "Multi-select" : "拼桌选择")}
              >
                {tablesSelectMode ? (
                  <svg viewBox="0 0 24 24" className="topbar-icon" aria-hidden="true">
                    <path
                      d="M6 12.5 10 16l8-8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="topbar-icon" aria-hidden="true">
                    <path
                      d="M4 7.5A1.5 1.5 0 0 1 5.5 6H11v5.5A1.5 1.5 0 0 1 9.5 13h-4A1.5 1.5 0 0 1 4 11.5v-4Zm9 0A1.5 1.5 0 0 1 14.5 6h4A1.5 1.5 0 0 1 20 7.5v4A1.5 1.5 0 0 1 18.5 13H13V7.5Zm-9 9A1.5 1.5 0 0 1 5.5 15h4A1.5 1.5 0 0 1 11 16.5V22H5.5A1.5 1.5 0 0 1 4 20.5v-4Zm9 0A1.5 1.5 0 0 1 14.5 15h4A1.5 1.5 0 0 1 20 16.5v4A1.5 1.5 0 0 1 18.5 22h-4A1.5 1.5 0 0 1 13 20.5v-4Z"
                      fill="currentColor"
                    />
                  </svg>
                )}
              </button>
            </>
          ) : null}

          {isOrder ? (
            <button
              type="button"
              className="topbar-btn topbar-btn--icon"
              onClick={() => dispatchTopbarAction({ action: "order-open-actions" })}
              aria-label={lang === "en" ? "Actions" : "操作"}
              title={lang === "en" ? "Actions" : "操作"}
            >
              <svg viewBox="0 0 24 24" className="topbar-icon" aria-hidden="true">
                <path
                  d="M12 7.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Zm0 6a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Zm0 6a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          ) : null}

          <button
            type="button"
            className="topbar-btn topbar-btn--icon"
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            aria-label={lang === "zh" ? "Switch to English" : "切换到中文"}
            title={lang === "zh" ? "Switch to English" : "切换到中文"}
          >
            <svg viewBox="0 0 24 24" className="topbar-icon" aria-hidden="true">
              <path
                d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9Zm5.92 8h-3.06a14.7 14.7 0 0 0-1.18-4.05A7.04 7.04 0 0 1 17.92 11Zm-5.92 8c-.78 0-1.93-1.95-2.35-5h4.7c-.42 3.05-1.57 5-2.35 5Zm-2.64-7A19.7 19.7 0 0 1 9.4 9h5.2c.1.97.1 2.03 0 3h-5.2Zm-4.28 0c.12-1.43.66-2.75 1.5-3.83.34.28.92.58 1.71.83A21.9 21.9 0 0 0 8.22 12H5.08Zm0 2h3.14c.13 1.06.39 2.08.77 3-.79.25-1.37.55-1.71.83A6.96 6.96 0 0 1 5.08 14Zm2.23 4.05c.34-.28.92-.58 1.71-.83.3.8.69 1.56 1.18 2.23a7.04 7.04 0 0 1-2.89-1.4ZM9.14 11H6.08a7.04 7.04 0 0 1 2.89-4.05A14.7 14.7 0 0 0 9.14 11Zm4.66 8.45c.49-.67.88-1.43 1.18-2.23.79.25 1.37.55 1.71.83a7.04 7.04 0 0 1-2.89 1.4ZM15.78 14c-.13 1.06-.39 2.08-.77 3 .79.25 1.37.55 1.71.83A6.96 6.96 0 0 0 18.92 14h-3.14Zm.01-2c.03-.49.05-.99.05-1.5s-.02-1.01-.05-1.5h3.13c.05.49.08.99.08 1.5s-.03 1.01-.08 1.5h-3.13Z"
                fill="currentColor"
              />
            </svg>
          </button>
          <span
            className={`topbar-status-dot topbar-status-dot--${dotState}`}
            aria-label={netText}
            title={netText}
          />
        </div>
      </div>
    </div>
  );
}
