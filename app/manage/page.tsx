"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../components/bottom-nav";
import ManageTabs from "../components/manage-tabs";
import { apiFetchJson, getStoredAuth } from "../../lib/client-api";
import { useI18n } from "../components/i18n-provider";
import { AppBar, Badge, Card, ListRow, Skeleton } from "../../components/ui";
import { rangeByPreset } from "../../lib/date-range";

type OrderSummaryRow = { amount: number };

type HotRow = { name: string; qty: number };

export default function ManageIndexPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [todayOrders, setTodayOrders] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [hotHint, setHotHint] = useState("");

  useEffect(() => {
    const { token, role: currentRole } = getStoredAuth();
    if (!token || (currentRole !== "manager" && currentRole !== "waiter")) {
      router.replace("/");
      return;
    }
    setRole(currentRole);
    void loadMetrics(currentRole);
  }, [router]);

  async function loadMetrics(currentRole: string) {
    setLoading(true);
    setError("");
    try {
      const range = rangeByPreset("today");
      const ordersResp = await apiFetchJson<{ orders: OrderSummaryRow[] }>(
        `/api/manage/orders?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`,
        { timeoutMs: 6000, retries: 1 }
      );
      const orders = ordersResp.orders || [];
      setTodayOrders(orders.length);
      setTodayRevenue(orders.reduce((sum, row) => sum + Number(row.amount || 0), 0));

      if (currentRole === "manager") {
        const hotResp = await apiFetchJson<{ hotItems: HotRow[] }>(
          `/api/manage/hot-items?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`,
          { timeoutMs: 6000, retries: 1 }
        );
        const top = (hotResp.hotItems || [])[0];
        if (top) {
          setHotHint(lang === "en" ? `${top.name} · ${top.qty} sold` : `${top.name} · ${top.qty} 份`);
        } else {
          setHotHint(lang === "en" ? "No hot item yet" : "暂无热销数据");
        }
      } else {
        setHotHint("");
      }
    } catch (err: any) {
      setError(err.message || (lang === "en" ? "Failed to load dashboard" : "加载管理首页失败"));
    } finally {
      setLoading(false);
    }
  }

  const entries = useMemo(() => {
    const managerEntries = [
      { href: "/manage/orders", label: t("manage.orders", "Orders"), desc: lang === "en" ? "View and handle order lifecycle" : "查看与处理订单流程" },
      { href: "/manage/income", label: t("manage.income", "Revenue"), desc: lang === "en" ? "Revenue and date-range report" : "营业额与时间段报表" },
      { href: "/manage/fees", label: t("manage.fees", "Fees"), desc: lang === "en" ? "Auto charge rules for all unpaid orders" : "未结账订单自动费用规则" },
      { href: "/manage/hot", label: t("manage.hot", "Hot Items"), desc: lang === "en" ? "Best selling dish analytics" : "热销菜统计" },
      { href: "/manage/devices", label: t("manage.devices", "Devices"), desc: lang === "en" ? "Printer and dispatch status" : "打印设备与派单状态" },
      { href: "/manage/rbac", label: t("manage.rbac", "Access"), desc: lang === "en" ? "Role permissions and control" : "角色权限与控制" },
      { href: "/admin/menu", label: t("manage.menu", "Menu"), desc: lang === "en" ? "Menu and category management" : "菜单与分类管理" }
    ];

    if (role === "manager") return managerEntries;
    return managerEntries.filter((entry) => entry.href === "/manage/orders");
  }, [lang, role, t]);

  return (
    <div className="stack manage-home-screen">
      <AppBar title={t("nav.manage", "Manage")} />
      <ManageTabs />

      <div className="manage-metric-grid">
        <Card>
          <div className="manage-metric-label">{lang === "en" ? "Today Orders" : "今日订单"}</div>
          <div className="manage-metric-value">{loading ? "--" : todayOrders}</div>
        </Card>
        <Card>
          <div className="manage-metric-label">{lang === "en" ? "Today Revenue" : "今日营业额"}</div>
          <div className="manage-metric-value">₱{loading ? "--" : todayRevenue}</div>
        </Card>
      </div>

      {role === "manager" ? (
        <Card>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="manage-metric-label">{t("manage.hot", "Hot Items")}</div>
            <Badge tone="brand">{lang === "en" ? "Today" : "今日"}</Badge>
          </div>
          <div className="manage-metric-note">{loading ? (lang === "en" ? "Loading..." : "加载中...") : hotHint || "-"}</div>
        </Card>
      ) : null}

      {error ? <div className="muted">{error}</div> : null}

      <Card>
        <div className="stack" style={{ gap: 8 }}>
          {loading ? (
            <>
              <Skeleton h={58} />
              <Skeleton h={58} />
              <Skeleton h={58} />
            </>
          ) : (
            entries.map((entry) => (
              <ListRow
                key={entry.href}
                title={entry.label}
                subtitle={entry.desc}
                trailing={lang === "en" ? "Open" : "进入"}
                onClick={() => router.push(entry.href)}
              />
            ))
          )}
        </div>
      </Card>

      <BottomNav />
    </div>
  );
}
