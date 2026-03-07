"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../../components/bottom-nav";
import { apiFetchJson, getStoredAuth } from "../../../lib/client-api";
import { useI18n } from "../../components/i18n-provider";
import { type PresetKey, rangeByPreset, toDateInput } from "../../../lib/date-range";
import { AppBar, BottomSheet, Button, Toast } from "../../../components/ui";

type IncomeDay = {
  day: string;
  order_count: number;
  amount: number;
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

type ExportMode = "single" | "range";

const exportErrorEnMap: Record<string, string> = {
  "月份格式错误": "Invalid month format",
  "月份范围无效": "Invalid month range",
  "导出失败": "Export failed",
  "未登录": "Not signed in",
  "无权限": "Insufficient permission"
};

function fallbackFilename(fromMonth: string, toMonth: string) {
  if (fromMonth === toMonth) return `RDV_Revenue_${fromMonth}.csv`;
  return `RDV_Revenue_${fromMonth}_to_${toMonth}.csv`;
}

function parseFilename(disposition: string | null) {
  if (!disposition) return "";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
  const plainMatch = disposition.match(/filename="?([^"]+)"?/i);
  return plainMatch?.[1] || "";
}

function localizeExportError(reason: string, lang: "zh" | "en") {
  const normalized = String(reason || "").trim();
  if (!normalized || lang !== "en") return normalized;
  return exportErrorEnMap[normalized] || normalized;
}

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
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>("single");
  const [singleMonth, setSingleMonth] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  const quickButtons: Array<{ key: PresetKey; label: string }> = useMemo(() => [
    { key: "today", label: t("income.today", "当天") },
    { key: "yesterday", label: t("income.yesterday", "昨天") },
    { key: "week", label: t("income.week", "过去一周") },
    { key: "month", label: t("income.month", "过去一月") },
    { key: "3months", label: t("income.threeMonths", "过去三月") },
    { key: "year", label: t("income.year", "过去一年") }
  ], [t]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

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
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setSingleMonth(currentMonth);
    setStartMonth(currentMonth);
    setEndMonth(currentMonth);
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

  const exportValidation = useMemo(() => {
    if (exportMode === "single") {
      if (!MONTH_RE.test(singleMonth)) {
        return {
          valid: false,
          error: t("income.exportNeedMonth", "Please select month"),
          fromMonth: "",
          toMonth: ""
        };
      }
      return { valid: true, error: "", fromMonth: singleMonth, toMonth: singleMonth };
    }

    if (!MONTH_RE.test(startMonth) || !MONTH_RE.test(endMonth)) {
      return {
        valid: false,
        error: t("income.exportNeedMonthRange", "Please select start and end month"),
        fromMonth: "",
        toMonth: ""
      };
    }
    if (startMonth.localeCompare(endMonth) > 0) {
      return {
        valid: false,
        error: t("income.exportInvalidMonthRange", "End month cannot be earlier than start month"),
        fromMonth: "",
        toMonth: ""
      };
    }

    return { valid: true, error: "", fromMonth: startMonth, toMonth: endMonth };
  }, [endMonth, exportMode, singleMonth, startMonth, t]);

  async function exportRevenueCsv() {
    if (!exportValidation.valid) {
      setExportError(exportValidation.error);
      return;
    }

    const { token, role } = getStoredAuth();
    if (!token || role !== "manager") {
      router.replace("/");
      return;
    }

    setExporting(true);
    setExportError("");
    try {
      const params = new URLSearchParams({
        fromMonth: exportValidation.fromMonth,
        toMonth: exportValidation.toMonth,
        tzOffsetMin: String(new Date().getTimezoneOffset())
      });

      const res = await fetch(`/api/manage/income/export?${params.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        },
        cache: "no-store"
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const reason = String((data as { error?: string }).error || t("income.exportFailed", "Export failed")).trim();
        throw new Error(localizeExportError(reason, lang));
      }

      const blob = await res.blob();
      const filename = parseFilename(res.headers.get("content-disposition"))
        || fallbackFilename(exportValidation.fromMonth, exportValidation.toMonth);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setToastMessage(t("income.exportReady", "Export ready"));
      setExportSheetOpen(false);
    } catch (err: any) {
      const reason = localizeExportError(err?.message || t("income.exportFailed", "Export failed"), lang);
      setExportError(reason);
      setToastMessage(`${t("income.exportFailed", "Export failed")}: ${reason}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="stack manage-subpage-screen">
      <AppBar
        title={t("income.section", "收入")}
        left={(
          <Button variant="secondary" onClick={() => router.push("/manage")}>
            Back
          </Button>
        )}
      />

      <div className="manage-subpage-scroll stack">
        <div className="card stack manage-panel">
          <div className="row income-export-header">
            <h3 style={{ margin: 0 }}>{t("income.section", "收入")}</h3>
            <Button variant="secondary" onClick={() => setExportSheetOpen(true)}>
              {t("income.export", "Export")}
            </Button>
          </div>
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

        <div className="card stack manage-panel">
          {loading ? <div className="muted">{t("common.loading", "加载中...")}</div> : null}
          {error ? <div className="muted">{error}</div> : null}
          <div className="manage-kpi-grid">
            <div className="manage-kpi-card">
              <div className="manage-kpi-label">{t("income.orderCount", "订单数")}</div>
              <div className="manage-kpi-value">{orderCount}</div>
            </div>
            <div className="manage-kpi-card">
              <div className="manage-kpi-label">{t("income.total", "收入")}</div>
              <div className="manage-kpi-value">₱{totalAmount}</div>
            </div>
          </div>
          <div className="order-list manage-order-list">
            {byDay.map((row) => (
              <div key={row.day} className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", rowGap: 4 }}>
                <div>{new Date(row.day).toLocaleDateString()}</div>
                <div>{lang === "en" ? `Orders ${row.order_count} · ₱${row.amount}` : `订单 ${row.order_count} · ₱${row.amount}`}</div>
              </div>
            ))}
            {!loading && byDay.length === 0 ? (
              <div className="manage-empty-note">{lang === "en" ? "No revenue data for this period" : "当前时段暂无收入数据"}</div>
            ) : null}
          </div>
        </div>
      </div>

      <BottomSheet
        open={exportSheetOpen}
        onClose={() => {
          if (exporting) return;
          setExportSheetOpen(false);
        }}
        title={t("income.exportRange", "Export Range")}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setExportSheetOpen(false)} disabled={exporting}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={() => { void exportRevenueCsv(); }}
              loading={exporting}
              disabled={!exportValidation.valid || exporting}
            >
              {exporting ? t("income.exporting", "Exporting...") : t("income.exportCsv", "Export CSV")}
            </Button>
          </>
        )}
      >
        <div className="stack income-export-sheet">
          <div className="row income-export-mode" style={{ flexWrap: "wrap" }}>
            <Button
              variant={exportMode === "single" ? "primary" : "secondary"}
              onClick={() => {
                setExportMode("single");
                setExportError("");
              }}
            >
              {t("income.exportSingleMonth", "Single month")}
            </Button>
            <Button
              variant={exportMode === "range" ? "primary" : "secondary"}
              onClick={() => {
                setExportMode("range");
                setExportError("");
              }}
            >
              {t("income.exportMonthRange", "Month range")}
            </Button>
          </div>
          {exportMode === "single" ? (
            <label className="stack">
              <span>{t("income.exportMonth", "Month")}</span>
              <input
                type="month"
                value={singleMonth}
                onChange={(e) => {
                  setSingleMonth(e.target.value);
                  setExportError("");
                }}
                disabled={exporting}
              />
            </label>
          ) : (
            <div className="row" style={{ flexWrap: "wrap" }}>
              <label className="stack" style={{ flex: "1 1 180px" }}>
                <span>{t("income.exportStartMonth", "Start month")}</span>
                <input
                  type="month"
                  value={startMonth}
                  onChange={(e) => {
                    setStartMonth(e.target.value);
                    setExportError("");
                  }}
                  disabled={exporting}
                />
              </label>
              <label className="stack" style={{ flex: "1 1 180px" }}>
                <span>{t("income.exportEndMonth", "End month")}</span>
                <input
                  type="month"
                  value={endMonth}
                  onChange={(e) => {
                    setEndMonth(e.target.value);
                    setExportError("");
                  }}
                  disabled={exporting}
                />
              </label>
            </div>
          )}

          {exportError ? <div className="income-export-error">{exportError}</div> : null}
          {!exportError && !exportValidation.valid ? (
            <div className="income-export-error">{exportValidation.error}</div>
          ) : null}
        </div>
      </BottomSheet>

      <Toast
        open={Boolean(toastMessage)}
        message={toastMessage}
        onClose={() => setToastMessage("")}
      />

      <BottomNav />
    </div>
  );
}
