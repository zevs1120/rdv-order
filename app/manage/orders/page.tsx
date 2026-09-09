"use client";

import { LatestReportRead } from "../../../lib/latest-report-read";
import { useConnectionRefresh } from "../../../lib/use-connection-refresh";

import DatePresets from "../../components/date-presets";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson, getStoredAuth } from "../../../lib/client-api";
import { useI18n } from "../../components/i18n-provider";
import { localizeMenuText } from "../../../lib/menu-text";
import { formatItemQtyDisplay } from "../../../lib/qty-display";
import { useActionGuard } from "../../../lib/use-action-guard";
import { type PresetKey, rangeByPreset, toDateInput } from "../../../lib/date-range";
import { ReturnDishSheet } from "../../../components/ui/return-dish-sheet";
import { orderStatusLabel } from "../../../lib/order-status";
import { RDV_TOPBAR_ACTION_EVENT, type TopbarActionDetail } from "../../../lib/topbar-events";

type OrderItemDetail = {
  order_item_id?: string;
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

const ORDER_PROGRESSIVE_THRESHOLD = 36;
const ORDER_PROGRESSIVE_STEP = 24;

export default function ManageOrdersPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [role, setRole] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [returnTarget, setReturnTarget] = useState<{ orderId: string; item: OrderItemDetail } | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const [preset, setPreset] = useState<PresetKey>("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [renderLimit, setRenderLimit] = useState(ORDER_PROGRESSIVE_THRESHOLD);
  const loadMoreAnchorRef = useRef<HTMLDivElement | null>(null);
  const reportRead = useRef(new LatestReportRead());
  const ordersRequestRef = useRef<AbortController | null>(null);
  const canRunAction = useActionGuard();


  function getCurrentRange() {
    if (!fromDate || !toDate) return null;
    const from = new Date(`${fromDate}T00:00:00`);
    const to = new Date(`${toDate}T23:59:59`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    return { from, to };
  }

  async function loadOrders(from: Date, to: Date, tableNoOverride?: string, sessionIdOverride?: string) {
    ordersRequestRef.current?.abort();
    const controller = new AbortController();
    ordersRequestRef.current = controller;
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
      const sessionId = sessionIdOverride ?? sessionFilter;
      const params = sessionId
        ? new URLSearchParams({ sessionId })
        : new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      if (tableNo) {
        params.set("tableNo", tableNo);
      }

      const body = await reportRead.current.read(() => apiFetchJson<{ orders: OrderRow[]; viewerRole?: string }>(
        `/api/manage/orders?${params.toString()}`,
        { timeoutMs: 20000, retries: 0, adaptiveTimeout: false }
      ));
      if (controller.signal.aborted || getStoredAuth().token !== token) return;
      if (body.viewerRole) {
        setRole(body.viewerRole);
      }
      setOrders(body.orders || []);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      if (err.message === "未登录" || err.message === "Not signed in") {
        router.replace("/");
        return;
      }
      setError(err.message || t("orders.loadFailed", "Failed to load orders"));
    } finally {
      if (ordersRequestRef.current === controller) {
        ordersRequestRef.current = null;
        setLoading(false);
      }
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

  async function returnDish(orderId: string, item: OrderItemDetail, qty: number) {
    if (!canRunAction() || !Number.isInteger(qty) || qty <= 0 || qty > item.qty) return;
    setWorkingId(orderId);
    setError("");
    try {
      await apiFetchJson(`/api/orders/${orderId}/return-item`, {
        method: "POST",
        body: {
          menuItemId: item.menu_item_id,
          orderItemId: item.order_item_id,
          qty,
          reason: "manual correction"
        },
        timeoutMs: 7000,
        retries: 0
      });
      setReturnTarget(null);
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

  useConnectionRefresh(reloadWithCurrentRange, !loading && !workingId);

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
    const initialSession = params.get("sessionId") || "";
    setSessionFilter(initialSession);

    const range = rangeByPreset("today");
    setFromDate(toDateInput(range.from));
    setToDate(toDateInput(range.to));
    void loadOrders(range.from, range.to, initialTable, initialSession);
    return () => { ordersRequestRef.current?.abort(); ordersRequestRef.current = null; reportRead.current.cancelPending(); };
  }, []);

  useEffect(() => {
    function onTopbarAction(event: Event) {
      const custom = event as CustomEvent<TopbarActionDetail>;
      if (custom.detail?.action === "orders-refresh") {
        void reloadWithCurrentRange();
      }
    }
    window.addEventListener(RDV_TOPBAR_ACTION_EVENT, onTopbarAction as EventListener);
    return () => window.removeEventListener(RDV_TOPBAR_ACTION_EVENT, onTopbarAction as EventListener);
  }, [fromDate, toDate, tableFilter, sessionFilter]);

  useEffect(() => {
    if (orders.length <= ORDER_PROGRESSIVE_THRESHOLD) {
      setRenderLimit(orders.length);
      return;
    }
    setRenderLimit((prev) => {
      const next = Math.max(prev, ORDER_PROGRESSIVE_THRESHOLD);
      return Math.min(next, orders.length);
    });
  }, [orders.length]);

  useEffect(() => {
    if (orders.length <= ORDER_PROGRESSIVE_THRESHOLD) return;
    if (renderLimit >= orders.length) return;
    const anchor = loadMoreAnchorRef.current;
    if (!anchor) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setRenderLimit((prev) => Math.min(orders.length, prev + ORDER_PROGRESSIVE_STEP));
    }, { rootMargin: "220px 0px" });
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [orders.length, renderLimit]);

  const renderedOrders = useMemo(() => orders.slice(0, renderLimit), [orders, renderLimit]);
  const totalAmount = useMemo(() => orders.reduce((sum, row) => sum + row.amount, 0), [orders]);

  return (
    <div className="stack manage-subpage-screen">
      <div className="manage-subpage-scroll stack">
        <div className="panel stack manage-panel">

              {!sessionFilter && <>
              <DatePresets value={preset} onChange={(key) => { void applyPreset(key); }} />

              <div className="row" style={{ flexWrap: "wrap" }}>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                <button type="button" className="compact-btn" onClick={() => { void applyCustomRange(); }}>
                  {t("income.custom", "自定时间")}
                </button>
              </div>

              </>}

              {(tableFilter || sessionFilter) && <div className="report-table-context">
                <span>{lang === "en" ? "Table" : "桌号"} {tableFilter}{sessionFilter ? (lang === "en" ? " · This visit" : " · 本次用餐") : ""}</span>
                <button type="button" className="secondary compact-btn" onClick={() => {
                  setTableFilter("");
                  setSessionFilter("");
                  router.replace("/manage/orders");
                  const range = getCurrentRange();
                  if (range) void loadOrders(range.from, range.to, "", "");
                }}>{lang === "en" ? "All orders" : "全部订单"}</button>
              </div>}

              {loading ? <div className="muted">{t("common.loading", "加载中...")}</div> : null}
              {error ? <div className="muted">{error}</div> : null}
              {!loading && !error ? (
                <div className="manage-kpi-grid">
                  <div className="manage-kpi-card">
                    <div className="manage-kpi-label">{t("orders.totalCount", "订单总数")}</div>
                    <div className="manage-kpi-value">{orders.length}</div>
                  </div>
                  <div className="manage-kpi-card">
                    <div className="manage-kpi-label">{t("orders.totalRevenue", "订单金额")}</div>
                    <div className="manage-kpi-value">₱{totalAmount}</div>
                  </div>
                </div>
              ) : null}

              {!loading && !error && orders.length === 0 ? (
                <div className="manage-empty-note">{t("orders.empty", "暂无订单")}</div>
              ) : null}

              <div className="order-list manage-order-list">
                {loading ? (
                  <>
                    <div className="skeleton skeleton-card" />
                    <div className="skeleton skeleton-card" />
                    <div className="skeleton skeleton-card" />
                  </>
                ) : null}

                {renderedOrders.map((order) => {
                  const opened = Boolean(expanded[order.id]);
                  const canEdit = order.status === "submitted" && !order.cancelled_at;

                  return (
                    <div key={order.id} className="menu-item stack manage-order-card">
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <strong>{order.table_no}</strong>
                        <span className="tag">₱{order.amount}</span>
                      </div>
                      <div className="muted">#{order.id.slice(0, 8)} · {new Date(order.created_at).toLocaleString()}</div>
                      <div className="muted">
                        x{order.item_qty} · {orderStatusLabel(order.status, order.cancelled_at, lang)} · {lang === "en" ? "charge" : "费用"} {order.charge_amount >= 0 ? "+" : ""}{order.charge_amount}
                      </div>

                      <div className="row order-record-actions">
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
                            <div key={item.order_item_id || `${order.id}-${item.menu_item_id}-${item.note || ""}`} className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                              <div className="stack" style={{ gap: 2 }}>
                                <span>{localizeMenuText(item.name, lang)} · {formatItemQtyDisplay(item.name, item.qty, lang)}</span>
                                {item.note ? <span className="muted">{t("order.noteLabel", "备注")}: {item.note}</span> : null}
                              </div>
                              <div className="row">
                                <div>₱{item.amount}</div>
                                {canEdit ? (
                                  <button
                                    className="secondary compact-btn"
                                    type="button"
                                    onClick={() => { setError(""); setReturnTarget({ orderId: order.id, item }); }}
                                    disabled={workingId === order.id}
                                  >
                                    {t("orders.returnDish", "退菜")}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {renderLimit < orders.length ? (
                  <>
                    <div ref={loadMoreAnchorRef} className="tables-load-anchor" aria-hidden="true" />
                    <div className="muted">{`${t("common.loading", "加载中...")} ${renderLimit}/${orders.length}`}</div>
                  </>
                ) : null}
              </div>
        </div>
      </div>

      {returnTarget && <ReturnDishSheet
        key={`${returnTarget.orderId}:${returnTarget.item.order_item_id || returnTarget.item.menu_item_id}`}
        name={localizeMenuText(returnTarget.item.name, lang)} maxQty={returnTarget.item.qty} lang={lang}
        busy={workingId === returnTarget.orderId} error={error} onClose={() => setReturnTarget(null)}
        onConfirm={(qty) => { void returnDish(returnTarget.orderId, returnTarget.item, qty); }}
      />}
    </div>
  );
}
