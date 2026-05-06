"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson } from "../../lib/client-api";
import { safeStorageClear } from "../../lib/browser-storage";
import { useI18n } from "../components/i18n-provider";
import { formatItemQtyDisplay } from "../../lib/qty-display";
import { Button, Card } from "../../components/ui";

export default function SummaryPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  async function loadSummary() {
    setError("");
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const body = await apiFetchJson(`/api/summary?${params.toString()}`, {
        timeoutMs: 7000,
        retries: 1
      });
      setData(body);
    } catch (err: any) {
      setError(err.message || t("summary.loadFailed", "Failed to load summary"));
    }
  }

  return (
    <div className="stack manage-subpage-screen">
      <div className="manage-subpage-scroll stack">
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => { router.push("/admin/menu"); }}>
            {t("manage.menu", "菜单后台")}
          </Button>
          <Button variant="secondary" onClick={() => { safeStorageClear("local"); router.replace("/"); }}>
            {t("common.logout", "退出")}
          </Button>
        </div>

      <Card className="stack">
        <label className="stack">
          Start (ISO)
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="2026-02-15T00:00:00+08:00" />
        </label>
        <label className="stack">
          End (ISO)
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="2026-02-15T23:59:59+08:00" />
        </label>
        <Button type="button" onClick={loadSummary}>{t("common.search", "Search")}</Button>
      </Card>
      {error && <div className="muted">{error}</div>}
      {data && (
        <Card className="stack">
          <div className="row">
            <div className="tag">{lang === "en" ? `Orders: ${data.orderCount}` : `订单数: ${data.orderCount}`}</div>
            <div className="tag">{lang === "en" ? `Total: ₱${data.totalAmount}` : `总金额: ₱${data.totalAmount}`}</div>
          </div>
          <div className="order-list">
            {data.items.map((item: any) => (
              <div key={item.menu_item_id || item.menuItemId} className="row" style={{ justifyContent: "space-between" }}>
                <div>{item.name}</div>
                <div>{formatItemQtyDisplay(item.name, item.qty, lang)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
      </div>
    </div>
  );
}
