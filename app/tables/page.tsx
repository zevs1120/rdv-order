"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../components/bottom-nav";
import { apiFetchJson, getStoredAuth } from "../../lib/client-api";
import { useI18n } from "../components/i18n-provider";
import { useActionGuard } from "../../lib/use-action-guard";
import { AppBar, BottomSheet, Button, Card, EmptyState, IconButton, Skeleton } from "../../components/ui";

type TableItem = {
  tableNo: string;
  baseTables: string[];
  column: number;
  status: "open" | "idle";
  guestCount: number | null;
  openedAt?: string | null;
  currentAmount?: number;
};

export default function TablesPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [tables, setTables] = useState<TableItem[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [error, setError] = useState("");

  const [openingTable, setOpeningTable] = useState<TableItem | null>(null);
  const [guestCount, setGuestCount] = useState(2);

  const [submitting, setSubmitting] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [mergeGuestCount, setMergeGuestCount] = useState(4);
  const [, setMinuteTick] = useState(0);
  const canRunAction = useActionGuard();

  useEffect(() => {
    const { token, role } = getStoredAuth();
    if (!token || (role !== "waiter" && role !== "manager")) {
      router.replace("/");
      return;
    }
    void loadTables();
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMinuteTick((prev) => prev + 1);
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadTables() {
    setLoadingTables(true);
    setError("");
    try {
      const body = await apiFetchJson<{ tables: TableItem[] }>("/api/tables", { timeoutMs: 5000, retries: 1 });
      setTables(body.tables || []);
    } catch (err: any) {
      const message = String(err?.message || "");
      if (message === "未登录" || message === "Not signed in") {
        localStorage.removeItem("rdv_token");
        localStorage.removeItem("rdv_role");
        router.replace("/");
        return;
      }
      setError(message || t("tables.loadFailed", "Failed to load tables"));
    } finally {
      setLoadingTables(false);
    }
  }

  function enterMenu(tableNo: string, guests: number) {
    localStorage.setItem("rdv_recent_table", tableNo);
    localStorage.setItem("rdv_recent_guests", String(guests));
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
      setSelectMode(false);
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

    if (selectMode) {
      if (table.status !== "idle") return;
      const base = table.baseTables[0];
      setMergeSelection((prev) => {
        if (prev.includes(base)) return prev.filter((t) => t !== base);
        if (prev.length >= 2) return prev;
        return [...prev, base];
      });
      return;
    }

    if (table.status === "open") {
      enterMenu(table.tableNo, table.guestCount || 1);
      return;
    }

    setGuestCount(2);
    setOpeningTable(table);
  }

  function tableStatusLabel(table: TableItem) {
    if (table.status === "open") return lang === "en" ? "In Service" : "服务中";
    return t("tables.idle", "Idle");
  }

  function openDuration(openedAt?: string | null) {
    if (!openedAt) return "-";
    const diff = Math.max(0, Date.now() - new Date(openedAt).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  }
  
  function formatPhp(amount?: number) {
    return `₱${Math.max(0, Math.round(Number(amount || 0))).toLocaleString("en-US")}`;
  }

  const columns = useMemo(() => {
    const grouped: TableItem[][] = [[], [], []];
    for (const table of tables) {
      const index = Math.min(2, Math.max(0, table.column - 1));
      grouped[index].push(table);
    }
    return grouped;
  }, [tables]);

  return (
    <div className="stack tables-screen">
      <AppBar
        className="tables-appbar"
        title={t("tables.title", "Select Table")}
        right={
          <div className="row tables-toolbar">
            <Button variant="secondary" onClick={loadTables} disabled={loadingTables || submitting}>
              {t("common.refresh", "Refresh")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSelectMode((v) => !v);
                setMergeSelection([]);
              }}
              disabled={submitting || Boolean(openingTable)}
            >
              {selectMode ? (lang === "en" ? "Done" : "完成") : (lang === "en" ? "Multi-select" : "拼桌选择")}
            </Button>
          </div>
        }
      />

      {loadingTables ? (
        <div className="table-grid-shell">
          <Skeleton h={108} />
          <Skeleton h={108} />
          <Skeleton h={108} />
          <Skeleton h={108} />
          <Skeleton h={108} />
          <Skeleton h={108} />
        </div>
      ) : (
        <div className="table-grid-shell">
          {columns.map((items, idx) => (
            <div key={idx} className="table-column">
              {items.map((table) => {
                const selected = mergeSelection.includes(table.baseTables[0]);
                return (
                  <Card
                    key={table.tableNo}
                    className={`table-card ${selected ? "is-selected" : ""} ${table.status === "open" ? "is-open" : ""}`}
                    onClick={() => onTableClick(table)}
                  >
                    <div className="table-card__head">
                      <div className="table-card__title">{table.tableNo}</div>
                      <div className="table-card__status">{tableStatusLabel(table)}</div>
                    </div>
                    <div className="table-card__meta">
                      {table.status === "open" ? (
                        <>
                          <div className="table-card__line">{lang === "en" ? "Guests" : "人数"}: {table.guestCount || 1}</div>
                          <div className="table-card__line">{lang === "en" ? "Time" : "时长"}: {openDuration(table.openedAt)}</div>
                          <div className="table-card__line">{lang === "en" ? "Bill" : "账单"}: {formatPhp(table.currentAmount)}</div>
                        </>
                      ) : (
                        <div className="table-card__idleHint">{lang === "en" ? "Tap to open" : "点击开台"}</div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {!loadingTables && tables.length === 0 ? (
        <EmptyState
          title={lang === "en" ? "No table found" : "未找到桌台"}
          description={lang === "en" ? "Please refresh and try again" : "请刷新后重试"}
        />
      ) : null}

      {error ? <div className="muted">{error}</div> : null}

      <BottomSheet
        open={Boolean(openingTable)}
        onClose={() => setOpeningTable(null)}
        title={
          openingTable
            ? `${lang === "en" ? "Open Table" : "开台"} ${openingTable.tableNo}`
            : null
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpeningTable(null)}>{t("common.cancel", "Cancel")}</Button>
            <Button onClick={openTable} loading={submitting}>{t("tables.confirmOpen", "Confirm Open")}</Button>
          </>
        }
      >
        <div className="table-sheet-stepper">
          <span>{t("tables.guestCount", "Guests")}</span>
          <div className="row" style={{ gap: 8 }}>
            <IconButton
              label={lang === "en" ? "Decrease guests" : "减少人数"}
              icon="−"
              onClick={() => setGuestCount((prev) => Math.max(1, prev - 1))}
            />
            <strong style={{ minWidth: 42, textAlign: "center" }}>{guestCount}</strong>
            <IconButton
              label={lang === "en" ? "Increase guests" : "增加人数"}
              icon="＋"
              onClick={() => setGuestCount((prev) => Math.min(20, prev + 1))}
            />
          </div>
        </div>
      </BottomSheet>

      {selectMode ? (
        <div className="merge-action-bar">
          <div className="muted">
            {t("tables.selected", "Selected")}: {mergeSelection.join(" + ") || t("tables.noneSelected", "None")}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button variant="secondary" onClick={() => setMergeGuestCount((v) => Math.max(1, v - 1))}>-</Button>
            <span>{mergeGuestCount}</span>
            <Button variant="secondary" onClick={() => setMergeGuestCount((v) => Math.min(20, v + 1))}>+</Button>
            <Button onClick={confirmMerge} disabled={mergeSelection.length !== 2 || submitting} loading={submitting}>
              {t("tables.mergeConfirm", "Confirm Merge")}
            </Button>
          </div>
        </div>
      ) : null}

      <BottomNav />
    </div>
  );
}
