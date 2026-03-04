"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../../components/bottom-nav";
import { apiFetchJson, getStoredAuth } from "../../../lib/client-api";
import { useI18n } from "../../components/i18n-provider";
import { localizeMenuText } from "../../../lib/menu-text";
import { useActionGuard } from "../../../lib/use-action-guard";
import { type PresetKey, rangeByPreset, toDateInput } from "../../../lib/date-range";
import { AppBar, Button } from "../../../components/ui";

type OrderItemDetail = {
  menu_item_id: string;
  name: string;
  qty: number;
  note?: string | null;
  unit_price: number;
  amount: number;
};

type OrderRow = {
  id: string;
  table_no: string;
  status: string;
  cancelled_at: string | null;
  created_at: string;
  item_qty: number;
  charge_amount: number;
  amount: number;
  items: OrderItemDetail[];
};

export default function ManageOrdersPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [role, setRole] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [preset, setPreset] = useState<PresetKey>("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sectionOpen, setSectionOpen] = useState(true);
  const canRunAction = useActionGuard();

  const quickButtons: Array<{ key: PresetKey; label: string }> = useMemo(
    () => [
      { key: "today", label: t("income.today", "当天") },
      { key: "yesterday", label: t("income.yesterday", "昨天") },
      { key: "week", label: t("income.week", "过去一周") },
      { key: "month", label: t("income.month", "过去一月") },
      { key: "3months", label: t("income.threeMonths", "过去三月") },
      { key: "year", label: t("income.year", "过去一年") }
    ],
    [t]
  );

  function getCurrentRange() {
    if (!fromDate || !toDate) return null;
    const from = new Date(`${fromDate}T00:00:00`);
    const to = new Date(`${toDate}T23:59:59`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    return { from, to };
  }

  function statusLabel(order: OrderRow) {
    if (order.cancelled_at) {
      return lang === "en" ? "Cancelled" : "已取消";
    }
    if (order.status === "submitted") {
      return lang === "en" ? "Submitted" : "已提交";
    }
    if (order.status === "paid") {
      return lang === "en" ? "Paid" : "已结账";
    }
    if (order.status === "closed") {
      return lang === "en" ? "Closed" : "已关闭";
    }
    return order.status;
  }

  async function loadOrders(from: Date, to: Date, tableNoOverride?: string) {
    setLoading(true);
    setError("");
    try {
      const { token, role: currentRole } = getStoredAuth();
      setRole(currentRole);
      if (!token || (currentRole !== "manager" && currentRole !== "waiter")) {
        router.replace("/");
        return;
      }

      const tableNo = (tableNoOverride ?? tableFilter).trim();
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString()
      });
      if (tableNo) {
        params.set("tableNo", tableNo);
      }

      const body = await apiFetchJson<{ orders: OrderRow[]; viewerRole?: string }>(
        `/api/manage/orders?${params.toString()}`,
        { timeoutMs: 6000, retries: 1 }
      );
      if (body.viewerRole) {
        setRole(body.viewerRole);
      }
      setOrders(body.orders || []);
    } catch (err: any) {
      if (err.message === "未登录" || err.message === "Not signed in") {
        router.replace("/");
        return;
      }
      setError(err.message || t("orders.loadFailed", "Failed to load orders"));
    } finally {
      setLoading(false);
    }
  }

  async function reloadWithCurrentRange() {
    const range = getCurrentRange();
    if (!range) return;
    await loadOrders(range.from, range.to);
  }

  async function deleteOrder(orderId: string) {
    if (!canRunAction()) return;
    if (role !== "manager") return;
    const ok = window.confirm(
      lang === "en"
        ? `Delete order ${orderId.slice(0, 8)}?`
        : `确认删除订单 ${orderId.slice(0, 8)} 吗？`
    );
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
      setError(err.message || t("orders.deleteFailed", "Failed to delete order"));
    } finally {
      setDeletingId("");
    }
  }

  async function cancelOrder(orderId: string) {
    if (!canRunAction()) return;
    const reason = window.prompt(t("orders.cancelReasonPrompt", "Cancel reason"));
    if (!reason) return;
    setWorkingId(orderId);
    setError("");
    try {
      setOrders((prev) =>
        prev.map((row) =>
          row.id === orderId
            ? { ...row, status: "closed", cancelled_at: new Date().toISOString(), amount: 0, charge_amount: 0 }
            : row
        )
      );
      await apiFetchJson(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        body: { reason },
        timeoutMs: 7000,
        retries: 0
      });
      await reloadWithCurrentRange();
    } catch (err: any) {
      setError(err.message || t("orders.cancelFailed", "Failed to cancel order"));
    } finally {
      setWorkingId("");
    }
  }

  async function applyCharge(orderId: string, type: "discount" | "service_fee") {
    if (!canRunAction()) return;

    setWorkingId(orderId);
    setError("");
    try {
      await apiFetchJson(`/api/orders/${orderId}/charges`, {
        method: "POST",
        body: { type },
        timeoutMs: 7000,
        retries: 0
      });
      await reloadWithCurrentRange();
    } catch (err: any) {
      setError(err.message || t("orders.adjustFailed", "Failed to adjust order"));
    } finally {
      setWorkingId("");
    }
  }

  async function splitOne(orderId: string, menuItemId: string) {
    if (!canRunAction()) return;
    setWorkingId(orderId);
    setError("");
    try {
      await apiFetchJson(`/api/orders/${orderId}/split`, {
        method: "POST",
        body: { items: [{ menuItemId, qty: 1 }] },
        timeoutMs: 8000,
        retries: 0
      });
      await reloadWithCurrentRange();
    } catch (err: any) {
      setError(err.message || t("orders.splitFailed", "Failed to split order"));
    } finally {
      setWorkingId("");
    }
  }

  async function mergeTo(targetOrderId: string, sourceOrderId: string) {
    if (!canRunAction()) return;
    setWorkingId(sourceOrderId);
    setError("");
    try {
      await apiFetchJson("/api/orders/merge", {
        method: "POST",
        body: {
          targetOrderId,
          sourceOrderIds: [sourceOrderId]
        },
        timeoutMs: 8000,
        retries: 0
      });
      await reloadWithCurrentRange();
    } catch (err: any) {
      setError(err.message || t("orders.mergeFailed", "Failed to merge order"));
    } finally {
      setWorkingId("");
    }
  }

  async function returnOne(orderId: string, menuItemId: string) {
    if (!canRunAction()) return;
    setWorkingId(orderId);
    setError("");
    try {
      await apiFetchJson(`/api/orders/${orderId}/return-item`, {
        method: "POST",
        body: {
          menuItemId,
          qty: 1,
          reason: "manual"
        },
        timeoutMs: 7000,
        retries: 0
      });
      await reloadWithCurrentRange();
    } catch (err: any) {
      setError(err.message || t("orders.returnFailed", "Failed to return item"));
    } finally {
      setWorkingId("");
    }
  }

  async function reverseCheckout(tableNo: string) {
    if (!canRunAction()) return;
    const reason = window.prompt(t("orders.reverseReasonPrompt", "Reverse checkout reason"));
    if (!reason) return;
    setWorkingId(tableNo);
    setError("");
    try {
      await apiFetchJson("/api/tables/reverse-checkout", {
        method: "POST",
        body: { tableNo, reason },
        timeoutMs: 7000,
        retries: 0
      });
      await reloadWithCurrentRange();
    } catch (err: any) {
      setError(err.message || t("orders.reverseFailed", "Failed to reverse checkout"));
    } finally {
      setWorkingId("");
    }
  }

  async function applyPreset(next: PresetKey) {
    setPreset(next);
    const range = rangeByPreset(next);
    setFromDate(toDateInput(range.from));
    setToDate(toDateInput(range.to));
    await loadOrders(range.from, range.to);
  }

  async function applyCustomRange() {
    if (!fromDate || !toDate) {
      setError(t("orders.needDateRange", "Select start and end dates"));
      return;
    }
    const from = new Date(`${fromDate}T00:00:00`);
    const to = new Date(`${toDate}T23:59:59`);
    if (from > to) {
      setError(t("orders.invalidDateRange", "Start date cannot be after end date"));
      return;
    }
    await loadOrders(from, to);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialTable = (params.get("tableNo") || "").trim();
    setTableFilter(initialTable);

    const range = rangeByPreset("today");
    setFromDate(toDateInput(range.from));
    setToDate(toDateInput(range.to));
    void loadOrders(range.from, range.to, initialTable);
  }, []);

  const totalAmount = orders.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="stack">
      <AppBar
        title={t("orders.title", "订单")}
        left={(
          <Button variant="secondary" onClick={() => router.push("/manage")}>
            Back
          </Button>
        )}
        right={(
          <Button variant="secondary" onClick={() => { void reloadWithCurrentRange(); }}>
            {t("common.refresh", "刷新")}
          </Button>
        )}
      />

      <div className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>{t("orders.section", "订单")}</h3>
          <button
            type="button"
            className="secondary compact-btn"
            onClick={() => setSectionOpen((v) => !v)}
          >
            {sectionOpen ? t("common.collapse", "收起") : t("common.expand", "展开")}
          </button>
        </div>

        {sectionOpen ? (
          <>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {quickButtons.map((btn) => (
                <button
                  key={btn.key}
                  type="button"
                  className={preset === btn.key ? "compact-btn" : "secondary compact-btn"}
                  onClick={() => { void applyPreset(btn.key); }}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            <div className="row" style={{ flexWrap: "wrap" }}>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              <button type="button" className="compact-btn" onClick={() => { void applyCustomRange(); }}>
                {t("income.custom", "自定时间")}
              </button>
            </div>

            <div className="row" style={{ flexWrap: "wrap" }}>
              <input
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void reloadWithCurrentRange();
                  }
                }}
                placeholder={t("orders.tableFilter", "按桌号筛选（可选）")}
              />
              <button type="button" className="secondary compact-btn" onClick={() => { void reloadWithCurrentRange(); }}>
                {t("common.search", "搜索")}
              </button>
            </div>

            {loading ? <div className="muted">{t("common.loading", "加载中...")}</div> : null}
            {error ? <div className="muted">{error}</div> : null}
            {!loading && !error ? (
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{t("orders.totalCount", "订单总数")}：{orders.length}</strong>
                <strong>{t("orders.totalRevenue", "营业额")}：₱{totalAmount}</strong>
              </div>
            ) : null}

            {!loading && !error && orders.length === 0 ? <div className="muted">{t("orders.empty", "暂无订单")}</div> : null}

            <div className="order-list">
              {loading ? (
                <>
                  <div className="skeleton skeleton-card" />
                  <div className="skeleton skeleton-card" />
                  <div className="skeleton skeleton-card" />
                </>
              ) : null}

              {orders.map((order) => {
                const opened = Boolean(expanded[order.id]);
                const canEdit = order.status === "submitted" && !order.cancelled_at;

                return (
                  <div key={order.id} className="menu-item stack">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <strong>{order.table_no}</strong>
                      <span className="tag">₱{order.amount}</span>
                    </div>
                    <div className="muted">#{order.id.slice(0, 8)} · {new Date(order.created_at).toLocaleString()}</div>
                    <div className="muted">
                      x{order.item_qty} · {statusLabel(order)} · {lang === "en" ? "charge" : "费用"} {order.charge_amount >= 0 ? "+" : ""}{order.charge_amount}
                    </div>

                    <div className="row" style={{ flexWrap: "wrap" }}>
                      <button
                        className="secondary compact-btn"
                        type="button"
                        onClick={() => setExpanded((prev) => ({ ...prev, [order.id]: !opened }))}
                      >
                        {opened ? t("orders.hideDetail", "收起") : t("orders.detail", "详情")}
                      </button>

                      {role === "manager" && canEdit ? (
                        <button
                          className="secondary compact-btn"
                          type="button"
                          onClick={() => { void cancelOrder(order.id); }}
                          disabled={workingId === order.id}
                        >
                          {t("orders.cancel", "取消单")}
                        </button>
                      ) : null}

                      {role === "manager" && canEdit ? (
                        <button
                          className="secondary compact-btn"
                          type="button"
                          onClick={() => { void applyCharge(order.id, "discount"); }}
                          disabled={workingId === order.id}
                        >
                          {t("orders.discount", "折扣")}
                        </button>
                      ) : null}

                      {role === "manager" && canEdit ? (
                        <button
                          className="secondary compact-btn"
                          type="button"
                          onClick={() => { void applyCharge(order.id, "service_fee"); }}
                          disabled={workingId === order.id}
                        >
                          {t("orders.serviceFee", "服务费")}
                        </button>
                      ) : null}

                      {role === "manager" && order.status === "closed" && order.amount > 0 ? (
                        <button
                          className="secondary compact-btn"
                          type="button"
                          onClick={() => { void reverseCheckout(order.table_no); }}
                          disabled={workingId === order.table_no}
                        >
                          {t("orders.reverseCheckout", "反结账")}
                        </button>
                      ) : null}

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
                          <div key={`${order.id}-${item.menu_item_id}-${item.note || ""}`} className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                            <div className="stack" style={{ gap: 2 }}>
                              <span>{localizeMenuText(item.name, lang)} x{item.qty}</span>
                              {item.note ? <span className="muted">{t("order.noteLabel", "备注")}: {item.note}</span> : null}
                            </div>
                            <div className="row">
                              <div>₱{item.amount}</div>
                              {canEdit ? (
                                <button
                                  className="secondary compact-btn"
                                  type="button"
                                  onClick={() => { void returnOne(order.id, item.menu_item_id); }}
                                  disabled={workingId === order.id}
                                >
                                  {t("orders.returnDish", "退菜")}
                                </button>
                              ) : null}
                              {role === "manager" && canEdit ? (
                                <button
                                  className="secondary compact-btn"
                                  type="button"
                                  onClick={() => { void splitOne(order.id, item.menu_item_id); }}
                                  disabled={workingId === order.id}
                                >
                                  {t("orders.split", "分单")}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}

                        {role === "manager" && canEdit ? (
                          <button
                            className="secondary compact-btn"
                            type="button"
                            onClick={() => {
                              const target = window.prompt(
                                t("orders.mergeTargetPrompt", "Enter target order ID (full)")
                              );
                              if (!target) return;
                              void mergeTo(target, order.id);
                            }}
                            disabled={workingId === order.id}
                          >
                            {t("orders.merge", "并单")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>

      <BottomNav />
    </div>
  );
}
