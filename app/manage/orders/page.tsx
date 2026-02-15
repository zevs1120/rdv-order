"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../../components/bottom-nav";
import ManageTabs from "../../components/manage-tabs";
import { apiFetchJson, getStoredAuth } from "../../../lib/client-api";
import { useI18n } from "../../components/i18n-provider";
import { localizeMenuText } from "../../../lib/menu-text";

type OrderItemDetail = {
  menu_item_id: string;
  name: string;
  qty: number;
  unit_price: number;
  amount: number;
};

type OrderRow = {
  id: string;
  table_no: string;
  status: string;
  created_at: string;
  item_qty: number;
  amount: number;
  items: OrderItemDetail[];
};

function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

export default function ManageOrdersPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [role, setRole] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const totalAmount = orders.reduce((sum, item) => sum + (item.amount || 0), 0);

  async function loadTodayOrders() {
    setLoading(true);
    setError("");
    try {
      const { token, role: currentRole } = getStoredAuth();
      setRole(currentRole);
      if (!token || (currentRole !== "manager" && currentRole !== "waiter")) {
        router.replace("/");
        return;
      }

      const range = todayRange();
      const body = await apiFetchJson<{ orders: OrderRow[]; viewerRole?: string }>(
        `/api/manage/orders?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
        { timeoutMs: 6000, retries: 1 }
      );
      if (body.viewerRole) {
        setRole(body.viewerRole);
      }
      setOrders(body.orders || []);
    } catch (err: any) {
      if (err.message === "未登录") {
        router.replace("/");
        return;
      }
      setError(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function deleteOrder(orderId: string) {
    if (role !== "manager") return;
    const ok = window.confirm(`确认删除订单 ${orderId.slice(0, 8)} 吗？`);
    if (!ok) return;

    setDeletingId(orderId);
    setError("");
    try {
      await apiFetchJson(`/api/orders/${orderId}`, {
        method: "DELETE",
        timeoutMs: 7000,
        retries: 0
      });
      setOrders((prev) => prev.filter((item) => item.id !== orderId));
    } catch (err: any) {
      setError(err.message || "删除失败");
    } finally {
      setDeletingId("");
    }
  }

  useEffect(() => {
    void loadTodayOrders();
  }, []);

  return (
    <div className="stack">
      <header>
        <h1>{t("orders.title", "管理")}</h1>
        <div className="row">
          <button className="secondary compact-btn" type="button" onClick={() => { void loadTodayOrders(); }}>
            {t("common.refresh", "刷新")}
          </button>
        </div>
      </header>

      <ManageTabs />

      <div className="panel stack">
        <h3 style={{ margin: 0 }}>{t("orders.todayAll", "今天所有订单")}</h3>
        {loading ? <div className="muted">{t("common.loading", "加载中...")}</div> : null}
        {error ? <div className="muted">{error}</div> : null}
        {!loading && !error ? (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{t("orders.totalCount", "订单总数")}：{orders.length}</strong>
            <strong>{t("orders.totalRevenue", "今日营业额")}：₱{totalAmount}</strong>
          </div>
        ) : null}
        {!loading && !error && orders.length === 0 ? <div className="muted">{t("orders.empty", "今天暂无订单")}</div> : null}
        <div className="order-list">
          {orders.map((order) => {
            const opened = Boolean(expanded[order.id]);
            return (
              <div key={order.id} className="menu-item stack">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{order.table_no}</strong>
                  <span className="tag">₱{order.amount}</span>
                </div>
                <div className="muted">#{order.id.slice(0, 8)} · {new Date(order.created_at).toLocaleString()}</div>
                <div className="muted">x{order.item_qty} · {order.status}</div>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <button
                    className="secondary compact-btn"
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [order.id]: !opened }))}
                  >
                    {opened ? t("orders.hideDetail", "收起") : t("orders.detail", "详情")}
                  </button>
                  {role === "manager" ? (
                    <button
                      className="secondary compact-btn"
                      type="button"
                      onClick={() => { void deleteOrder(order.id); }}
                      disabled={deletingId === order.id}
                    >
                      {deletingId === order.id ? t("orders.deleting", "删除中...") : t("orders.delete", "删除订单")}
                    </button>
                  ) : null}
                </div>
                {opened ? (
                  <div className="order-detail-list">
                    {(order.items || []).map((item) => (
                      <div key={`${order.id}-${item.menu_item_id}`} className="row" style={{ justifyContent: "space-between" }}>
                        <div>{localizeMenuText(item.name, lang)} x{item.qty}</div>
                        <div>₱{item.amount}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
