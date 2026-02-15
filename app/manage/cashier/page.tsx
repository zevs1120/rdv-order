"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../../components/bottom-nav";
import ManageTabs from "../../components/manage-tabs";
import { apiFetchJson, getStoredAuth } from "../../../lib/client-api";
import { useI18n } from "../../components/i18n-provider";
import { useActionGuard } from "../../../lib/use-action-guard";

type ClosingRow = {
  id: string;
  shift_label: string | null;
  from_time: string;
  to_time: string;
  expected_amount: number;
  actual_amount: number;
  variance_amount: number;
  note: string | null;
  created_at: string;
};

type PricingRule = {
  id: string;
  name: string;
  charge_type: "discount" | "service_fee" | "tax";
  mode: "amount" | "percent";
  value: number;
  is_active: boolean;
  sort_order: number;
};

function formatDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ManageCashierPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [shiftLabel, setShiftLabel] = useState("");
  const [actualAmount, setActualAmount] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<ClosingRow[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [showRules, setShowRules] = useState(true);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [error, setError] = useState("");
  const canRunAction = useActionGuard();

  const varianceSum = useMemo(
    () => rows.reduce((sum, row) => sum + (row.variance_amount || 0), 0),
    [rows]
  );

  function chargeTypeLabel(type: PricingRule["charge_type"]) {
    if (type === "discount") return lang === "en" ? "Discount" : "折扣";
    if (type === "service_fee") return lang === "en" ? "Service Fee" : "服务费";
    return lang === "en" ? "Tax" : "税费";
  }

  function modeLabel(mode: PricingRule["mode"]) {
    return mode === "amount"
      ? (lang === "en" ? "Amount" : "固定金额")
      : (lang === "en" ? "Percent" : "百分比");
  }

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const { token, role } = getStoredAuth();
      if (!token || role !== "manager") {
        router.replace("/");
        return;
      }

      const body = await apiFetchJson<{ rows: ClosingRow[] }>("/api/cashier/close", {
        timeoutMs: 6000,
        retries: 1
      });
      setRows(body.rows || []);

      const ruleBody = await apiFetchJson<{ rules: PricingRule[] }>("/api/pricing/rules", {
        timeoutMs: 6000,
        retries: 1
      });
      setRules(ruleBody.rules || []);
    } catch (err: any) {
      setError(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveRules() {
    if (!canRunAction()) return;
    setSavingRules(true);
    setError("");
    try {
      await apiFetchJson("/api/pricing/rules", {
        method: "PATCH",
        body: { rules },
        timeoutMs: 7000,
        retries: 0
      });
      await loadRows();
    } catch (err: any) {
      setError(err.message || "规则保存失败");
    } finally {
      setSavingRules(false);
    }
  }

  async function submitClose() {
    if (!canRunAction()) return;
    const actual = Number(actualAmount);
    if (!fromDate || !toDate) {
      setError("请选择时间");
      return;
    }
    if (!Number.isInteger(actual) || actual < 0) {
      setError("实收金额无效");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await apiFetchJson("/api/cashier/close", {
        method: "POST",
        body: {
          from: new Date(`${fromDate}T00:00:00`).toISOString(),
          to: new Date(`${toDate}T23:59:59`).toISOString(),
          actualAmount: actual,
          shiftLabel: shiftLabel || null,
          note: note || null
        },
        timeoutMs: 7000,
        retries: 0
      });
      setActualAmount("");
      setNote("");
      await loadRows();
    } catch (err: any) {
      setError(err.message || "日结失败");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    const now = new Date();
    setFromDate(formatDateInput(now));
    setToDate(formatDateInput(now));
    void loadRows();
  }, []);

  return (
    <div className="stack">
      <header>
        <h1>{t("cashier.title", "日结 / 交班")}</h1>
        <button className="secondary compact-btn" type="button" onClick={() => { void loadRows(); }}>
          {t("common.refresh", "刷新")}
        </button>
      </header>

      <ManageTabs />

      <div className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>{t("cashier.rules", "收费规则引擎")}</h3>
          <button
            type="button"
            className="secondary compact-btn"
            onClick={() => setShowRules((v) => !v)}
          >
            {showRules ? t("common.collapse", "收起") : t("common.expand", "展开")}
          </button>
        </div>

        {showRules ? (
          <>
            <div className="order-list">
              {rules.map((rule) => (
                <div key={rule.id} className="menu-item stack">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <input
                      value={rule.name}
                      onChange={(e) =>
                        setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, name: e.target.value } : r))
                      }
                    />
                    <button
                      type="button"
                      className={rule.is_active ? "ios-switch on" : "ios-switch"}
                      onClick={() =>
                        setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
                      }
                      aria-pressed={rule.is_active}
                      aria-label={`${rule.name} ${rule.is_active ? "enabled" : "disabled"}`}
                    />
                  </div>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    <select
                      value={rule.charge_type}
                      onChange={(e) =>
                        setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, charge_type: e.target.value as PricingRule["charge_type"] } : r))
                      }
                    >
                      <option value="discount">{chargeTypeLabel("discount")}</option>
                      <option value="service_fee">{chargeTypeLabel("service_fee")}</option>
                      <option value="tax">{chargeTypeLabel("tax")}</option>
                    </select>
                    <select
                      value={rule.mode}
                      onChange={(e) =>
                        setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, mode: e.target.value as PricingRule["mode"] } : r))
                      }
                    >
                      <option value="amount">{modeLabel("amount")}</option>
                      <option value="percent">{modeLabel("percent")}</option>
                    </select>
                    <input
                      value={String(rule.value)}
                      inputMode="numeric"
                      onChange={(e) =>
                        setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, value: Number(e.target.value || 0) } : r))
                      }
                    />
                  </div>
                </div>
              ))}
              {rules.length === 0 ? <div className="muted">-</div> : null}
            </div>
            <button type="button" onClick={() => { void saveRules(); }} disabled={savingRules}>
              {savingRules ? t("admin.saving", "保存中...") : t("common.save", "保存")}
            </button>
          </>
        ) : null}
      </div>

      <div className="panel stack">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <input
          value={shiftLabel}
          onChange={(e) => setShiftLabel(e.target.value)}
          placeholder={t("cashier.shiftLabel", "班次标记（可选）")}
        />
        <input
          value={actualAmount}
          onChange={(e) => setActualAmount(e.target.value)}
          placeholder={t("cashier.actual", "实收")}
          inputMode="numeric"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("orders.note", "备注")}
        />
        <button type="button" onClick={submitClose} disabled={submitting}>
          {submitting ? t("admin.saving", "保存中...") : t("cashier.submit", "提交日结")}
        </button>
      </div>

      <div className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>{t("cashier.variance", "差异")} Σ：₱{varianceSum}</strong>
          <span className="tag">{rows.length}</span>
        </div>
        {loading ? <div className="muted">{t("common.loading", "加载中...")}</div> : null}
        {error ? <div className="muted">{error}</div> : null}
        <div className="order-list">
          {rows.map((row) => (
            <div key={row.id} className="menu-item stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{row.shift_label || "-"}</strong>
                <span className="tag">{new Date(row.created_at).toLocaleString()}</span>
              </div>
              <div className="muted">{new Date(row.from_time).toLocaleString()} → {new Date(row.to_time).toLocaleString()}</div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>{t("cashier.expected", "应收")} ₱{row.expected_amount}</span>
                <span>{t("cashier.actual", "实收")} ₱{row.actual_amount}</span>
              </div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span>{t("cashier.variance", "差异")} ₱{row.variance_amount}</span>
                {row.note ? <span className="muted">{row.note}</span> : null}
              </div>
            </div>
          ))}
          {!loading && rows.length === 0 ? <div className="muted">-</div> : null}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
