"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../components/bottom-nav";
import { apiFetchJson, getStoredAuth } from "../../lib/client-api";
import { useI18n } from "../components/i18n-provider";
import { useActionGuard } from "../../lib/use-action-guard";

type TableItem = {
  tableNo: string;
  baseTables: string[];
  column: number;
  status: "open" | "idle";
  guestCount: number | null;
};

const GUEST_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

export default function TablesPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [tables, setTables] = useState<TableItem[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [error, setError] = useState("");
  const [openingTable, setOpeningTable] = useState<TableItem | null>(null);
  const [guestCount, setGuestCount] = useState(2);
  const [submitting, setSubmitting] = useState(false);

  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [mergeGuestCount, setMergeGuestCount] = useState(4);
  const canRunAction = useActionGuard();

  useEffect(() => {
    const { token, role } = getStoredAuth();
    if (!token || (role !== "waiter" && role !== "manager")) {
      router.replace("/");
      return;
    }
    void loadTables();
  }, [router]);

  async function loadTables() {
    setLoadingTables(true);
    setError("");
    try {
      const body = await apiFetchJson<{ tables: TableItem[] }>("/api/tables", { timeoutMs: 5000, retries: 1 });
      setTables(body.tables || []);
    } catch (err: any) {
      setError(err.message || t("tables.loadFailed", "Failed to load tables"));
    } finally {
      setLoadingTables(false);
    }
  }

  const columns = useMemo(() => {
    const grouped: TableItem[][] = [[], [], []];
    for (const table of tables) {
      const index = Math.min(2, Math.max(0, table.column - 1));
      grouped[index].push(table);
    }
    return grouped;
  }, [tables]);

  function enterMenu(tableNo: string, guests: number) {
    router.push(`/order?tableNo=${encodeURIComponent(tableNo)}&guests=${guests}`);
  }

  async function openTable() {
    if (!canRunAction()) return;
    if (!openingTable) return;
    setSubmitting(true);
    setError("");
    try {
      const body = await apiFetchJson<{ session: { tableNo: string; guestCount: number } }>("/api/tables", {
        method: "POST",
        body: { tableNo: openingTable.tableNo, guestCount },
        timeoutMs: 7000,
        retries: 1
      });
      setOpeningTable(null);
      enterMenu(body.session.tableNo, body.session.guestCount);
    } catch (err: any) {
      setError(err.message || t("tables.openFailed", "Failed to open table"));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmMerge() {
    if (!canRunAction()) return;
    if (mergeSelection.length !== 2) {
      setError(t("tables.selectTwo", "Please select two tables first"));
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const [primary, secondary] = mergeSelection;
      const body = await apiFetchJson<{ session: { tableNo: string; guestCount: number } }>("/api/tables/merge", {
        method: "POST",
        body: {
          primaryTable: primary,
          secondaryTable: secondary,
          guestCount: mergeGuestCount
        },
        timeoutMs: 7000,
        retries: 1
      });
      setMergeMode(false);
      setMergeSelection([]);
      enterMenu(body.session.tableNo, body.session.guestCount);
    } catch (err: any) {
      setError(err.message || t("tables.mergeFailed", "Failed to merge tables"));
    } finally {
      setSubmitting(false);
    }
  }

  function onTableClick(table: TableItem) {
    if (submitting) return;
    if (table.status === "open") {
      enterMenu(table.tableNo, table.guestCount || 1);
      return;
    }

    if (mergeMode) {
      const base = table.baseTables[0];
      setMergeSelection((prev) => {
        if (prev.includes(base)) {
          return prev.filter((t) => t !== base);
        }
        if (prev.length >= 2) return prev;
        return [...prev, base];
      });
      return;
    }

    setGuestCount(2);
    setOpeningTable(table);
  }

  return (
    <div className="stack">
      <header className="tables-header">
        <h1>{t("tables.title", "请选择桌号")}</h1>
        <div className="row tables-actions">
          <button
            className={mergeMode ? "compact-btn" : "secondary compact-btn"}
            type="button"
            onClick={() => {
              setMergeMode((v) => !v);
              setMergeSelection([]);
            }}
            disabled={submitting || Boolean(openingTable)}
          >
            {t("tables.merge", "拼桌")}
          </button>
          <button className="secondary compact-btn" onClick={loadTables} type="button" disabled={submitting}>
            {t("common.refresh", "刷新")}
          </button>
          <button
            className="secondary compact-btn danger-outline"
            onClick={() => {
              localStorage.clear();
              router.replace("/");
            }}
            type="button"
            disabled={submitting}
          >
            {t("common.logout", "退出")}
          </button>
        </div>
      </header>

      {openingTable ? (
        <div className="panel stack tables-open-panel">
          <h3 style={{ margin: 0 }}>{t("tables.opening", "开台：")}{openingTable.tableNo}</h3>
          <label className="stack">
            {t("tables.guestCount", "用餐人数")}
            <select value={guestCount} onChange={(e) => setGuestCount(Number(e.target.value))}>
              {GUEST_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {lang === "en" ? `${count} guests` : `${count} 人`}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <button className="secondary" type="button" onClick={() => setOpeningTable(null)}>{t("common.cancel", "取消")}</button>
            <button type="button" onClick={openTable} disabled={submitting}>
              {submitting ? t("tables.openingNow", "开台中...") : t("tables.confirmOpen", "确认开台")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="bar-banner">{t("tables.bar", "吧台（BAR）")}</div>

      {mergeMode ? (
        <div className="panel stack tables-merge-panel">
          <div className="muted">{t("tables.mergeModeHint", "拼桌模式：选择两张空闲桌，确认后合并为一个桌号。")}</div>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>{t("tables.selected", "已选择")}：{mergeSelection.join(" + ") || t("tables.noneSelected", "未选择")}</div>
            <div className="row">
              <select value={mergeGuestCount} onChange={(e) => setMergeGuestCount(Number(e.target.value))}>
                {GUEST_OPTIONS.map((count) => (
                  <option key={count} value={count}>
                    {lang === "en" ? `${count} guests` : `${count} 人`}
                  </option>
                ))}
              </select>
              <button type="button" onClick={confirmMerge} disabled={submitting || mergeSelection.length !== 2}>
                {submitting ? t("tables.mergeProcessing", "处理中...") : t("tables.mergeConfirm", "确认拼桌")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel table-layout">
        {loadingTables ? (
          <>
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
          </>
        ) : (
          columns.map((items, idx) => (
            <div key={idx} className="table-column">
              {items.map((table) => {
                const selected = mergeSelection.includes(table.baseTables[0]);
                return (
                  <button
                    key={table.tableNo}
                    type="button"
                    className={`${table.status === "open" ? "table-btn open" : "table-btn idle"}${selected ? " selected" : ""}`}
                    onClick={() => onTableClick(table)}
                  >
                    <div className="table-name">{table.tableNo}</div>
                    <div className="table-meta">
                      {table.status === "open"
                        ? lang === "en"
                          ? `${t("tables.opened", "Open")} · ${table.guestCount || "?"} guests`
                          : `${t("tables.opened", "已开台")} · ${table.guestCount || "?"}人`
                        : t("tables.idle", "空闲")}
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {error ? <div className="muted">{error}</div> : null}

      <BottomNav />
    </div>
  );
}
