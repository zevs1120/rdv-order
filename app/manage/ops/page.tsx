"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../../components/bottom-nav";
import ManageTabs from "../../components/manage-tabs";
import { apiFetchJson, getStoredAuth } from "../../../lib/client-api";
import { useI18n } from "../../components/i18n-provider";
import { type PresetKey, rangeByPreset, toDateInput } from "../../../lib/date-range";
import { localizeMenuText } from "../../../lib/menu-text";

type ItemStat = { name: string; qty: number };

type OpsData = {
  orderCount: number;
  grossRevenue: number;
  actualReceived: number;
  hotItems: ItemStat[];
};

export default function ManageOpsPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [data, setData] = useState<OpsData | null>(null);
  const [preset, setPreset] = useState<PresetKey>("today");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sectionOpen, setSectionOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  async function loadData(from: Date, to: Date) {
    setLoading(true);
    setError("");
    try {
      const { token, role } = getStoredAuth();
      if (!token || role !== "manager") {
        router.replace("/");
        return;
      }

      const body = await apiFetchJson<OpsData>(
        `/api/manage/ops?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
        {
          timeoutMs: 6000,
          retries: 1
        }
      );
      setData(body);
    } catch (err: any) {
      setError(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function applyPreset(next: PresetKey) {
    setPreset(next);
    const range = rangeByPreset(next);
    setFromDate(toDateInput(range.from));
    setToDate(toDateInput(range.to));
    await loadData(range.from, range.to);
  }

  async function applyCustomRange() {
    if (!fromDate || !toDate) {
      setError("请选择开始和结束日期");
      return;
    }
    const from = new Date(`${fromDate}T00:00:00`);
    const to = new Date(`${toDate}T23:59:59`);
    if (from > to) {
      setError("开始日期不能晚于结束日期");
      return;
    }
    await loadData(from, to);
  }

  useEffect(() => {
    const range = rangeByPreset("today");
    setFromDate(toDateInput(range.from));
    setToDate(toDateInput(range.to));
    void loadData(range.from, range.to);
  }, []);

  return (
    <div className="stack">
      <header>
        <h1>{t("ops.title", "运营看板")}</h1>
        <button className="secondary compact-btn" type="button" onClick={() => { void applyCustomRange(); }}>
          {t("common.refresh", "刷新")}
        </button>
      </header>

      <ManageTabs />

      <div className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>{t("ops.section", "运营")}</h3>
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
          </>
        ) : null}
      </div>

      {loading ? <div className="muted">{t("common.loading", "加载中...")}</div> : null}
      {error ? <div className="muted">{error}</div> : null}

      {sectionOpen ? (
        <>
          <div className="panel stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{t("income.orderCount", "订单数")}：{data?.orderCount || 0}</strong>
              <strong>{t("ops.grossRevenue", "营业额")}：₱{data?.grossRevenue || 0}</strong>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{t("ops.actualReceived", "实收")}：₱{data?.actualReceived || 0}</strong>
              <strong>{t("cashier.variance", "差异")}：₱{(data?.actualReceived || 0) - (data?.grossRevenue || 0)}</strong>
            </div>
          </div>

          <div className="panel stack">
            <h3 style={{ margin: 0 }}>{t("ops.hotItems", "热销")}</h3>
            <div className="order-list">
              {(data?.hotItems || []).map((item) => (
                <div key={`hot-${item.name}`} className="row" style={{ justifyContent: "space-between" }}>
                  <div>{localizeMenuText(item.name, lang)}</div>
                  <div>{item.qty}</div>
                </div>
              ))}
              {!loading && (data?.hotItems || []).length === 0 ? <div className="muted">-</div> : null}
            </div>
          </div>
        </>
      ) : null}

      <BottomNav />
    </div>
  );
}
