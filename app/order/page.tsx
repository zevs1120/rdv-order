"use client";

import { useEffect, useMemo, useState } from "react";

type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string | null;
};

type CartItem = MenuItem & { qty: number };

export default function OrderPage() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [tableNo, setTableNo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/menu")
      .then((r) => r.json())
      .then((data) => setMenu(data.items || []));
  }, []);

  const cart = useMemo(() => menu.filter((m: any) => (m.qty || 0) > 0) as CartItem[], [menu]);
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  function setQty(id: string, qty: number) {
    setMenu((prev) => prev.map((item) => item.id === id ? { ...item, qty } : item));
  }

  async function submitOrder() {
    setError("");
    if (!tableNo) {
      setError("请选择桌号");
      return;
    }
    if (cart.length === 0) {
      setError("请选择菜品");
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("rdv_token");
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          tableNo,
          items: cart.map((c) => ({ menuItemId: c.id, qty: c.qty }))
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "提交失败");
      }
      setMenu((prev) => prev.map((item: any) => ({ ...item, qty: 0 })));
      setTableNo("");
      alert("订单已提交，后厨将自动出单");
    } catch (err: any) {
      setError(err.message || "提交失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <header>
        <h1>新订单</h1>
        <div className="row">
          <button className="secondary" onClick={() => { localStorage.clear(); window.location.href = "/"; }}>退出</button>
        </div>
      </header>
      <div className="card stack">
        <label className="stack">
          桌号
          <input value={tableNo} onChange={(e) => setTableNo(e.target.value)} placeholder="如 A12" />
        </label>
      </div>
      <div className="card">
        <div className="menu-grid">
          {menu.map((item: any) => (
            <div key={item.id} className="menu-item stack">
              <div>{item.name}</div>
              <div className="muted">￥{item.price}</div>
              <div className="row">
                <button className="secondary" onClick={() => setQty(item.id, Math.max(0, (item.qty || 0) - 1))}>-</button>
                <div>{item.qty || 0}</div>
                <button onClick={() => setQty(item.id, (item.qty || 0) + 1)}>+</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="card row" style={{ justifyContent: "space-between" }}>
        <div>合计：￥{total}</div>
        <button onClick={submitOrder} disabled={loading}>{loading ? "提交中..." : "提交订单"}</button>
      </div>
      {error && <div className="muted">{error}</div>}
    </div>
  );
}
