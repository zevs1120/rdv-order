"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../../components/bottom-nav";
import { apiFetchJson, getStoredAuth } from "../../../lib/client-api";
import { useI18n } from "../../components/i18n-provider";
import { type PresetKey, rangeByPreset, toDateInput } from "../../../lib/date-range";
import { localizeMenuText } from "../../../lib/menu-text";
import { formatItemQtyDisplay } from "../../../lib/qty-display";
import { AppBar, Button } from "../../../components/ui";

type HotItem = {
  id: string;
  name: string;
  qty: number;
};

export default function ManageHotPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [preset, setPreset] = useState<PresetKey>("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [items, setItems] = useState<HotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const quickButtons: Array<{ key: PresetKey; label: string }> = useMemo(() => [
    { key: "today", label: t("income.today", "当天") },
    { key: "yesterday", label: t("income.yesterday", "昨天") },
    { key: "week", label: t("income.week", "过去一周") },
    { key: "month", label: t("income.month", "过去一月") },
    { key: "3months", label: t("income.threeMonths", "过去三月") },
    { key: "year", label: t("income.year", "过去一年") }
  ], [t]);

  const totalQty = useMemo(
    () => items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
    [items]
  );

  async function loadHotItems(from: Date, to: Date) {
    setLoading(true);
    setError("");
    try {
      const { token, role } = getStoredAuth();
      if (!token || role !== "manager") {
        router.replace("/");
        return;
      }
      const body = await apiFetchJson<{ hotItems: HotItem[] }>(
        `/api/manage/hot-items?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
        { timeoutMs: 6000, retries: 1 }
      );
      setItems(body.hotItems || []);
    } catch (err: any) {
      if (err.message === "未登录" || err.message === "Not signed in") {
        router.replace("/");
        return;
      }
      if (err.message === "无权限" || err.message === "Insufficient permission") {
        router.replace("/manage/orders");
        return;
      }
      setError(err.message || t("hot.loadFailed", "Failed to load hot items"));
    } finally {
      setLoading(false);
    }
  }

  async function applyPreset(next: PresetKey) {
    setPreset(next);
    const range = rangeByPreset(next);
    setFromDate(toDateInput(range.from));
    setToDate(toDateInput(range.to));
    await loadHotItems(range.from, range.to);
  }

  async function applyCustomRange() {
    if (!fromDate || !toDate) {
      setError(t("hot.needDateRange", "Select start and end dates"));
      return;
    }
    const from = new Date(`${fromDate}T00:00:00`);
    const to = new Date(`${toDate}T23:59:59`);
    if (from > to) {
      setError(t("hot.invalidDateRange", "Start date cannot be after end date"));
      return;
    }
    await loadHotItems(from, to);
  }

  useEffect(() => {
    const range = rangeByPreset("today");
    setFromDate(toDateInput(range.from));
    setToDate(toDateInput(range.to));
    void loadHotItems(range.from, range.to);
  }, []);

  return (
    <div className="stack manage-subpage-screen">
      <AppBar
        title={t("hot.title", "热销菜")}
        left={(
          <Button variant="secondary" onClick={() => router.push("/manage")}>
            Back
          </Button>
        )}
      />

      <div className="manage-subpage-scroll stack">
        <div className="card stack manage-panel">
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
        </div>

        <div className="card stack manage-panel">
          {loading ? <div className="muted">{t("common.loading", "加载中...")}</div> : null}
          {error ? <div className="muted">{error}</div> : null}
          <div className="manage-kpi-grid">
            <div className="manage-kpi-card">
              <div className="manage-kpi-label">{t("hot.totalQty", "总销量")}</div>
              <div className="manage-kpi-value">{totalQty}</div>
            </div>
            <div className="manage-kpi-card">
              <div className="manage-kpi-label">{t("income.orderCount", "订单数")}</div>
              <div className="manage-kpi-value">{items.length}</div>
            </div>
          </div>
          <div className="order-list manage-order-list">
            {items.map((item) => (
              <div key={`hot-${item.id}`} className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", rowGap: 4 }}>
                <div style={{ flex: "1 1 180px" }}>{localizeMenuText(item.name, lang)}</div>
                <strong>{lang === "en" ? `${formatItemQtyDisplay(item.name, item.qty, lang)} sold` : `${formatItemQtyDisplay(item.name, item.qty, lang)} 已售`}</strong>
              </div>
            ))}
            {!loading && items.length === 0 ? <div className="manage-empty-note">{t("hot.empty", "暂无热销数据")}</div> : null}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
