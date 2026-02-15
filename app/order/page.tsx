"use client";

import { useEffect, useMemo, useState } from "react";

type ShiftKey = "breakfast" | "lunch" | "dinner" | "cocktail";

type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string | null;
  description: string | null;
  menu_group: "breakfast" | "lunch_dinner" | "cocktail";
  item_type: "single" | "set";
  qty?: number;
};

type BillItem = {
  menu_item_id: string;
  name: string;
  qty: number;
  amount: number;
};

type CartItem = MenuItem & { qty: number };

const SHIFT_OPTIONS: Array<{ key: ShiftKey; label: string }> = [
  { key: "breakfast", label: "早餐" },
  { key: "lunch", label: "午餐" },
  { key: "dinner", label: "晚餐" },
  { key: "cocktail", label: "鸡尾酒" }
];

export default function OrderPage() {
  const [tableNo, setTableNo] = useState("");
  const [guests, setGuests] = useState(0);

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shift, setShift] = useState<ShiftKey>("lunch");
  const [keyword, setKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [paramsReady, setParamsReady] = useState(false);

  const [showBill, setShowBill] = useState(false);
  const [billLoading, setBillLoading] = useState(false);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [billTotal, setBillTotal] = useState(0);
  const [billQty, setBillQty] = useState(0);
  const isMergedTable = tableNo.includes("+");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTableNo(params.get("tableNo") || "");
    setGuests(Number(params.get("guests") || 0));
    setParamsReady(true);
  }, []);

  useEffect(() => {
    if (!paramsReady) return;
    const role = localStorage.getItem("rdv_role");
    if (role !== "waiter") {
      window.location.href = "/";
      return;
    }
    if (!tableNo || !Number.isInteger(guests) || guests <= 0) {
      window.location.href = "/tables";
      return;
    }
  }, [tableNo, guests, paramsReady]);

  useEffect(() => {
    fetch(`/api/menu?shift=${shift}`)
      .then((r) => r.json())
      .then((data) => {
        const items: MenuItem[] = data.items || [];
        setMenu(items);
      })
      .catch(() => setMenu([]));
  }, [shift]);

  useEffect(() => {
    const categories = Array.from(new Set(menu.map((item) => item.category || "Uncategorized")));
    if (categories.length === 0) {
      setSelectedCategory("");
      return;
    }
    if (!selectedCategory || !categories.includes(selectedCategory)) {
      setSelectedCategory(categories[0]);
    }
  }, [menu, selectedCategory]);

  const filteredMenu = useMemo(() => {
    const key = keyword.trim().toLowerCase();
    if (!key) return menu;
    return menu.filter((item) => {
      const target = `${item.name} ${item.category || ""}`.toLowerCase();
      return target.includes(key);
    });
  }, [menu, keyword]);

  const categories = useMemo(
    () => Array.from(new Set(filteredMenu.map((item) => item.category || "Uncategorized"))),
    [filteredMenu]
  );

  const visibleItems = useMemo(() => {
    if (!selectedCategory) return filteredMenu;
    return filteredMenu.filter((item) => (item.category || "Uncategorized") === selectedCategory);
  }, [filteredMenu, selectedCategory]);

  const cart = useMemo(() => menu.filter((m) => (m.qty || 0) > 0) as CartItem[], [menu]);
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  function setQty(id: string, qty: number) {
    setMenu((prev) => prev.map((item) => (item.id === id ? { ...item, qty } : item)));
  }

  async function loadBill() {
    if (!tableNo) return;
    setBillLoading(true);
    try {
      const token = localStorage.getItem("rdv_token");
      const res = await fetch(`/api/tables/bill?tableNo=${encodeURIComponent(tableNo)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "账单加载失败");
      }
      setBillItems(body.items || []);
      setBillTotal(body.totalAmount || 0);
      setBillQty(body.totalQty || 0);
    } catch (err: any) {
      setError(err.message || "账单加载失败");
    } finally {
      setBillLoading(false);
    }
  }

  async function submitOrder() {
    setError("");
    if (!tableNo) {
      setError("桌号缺失，请重新选桌");
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
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          tableNo,
          guestCount: guests,
          shift,
          items: cart.map((c) => ({ menuItemId: c.id, qty: c.qty }))
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "提交失败");
      }

      setMenu((prev) => prev.map((item) => ({ ...item, qty: 0 })));
      await loadBill();
      setShowBill(true);
      alert("订单已提交，后厨将自动出单");
    } catch (err: any) {
      setError(err.message || "提交失败");
    } finally {
      setLoading(false);
    }
  }

  async function checkout() {
    const confirmed = window.confirm(`确认结账并关台吗？\n桌号：${tableNo}`);
    if (!confirmed) return;

    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("rdv_token");
      const res = await fetch("/api/tables/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ tableNo })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "结账失败");
      }

      window.alert(`结账完成\n订单数：${body.orderCount}\n总金额：₱${body.totalAmount}`);
      window.location.href = "/tables";
    } catch (err: any) {
      setError(err.message || "结账失败");
    } finally {
      setLoading(false);
    }
  }

  async function unmergeTable() {
    if (!isMergedTable) return;
    const confirmed = window.confirm(`确认取消拼桌吗？\n当前桌号：${tableNo}`);
    if (!confirmed) return;

    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("rdv_token");
      const res = await fetch("/api/tables/unmerge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ tableNo })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "取消拼桌失败");
      }
      window.alert(`取消拼桌成功\n当前桌号：${body.tableNo}\n释放桌号：${body.releasedTable}`);
      window.location.href = `/order?tableNo=${encodeURIComponent(body.tableNo)}&guests=${body.guestCount}`;
    } catch (err: any) {
      setError(err.message || "取消拼桌失败");
    } finally {
      setLoading(false);
    }
  }

  async function closeTable() {
    const confirmed = window.confirm(`确认关台吗？\n桌号：${tableNo}`);
    if (!confirmed) return;

    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("rdv_token");
      const res = await fetch("/api/tables/close", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ tableNo })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "关台失败");
      }
      window.alert(`关台完成\n桌号：${body.tableNo}`);
      window.location.href = "/tables";
    } catch (err: any) {
      setError(err.message || "关台失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <header>
        <h1>新订单</h1>
        <div className="row order-actions">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索菜品"
            style={{ minWidth: 180 }}
          />
          <button className="secondary compact-btn" type="button" onClick={() => { window.location.href = "/tables"; }}>返回</button>
          <button className="secondary compact-btn" type="button" onClick={async () => { setShowBill(true); await loadBill(); }}>已点</button>
          {isMergedTable ? <button className="secondary" type="button" onClick={unmergeTable}>取消拼桌</button> : null}
          <button className="secondary compact-btn" type="button" onClick={checkout}>结账</button>
          <button className="secondary compact-btn" type="button" onClick={closeTable}>关台</button>
        </div>
      </header>

      {showBill ? (
        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>已点餐品（{tableNo}）</h3>
            <button className="secondary" type="button" onClick={() => setShowBill(false)}>关闭</button>
          </div>
          {billLoading ? <div className="muted">账单加载中...</div> : null}
          {!billLoading && billItems.length === 0 ? <div className="muted">暂无已点餐品</div> : null}
          {!billLoading ? (
            <div className="order-list">
              {billItems.map((item) => (
                <div key={item.menu_item_id} className="row" style={{ justifyContent: "space-between" }}>
                  <div>{item.name} x{item.qty}</div>
                  <div>₱{item.amount}</div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>总数量：{billQty}</strong>
            <strong>总金额：₱{billTotal}</strong>
          </div>
          <button type="button" onClick={checkout} disabled={loading}>{loading ? "处理中..." : "确认结账并关台"}</button>
        </div>
      ) : null}

      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div><strong>桌号：</strong>{tableNo || "-"}</div>
          <div><strong>人数：</strong>{guests > 0 ? `${guests} 人` : "-"}</div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
          {SHIFT_OPTIONS.map((option) => (
            <button
              key={option.key}
              className={shift === option.key ? "" : "secondary"}
              onClick={() => setShift(option.key)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="order-layout">
          <aside className="category-sidebar">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={selectedCategory === category ? "category-btn active" : "category-btn"}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </button>
            ))}
          </aside>
          <div className="menu-content">
            <div className="menu-grid">
              {visibleItems.map((item) => (
                <div key={item.id} className="menu-item stack">
                  <div>
                    {item.name}
                    {item.item_type === "set" ? "（套餐）" : ""}
                  </div>
                  <div className="muted">₱{item.price}</div>
                  {item.description ? <div className="muted">{item.description}</div> : null}
                  <div className="row">
                    <button
                      className="secondary"
                      onClick={() => setQty(item.id, Math.max(0, (item.qty || 0) - 1))}
                      type="button"
                    >
                      -
                    </button>
                    <div>{item.qty || 0}</div>
                    <button onClick={() => setQty(item.id, (item.qty || 0) + 1)} type="button">+</button>
                  </div>
                </div>
              ))}
              {visibleItems.length === 0 ? <div className="muted">该分类暂无菜品</div> : null}
            </div>
          </div>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="card">
          <div className="muted">当前班次暂无可用菜单</div>
        </div>
      ) : null}

      <div className="card row" style={{ justifyContent: "space-between" }}>
        <div>当前加购合计：₱{total}</div>
        <button onClick={submitOrder} disabled={loading}>{loading ? "提交中..." : "提交订单"}</button>
      </div>
      {error && <div className="muted">{error}</div>}
    </div>
  );
}
