"use client";

import { useEffect, useMemo, useState } from "react";

type TableItem = {
  tableNo: string;
  baseTables: string[];
  column: number;
  status: "open" | "idle";
  guestCount: number | null;
};

const GUEST_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

export default function TablesPage() {
  const [tables, setTables] = useState<TableItem[]>([]);
  const [error, setError] = useState("");
  const [openingTable, setOpeningTable] = useState<TableItem | null>(null);
  const [guestCount, setGuestCount] = useState(2);
  const [submitting, setSubmitting] = useState(false);

  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [mergeGuestCount, setMergeGuestCount] = useState(4);

  useEffect(() => {
    const token = localStorage.getItem("rdv_token");
    const role = localStorage.getItem("rdv_role");
    if (!token || role !== "waiter") {
      window.location.href = "/";
      return;
    }
    loadTables();
  }, []);

  async function loadTables() {
    setError("");
    try {
      const token = localStorage.getItem("rdv_token");
      const res = await fetch("/api/tables", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "加载桌台失败");
      }
      setTables(body.tables || []);
    } catch (err: any) {
      setError(err.message || "加载桌台失败");
    }
  }

  const columns = useMemo(() => {
    return [1, 2, 3].map((col) => tables.filter((t) => t.column === col));
  }, [tables]);

  function enterMenu(tableNo: string, guests: number) {
    window.location.href = `/order?tableNo=${encodeURIComponent(tableNo)}&guests=${guests}`;
  }

  async function openTable() {
    if (!openingTable) return;
    setSubmitting(true);
    setError("");
    try {
      const token = localStorage.getItem("rdv_token");
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ tableNo: openingTable.tableNo, guestCount })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "开台失败");
      }
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
      const token = localStorage.getItem("rdv_token");
      const [primary, secondary] = mergeSelection;
      const res = await fetch("/api/tables/merge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          primaryTable: primary,
          secondaryTable: secondary,
          guestCount: mergeGuestCount
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "拼桌失败");
      }
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
        <h1>请选择桌号</h1>
        <div className="row">
          <button
            className={mergeMode ? "" : "secondary"}
            type="button"
            onClick={() => {
              setMergeMode((v) => !v);
              setMergeSelection([]);
            }}
          >
            拼桌
          </button>
          <button className="secondary" onClick={loadTables} type="button">刷新</button>
          <button
            className="secondary"
            onClick={() => {
              localStorage.clear();
              window.location.href = "/";
            }}
            type="button"
          >
            退出
          </button>
        </div>
      </header>

      <div className="card bar-banner">吧台（BAR）</div>

      {mergeMode ? (
        <div className="card stack">
          <div className="muted">拼桌模式：选择两张绿色桌台，确认后合并成一个桌号（例如 A1+A2）。</div>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>已选择：{mergeSelection.join(" + ") || "未选择"}</div>
            <div className="row">
              <select value={mergeGuestCount} onChange={(e) => setMergeGuestCount(Number(e.target.value))}>
                {GUEST_OPTIONS.map((count) => (
                  <option key={count} value={count}>{count} 人</option>
                ))}
              </select>
              <button type="button" onClick={confirmMerge} disabled={submitting || mergeSelection.length !== 2}>
                {submitting ? "处理中..." : "确认拼桌"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="card table-layout">
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
                    {table.status === "open" ? `已开台 · ${table.guestCount || "?"}人` : "空闲"}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {error ? <div className="muted">{error}</div> : null}

      {openingTable ? (
        <div className="card stack">
          <h3 style={{ margin: 0 }}>开台：{openingTable.tableNo}</h3>
          <label className="stack">
            用餐人数
            <select value={guestCount} onChange={(e) => setGuestCount(Number(e.target.value))}>
              {GUEST_OPTIONS.map((count) => (
                <option key={count} value={count}>{count} 人</option>
              ))}
            </select>
          </label>
          <div className="row">
            <button className="secondary" type="button" onClick={() => setOpeningTable(null)}>取消</button>
            <button type="button" onClick={openTable} disabled={submitting}>{submitting ? "开台中..." : "确认开台"}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
