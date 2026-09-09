"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "./i18n-provider";
import { SvgIcon } from "../../components/ui/svg-icon";
import {
  dispatchTopbarAction,
  RDV_TOPBAR_STATE_EVENT,
  resolveRefreshAction,
  type TopbarActionDetail,
  type TopbarStateDetail
} from "../../lib/topbar-events";

type BarMeta = {
  title: string;
  backHref: string | null;
};

function orderReturnHref(value?: string | null): string {
  if (!value?.startsWith("/order?")) return "/manage";
  const url = new URL(value, "https://local.invalid");
  if (url.origin !== "https://local.invalid" || url.pathname !== "/order" || !url.searchParams.get("tableNo")) return "/manage";
  const params = new URLSearchParams();
  for (const key of ["tableNo", "guests", "sessionId", "bill"]) {
    const item = url.searchParams.get(key);
    if (item) params.set(key, item);
  }
  return `/order?${params}`;
}

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
    { match: (value) => value === "/manage/orders", title: "订单记录", titleEn: "Order history", backHref: "/manage" },
    { match: (value) => value === "/manage/income", title: "收入", titleEn: "Revenue", backHref: "/manage" },
    { match: (value) => value === "/manage/fees", title: "费用", titleEn: "Fees", backHref: "/manage" },
    { match: (value) => value === "/manage/hot", title: "热销菜", titleEn: "Hot Items", backHref: "/manage" },
    { match: (value) => value === "/manage/devices", title: "打印机", titleEn: "Printers", backHref: "/manage" },
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
    backHref: pathname === "/manage/orders" ? orderReturnHref(searchParams?.get("returnTo")) : hit.backHref
  };
}

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { lang, setLang, t } = useI18n();
  const [routeState, setRouteState] = useState<TopbarStateDetail | null>(null);

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

  const barMeta = resolveBarMeta(pathname, lang, searchParams);
  if (pathname === "/order" && routeState?.route === "order" && routeState.tableNo === searchParams?.get("tableNo") && routeState.guestCount) {
    barMeta.title = lang === "en" ? `Table ${routeState.tableNo} · ${routeState.guestCount} Guests` : `桌号 ${routeState.tableNo} · ${routeState.guestCount} 人`;
  }
  const isTables = pathname === "/tables";
  const isOrder = pathname === "/order";
  const tablesSelectMode = isTables && routeState?.route === "tables" ? Boolean(routeState.selectMode) : false;
  const tablesSelectDisabled = isTables && routeState?.route === "tables" ? Boolean(routeState.disableMultiSelect) : false;
  const refreshAction = resolveRefreshAction(pathname);
  const extraTools = Number(Boolean(refreshAction)) + Number(isOrder);
  const toolsWidth = 44 * (1 + extraTools) + 10 * extraTools;

  return (
    <div className={`topbar-shell${isTables ? " topbar-shell--tables" : ""}`}>
      <div className="topbar-shell__inner" style={{ "--topbar-tools-width": `${toolsWidth}px` } as CSSProperties}>
        {isTables ? (
          <div className="topbar-table-heading">
            <div className="topbar-title">{barMeta.title}</div>
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

        </div>
      </div>
    </div>
  );
}
