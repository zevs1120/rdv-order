"use client";

import { useEffect, useState } from "react";

type MenuGroup = "breakfast" | "lunch_dinner" | "cocktail";
type ItemType = "single" | "set";

type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string | null;
  description: string | null;
  menu_group: MenuGroup;
  item_type: ItemType;
  is_active: boolean;
  sort_order: number;
};

const GROUP_OPTIONS: Array<{ value: MenuGroup; label: string }> = [
  { value: "breakfast", label: "早餐" },
  { value: "lunch_dinner", label: "午晚餐" },
  { value: "cocktail", label: "鸡尾酒" }
];

export default function MenuAdminPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [menuGroup, setMenuGroup] = useState<MenuGroup>("lunch_dinner");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    price: "",
    category: "",
    description: "",
    menuGroup: "lunch_dinner" as MenuGroup,
    itemType: "single" as ItemType,
    sortOrder: "0"
  });

  useEffect(() => {
    const role = localStorage.getItem("rdv_role");
    if (role !== "manager") {
      window.location.href = "/";
      return;
    }
    loadItems(menuGroup);
  }, [menuGroup]);

  async function loadItems(group: MenuGroup) {
    setError("");
    const token = localStorage.getItem("rdv_token");
    const res = await fetch(`/api/admin/menu-items?menuGroup=${group}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error || "加载失败");
      return;
    }
    setItems(body.items || []);
  }

  async function createItem() {
    setSaving(true);
    setError("");
    try {
      const token = localStorage.getItem("rdv_token");
      const res = await fetch("/api/admin/menu-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: form.name,
          price: Number(form.price),
          category: form.category || null,
          description: form.description || null,
          menuGroup: form.menuGroup,
          itemType: form.itemType,
          sortOrder: Number(form.sortOrder)
        })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "创建失败");
      }
      setForm({
        name: "",
        price: "",
        category: "",
        description: "",
        menuGroup,
        itemType: "single",
        sortOrder: "0"
      });
      await loadItems(menuGroup);
    } catch (err: any) {
      setError(err.message || "创建失败");
    } finally {
      setSaving(false);
    }
  }

  async function updateItem(item: MenuItem) {
    const token = localStorage.getItem("rdv_token");
    const res = await fetch(`/api/admin/menu-items/${item.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: item.name,
        price: item.price,
        category: item.category,
        description: item.description,
        menuGroup: item.menu_group,
        itemType: item.item_type,
        isActive: item.is_active,
        sortOrder: item.sort_order
      })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error || "更新失败");
      return;
    }

    await loadItems(menuGroup);
  }

  return (
    <div className="stack">
      <header>
        <h1>菜单后台管理</h1>
        <div className="row">
          <button className="secondary" onClick={() => (window.location.href = "/summary")}>返回汇总</button>
          <button className="secondary" onClick={() => {
            localStorage.clear();
            window.location.href = "/";
          }}>
            退出
          </button>
        </div>
      </header>

      <div className="card stack">
        <div className="row" style={{ flexWrap: "wrap" }}>
          {GROUP_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={menuGroup === option.value ? "" : "secondary"}
              onClick={() => setMenuGroup(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>新增菜品/套餐</h3>
        <input placeholder="名称" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        <input placeholder="价格（整数）" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} />
        <input placeholder="分类（可选）" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
        <input placeholder="描述（可选）" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        <div className="row">
          <select value={form.menuGroup} onChange={(e) => setForm((p) => ({ ...p, menuGroup: e.target.value as MenuGroup }))}>
            {GROUP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={form.itemType} onChange={(e) => setForm((p) => ({ ...p, itemType: e.target.value as ItemType }))}>
            <option value="single">单品</option>
            <option value="set">套餐</option>
          </select>
          <input placeholder="排序" value={form.sortOrder} onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))} />
        </div>
        <button type="button" onClick={createItem} disabled={saving}>{saving ? "保存中..." : "新增"}</button>
      </div>

      {error && <div className="muted">{error}</div>}

      <div className="card stack">
        <h3 style={{ margin: 0 }}>当前菜单</h3>
        {items.map((item) => (
          <div key={item.id} className="menu-item stack">
            <div className="row">
              <input value={item.name} onChange={(e) => setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, name: e.target.value } : it))} />
              <input value={String(item.price)} onChange={(e) => setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, price: Number(e.target.value || 0) } : it))} />
            </div>
            <div className="row">
              <select value={item.item_type} onChange={(e) => setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, item_type: e.target.value as ItemType } : it))}>
                <option value="single">单品</option>
                <option value="set">套餐</option>
              </select>
              <input value={String(item.sort_order)} onChange={(e) => setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, sort_order: Number(e.target.value || 0) } : it))} />
            </div>
            <div className="row">
              <button type="button" className={item.is_active ? "" : "secondary"} onClick={() => setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, is_active: !it.is_active } : it))}>
                {item.is_active ? "已上架" : "已下架"}
              </button>
              <button type="button" onClick={() => updateItem(item)}>保存变更</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
