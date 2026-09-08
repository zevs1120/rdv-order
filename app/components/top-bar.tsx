"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "./i18n-provider";
import { SvgIcon } from "../../components/ui/svg-icon";
import { createDebounced } from "../../lib/scheduler";
import {
  dispatchTopbarAction,
  RDV_TOPBAR_STATE_EVENT,
  resolveRefreshAction,
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
      title: lang === "en" ? "Settings" : "设置",
      backHref: "/tables"
    };
  }

  if (pathname === "/summary") {
    return {
      title: lang === "en" ? "Summary" : "汇总",
      backHref: "/manage"
    };
  }

  const map: Array<{ match: (value: string) => boolean; title: string; titleEn: string; backHref: string | null }> = [
    { match: (value) => value === "/manage/updates", title: "更新管理", titleEn: "Updates", backHref: "/manage" },
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
  const netText = t(`network.${netState}`, netState === "online" ? "Online" : netState === "weak" ? "Weak" : "Offline");
  const isTables = pathname === "/tables";
  const isOrder = pathname === "/order";
  const tablesSelectMode = isTables && routeState?.route === "tables" ? Boolean(routeState.selectMode) : false;
  const tablesSelectDisabled = isTables && routeState?.route === "tables" ? Boolean(routeState.disableMultiSelect) : false;
  const refreshAction = resolveRefreshAction(pathname);

  return (
    <div className={`topbar-shell${isTables ? " topbar-shell--tables" : ""}`}>
      <div className="topbar-shell__inner">
        {isTables ? (
          <div className="topbar-table-heading">
            <div className="topbar-title">{barMeta.title}</div>
            <div className={`topbar-table-status topbar-status-dot--${netState}`} role="status" aria-live="polite" aria-atomic="true">
              <SvgIcon name="circle" />
              <span>{netText}</span>
            </div>
          </div>
        ) : (
          <>
        <div className="topbar-side topbar-side--left">
          {barMeta.backHref ? (
            <button
              type="button"
              className="topbar-btn topbar-btn--back"
              onClick={() => router.push(barMeta.backHref!)}
              aria-label={lang === "en" ? "Back" : "返回"}
            >
              <SvgIcon name="chevron-left" className="topbar-icon" />
              <span>{lang === "en" ? "Back" : "返回"}</span>
            </button>
          ) : (
            <span className="topbar-side-placeholder" aria-hidden="true" />
          )}
        </div>

        <div className="topbar-title" aria-live="polite">
          {barMeta.title}
        </div>
          </>
        )}

        <div className="topbar-side topbar-side--right">
          {refreshAction ? (
            <button
              type="button"
              className="topbar-btn topbar-btn--icon"
              onClick={() => dispatchTopbarAction({ action: refreshAction })}
              aria-label={t("common.refresh", "Refresh")}
              title={t("common.refresh", "Refresh")}
            >
              <SvgIcon name="refresh-cw" className="topbar-icon" />
            </button>
          ) : null}

          {isTables ? (
            <>
              <button
                type="button"
                className={`topbar-btn topbar-btn--icon ${tablesSelectMode ? "topbar-btn--active" : ""}`}
                onClick={() => dispatchTopbarAction({ action: "tables-toggle-select" })}
                disabled={tablesSelectDisabled}
                aria-pressed={tablesSelectMode}
                aria-label={tablesSelectMode ? (lang === "en" ? "Done" : "完成") : (lang === "en" ? "Multi-select" : "拼桌选择")}
                title={tablesSelectMode ? (lang === "en" ? "Done" : "完成") : (lang === "en" ? "Multi-select" : "拼桌选择")}
              >
                {tablesSelectMode ? (
                  <SvgIcon name="check" className="topbar-icon" />
                ) : (
                  <SvgIcon name="grid-2x2" className="topbar-icon" />
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
              <SvgIcon name="ellipsis-vertical" className="topbar-icon" />
            </button>
          ) : null}

          <button
            type="button"
            className="topbar-btn topbar-btn--icon"
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            aria-label={lang === "zh" ? "Switch to English" : "切换到中文"}
            title={lang === "zh" ? "Switch to English" : "切换到中文"}
          >
            <SvgIcon name="globe" className="topbar-icon" />
          </button>
          {!isTables && <span
            role="img"
            className={`topbar-status-dot topbar-status-dot--${netState}`}
            aria-label={netText}
            title={netText}
          ><SvgIcon name="circle" /></span>}
        </div>
      </div>
    </div>
  );
}
