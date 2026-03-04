"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../../components/bottom-nav";
import { apiFetchJson, getStoredAuth } from "../../../lib/client-api";
import { useI18n } from "../../components/i18n-provider";
import { type PresetKey, rangeByPreset, toDateInput } from "../../../lib/date-range";
import { AppBar, Button } from "../../../components/ui";

type IncomeDay = {
  day: string;
  order_count: number;
  amount: number;
};

export default function ManageIncomePage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [preset, setPreset] = useState<PresetKey>("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [orderCount, setOrderCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [byDay, setByDay] = useState<IncomeDay[]>([]);
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

  async function loadIncome(from: Date, to: Date) {
    setLoading(true);
    setError("");
    try {
      const { token, role } = getStoredAuth();
      if (!token || role !== "manager") {
        router.replace("/");
        return;
      }

      const body = await apiFetchJson<{ orderCount: number; totalAmount: number; byDay: IncomeDay[] }>(
        `/api/manage/income?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
        { timeoutMs: 6000, retries: 1 }
      );
      setOrderCount(body.orderCount || 0);
      setTotalAmount(body.totalAmount || 0);
      setByDay(body.byDay || []);
    } catch (err: any) {
      if (err.message === "未登录" || err.message === "Not signed in") {
        router.replace("/");
        return;
      }
      if (err.message === "无权限" || err.message === "Insufficient permission") {
        router.replace("/manage/orders");
        return;
      }
      setError(err.message || t("income.loadFailed", "Failed to load revenue"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const r = rangeByPreset("today");
    setFromDate(toDateInput(r.from));
    setToDate(toDateInput(r.to));
    void loadIncome(r.from, r.to);
  }, []);

  async function applyPreset(next: PresetKey) {
    setPreset(next);
    const r = rangeByPreset(next);
    setFromDate(toDateInput(r.from));
    setToDate(toDateInput(r.to));
    await loadIncome(r.from, r.to);
  }

  async function applyCustomRange() {
    if (!fromDate || !toDate) {
      setError(t("income.needDateRange", "Select start and end dates"));
      return;
    }
    const from = new Date(`${fromDate}T00:00:00`);
    const to = new Date(`${toDate}T23:59:59`);
    if (from > to) {
      setError(t("income.invalidDateRange", "Start date cannot be after end date"));
      return;
    }
    await loadIncome(from, to);
  }

  return (
    <div className="stack">
      <AppBar
        title={t("income.section", "收入")}
        left={(
          <Button variant="secondary" onClick={() => router.push("/manage")}>
            {lang === "en" ? "More" : "更多"}
          </Button>
        )}
      />

      <div className="card stack">
        <h3 style={{ margin: 0 }}>{t("income.section", "收入")}</h3>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {quickButtons.map((btn) => (
            <button
              key={btn.key}
              type="button"
              className={preset === btn.key ? "compact-btn" : "secondary compact-btn"}
              onClick={() => applyPreset(btn.key)}
            >
              {btn.label}
            </button>
          ))}
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <button type="button" className="compact-btn" onClick={applyCustomRange}>{t("income.custom", "自定时间")}</button>
        </div>
      </div>

      <div className="card stack">
        {loading ? <div className="muted">{t("common.loading", "加载中...")}</div> : null}
        {error ? <div className="muted">{error}</div> : null}
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", rowGap: 4 }}>
          <strong>{t("income.orderCount", "订单数")}：{orderCount}</strong>
          <strong>{t("income.total", "收入")}：₱{totalAmount}</strong>
        </div>
        <div className="order-list">
          {byDay.map((row) => (
            <div key={row.day} className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", rowGap: 4 }}>
              <div>{new Date(row.day).toLocaleDateString()}</div>
              <div>{lang === "en" ? `Orders ${row.order_count} · ₱${row.amount}` : `订单 ${row.order_count} · ₱${row.amount}`}</div>
            </div>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
