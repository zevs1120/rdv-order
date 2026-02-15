"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../components/bottom-nav";
import { apiFetchJson, getStoredAuth } from "../../lib/client-api";
import { useI18n } from "../components/i18n-provider";

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
  const { t } = useI18n();
  const [tables, setTables] = useState<TableItem[]>([]);
  const [error, setError] = useState("");
  const [openingTable, setOpeningTable] = useState<TableItem | null>(null);
  const [guestCount, setGuestCount] = useState(2);
  const [submitting, setSubmitting] = useState(false);

  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [mergeGuestCount, setMergeGuestCount] = useState(4);

  useEffect(() => {
    const { token, role } = getStoredAuth();
    if (!token || (role !== "waiter" && role !== "manager")) {
      router.replace("/");
      return;
    }
    void loadTables();
  }, [router]);

  async function loadTables() {
    setError("");
    try {
      const body = await apiFetchJson<{ tables: TableItem[] }>("/api/tables", { timeoutMs: 5000, retries: 1 });
      setTables(body.tables || []);
    } catch (err: any) {
      setError(err.message || "加载桌台失败");
    }
  }

  const columns = useMemo(() => {
    return [1, 2, 3].map((col) => tables.filter((t) => t.column === col));
  }, [tables]);

  function enterMenu(tableNo: string, guests: number) {
    router.push(`/order?tableNo=${encodeURIComponent(tableNo)}&guests=${guests}`);
  }

  async function openTable() {
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
      await loadTables();
      enterMenu(body.session.tableNo, body.session.guestCount);
    } catch (err: any) {
      setError(err.message || "开台失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmMerge() {
    if (mergeSelection.length !== 2) {
      setError("请先选择两张桌子");
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
      await loadTables();
      enterMenu(body.session.tableNo, body.session.guestCount);
    } catch (err: any) {
      setError(err.message || "拼桌失败");
    } finally {
      setSubmitting(false);
    }
  }

  function onTableClick(table: TableItem) {
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
      <header>
        <h1>{t("tables.title", "请选择桌号")}</h1>
        <div className="row">
          <button
            className={mergeMode ? "" : "secondary"}
            type="button"
            onClick={() => {
              setMergeMode((v) => !v);
              setMergeSelection([]);
            }}
          >
            {t("tables.merge", "拼桌")}
          </button>
          <button className="secondary" onClick={loadTables} type="button">{t("common.refresh", "刷新")}</button>
          <button
            className="secondary"
            onClick={() => {
              localStorage.clear();
              router.replace("/");
            }}
            type="button"
          >
            {t("common.logout", "退出")}
          </button>
        </div>
      </header>

      {openingTable ? (
        <div className="panel stack">
          <h3 style={{ margin: 0 }}>{t("tables.opening", "开台：")}{openingTable.tableNo}</h3>
          <label className="stack">
            {t("tables.guestCount", "用餐人数")}
            <select value={guestCount} onChange={(e) => setGuestCount(Number(e.target.value))}>
              {GUEST_OPTIONS.map((count) => (
                <option key={count} value={count}>{count} 人</option>
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
        <div className="panel stack">
          <div className="muted">{t("tables.mergeModeHint", "拼桌模式：选择两张空闲桌，确认后合并为一个桌号。")}</div>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>{t("tables.selected", "已选择")}：{mergeSelection.join(" + ") || t("tables.noneSelected", "未选择")}</div>
            <div className="row">
              <select value={mergeGuestCount} onChange={(e) => setMergeGuestCount(Number(e.target.value))}>
                {GUEST_OPTIONS.map((count) => (
                  <option key={count} value={count}>{count} 人</option>
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
        {columns.map((items, idx) => (
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
                      ? `${t("tables.opened", "已开台")} · ${table.guestCount || "?"}人`
                      : t("tables.idle", "空闲")}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {error ? <div className="muted">{error}</div> : null}

      <BottomNav />
    </div>
  );
}
