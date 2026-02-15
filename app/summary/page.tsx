"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson } from "../../lib/client-api";
import { useI18n } from "../components/i18n-provider";

export default function SummaryPage() {
  const router = useRouter();
  const { t } = useI18n();
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
      setError(err.message || "加载失败");
    }
  }

  return (
    <div className="stack">
      <header>
        <h1>{t("manage.income", "汇总")}</h1>
        <div className="row">
          <button className="secondary" onClick={() => { router.push("/admin/menu"); }}>{t("manage.menu", "菜单后台")}</button>
          <button className="secondary" onClick={() => { localStorage.clear(); router.replace("/"); }}>{t("common.logout", "退出")}</button>
        </div>
      </header>
      <div className="card stack">
        <label className="stack">
          Start (ISO)
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="2026-02-15T00:00:00+08:00" />
        </label>
        <label className="stack">
          End (ISO)
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="2026-02-15T23:59:59+08:00" />
        </label>
        <button onClick={loadSummary}>{t("common.search", "查询")}</button>
      </div>
      {error && <div className="muted">{error}</div>}
      {data && (
        <div className="card stack">
          <div className="row">
            <div className="tag">订单数: {data.orderCount}</div>
            <div className="tag">总金额: ₱{data.totalAmount}</div>
          </div>
          <div className="order-list">
            {data.items.map((item: any) => (
              <div key={item.menu_item_id || item.menuItemId} className="row" style={{ justifyContent: "space-between" }}>
                <div>{item.name}</div>
                <div>{item.qty}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
