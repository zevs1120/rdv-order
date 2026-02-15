"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson, getStoredAuth } from "../../../lib/client-api";
import { useI18n } from "../../components/i18n-provider";
import ManageTabs from "../../components/manage-tabs";
import BottomNav from "../../components/bottom-nav";
import { localizeMenuText } from "../../../lib/menu-text";

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

const GROUP_OPTIONS: Array<{ value: MenuGroup; labelZh: string; labelEn: string }> = [
  { value: "breakfast", labelZh: "早餐", labelEn: "Breakfast" },
  { value: "lunch_dinner", labelZh: "午晚餐", labelEn: "Lunch/Dinner" },
  { value: "cocktail", labelZh: "鸡尾酒", labelEn: "Cocktail" }
];

const DEFAULT_CATEGORY_OPTIONS: Record<MenuGroup, string[]> = {
  breakfast: ["Breakfast Set", "Eggs", "Bread", "Coffee", "Juice"],
  lunch_dinner: ["Filipino Food", "Soup", "Salad", "Pasta", "Rice", "Dessert"],
  cocktail: ["Classic", "Signature", "Mocktail", "Beer", "Wine", "Spirits"]
};

const SORT_OPTIONS = [0, 10, 20, 30, 40, 50, 100, 200, 500, 999];

function getDefaultCategory(group: MenuGroup) {
  return DEFAULT_CATEGORY_OPTIONS[group][0] || "";
}

export default function MenuAdminPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [baseline, setBaseline] = useState<Record<string, { name: string; price: number }>>({});

  const [form, setForm] = useState({
    name: "",
    price: "",
    menuGroup: "lunch_dinner" as MenuGroup,
    itemType: "single" as ItemType,
    category: getDefaultCategory("lunch_dinner"),
    sortOrder: "0"
  });

  async function loadItems() {
    setLoading(true);
    setError("");
    try {
      const body = await apiFetchJson<{ items: MenuItem[] }>("/api/admin/menu-items", {
        timeoutMs: 6000,
        retries: 1
      });
      const nextItems = body.items || [];
      setItems(nextItems);
      const nextBaseline: Record<string, { name: string; price: number }> = {};
      for (const item of nextItems) {
        nextBaseline[item.id] = {
          name: item.name,
          price: item.price
        };
      }
      setBaseline(nextBaseline);
    } catch (err: any) {
      setError(err.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }

  const categoryOptions = useMemo(() => {
    const fromItems = items
      .filter((item) => item.menu_group === form.menuGroup)
      .map((item) => (item.category || "").trim())
      .filter(Boolean);
    return Array.from(new Set([...DEFAULT_CATEGORY_OPTIONS[form.menuGroup], ...fromItems]));
  }, [form.menuGroup, items]);

  useEffect(() => {
    if (!categoryOptions.includes(form.category)) {
      setForm((prev) => ({ ...prev, category: categoryOptions[0] || "" }));
    }
  }, [categoryOptions, form.category]);

  async function createItem() {
    setSavingNew(true);
    setError("");
    try {
      const name = form.name.trim();
      const price = Number(form.price);

      if (!name) {
        throw new Error(lang === "en" ? "Dish name is required" : "请填写菜品名称");
      }
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error(lang === "en" ? "Price must be greater than 0" : "价格必须大于 0");
      }

      await apiFetchJson("/api/admin/menu-items", {
        method: "POST",
        body: {
          name,
          price: Math.round(price),
          category: form.category || null,
          description: null,
          menuGroup: form.menuGroup,
          itemType: form.itemType,
          sortOrder: Number(form.sortOrder)
        },
        timeoutMs: 7000,
        retries: 0
      });

      setForm({
        name: "",
        price: "",
        menuGroup: form.menuGroup,
        itemType: "single",
        category: getDefaultCategory(form.menuGroup),
        sortOrder: "0"
      });
      await loadItems();
    } catch (err: any) {
      setError(err.message || "创建失败");
    } finally {
      setSavingNew(false);
    }
  }

  function isDirty(item: MenuItem) {
    const base = baseline[item.id];
    if (!base) return true;
    return base.name !== item.name || base.price !== item.price;
  }

  async function saveAllChanges() {
    setError("");
    const changed = items.filter(isDirty);
    if (changed.length === 0) return;

    setSavingBatch(true);
    try {
      for (const item of changed) {
        await apiFetchJson(`/api/admin/menu-items/${item.id}`, {
          method: "PATCH",
          body: {
            name: item.name,
            price: item.price,
            isActive: true
          },
          timeoutMs: 7000,
          retries: 0
        });
      }
      await loadItems();
    } catch (err: any) {
      setError(err.message || "保存失败");
    } finally {
      setSavingBatch(false);
    }
  }

  async function deleteItem(id: string) {
    const confirmed = window.confirm(lang === "en" ? "Delete this dish?" : "确认删除此菜品？");
    if (!confirmed) return;
    setDeletingId(id);
    setError("");
    try {
      await apiFetchJson(`/api/admin/menu-items/${id}`, {
        method: "DELETE",
        timeoutMs: 7000,
        retries: 0
      });
      setItems((prev) => prev.filter((item) => item.id !== id));
      setBaseline((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err: any) {
      setError(err.message || "删除失败");
    } finally {
      setDeletingId("");
    }
  }

  useEffect(() => {
    const auth = getStoredAuth();
    if (auth.role !== "manager") {
      router.replace("/");
      return;
    }
    void loadItems();
  }, [router]);

  const filteredItems = useMemo(() => {
    const key = query.trim().toLowerCase();
    if (!key) return items;
    return items.filter((item) => `${item.name} ${item.category || ""}`.toLowerCase().includes(key));
  }, [items, query]);

  function groupLabel(group: MenuGroup) {
    const found = GROUP_OPTIONS.find((option) => option.value === group);
    if (!found) return group;
    return lang === "en" ? found.labelEn : found.labelZh;
  }

  return (
    <div className="stack">
      <header>
        <h1>{t("admin.title", "菜单管理")}</h1>
        <div className="row">
          <button className="secondary compact-btn" onClick={() => { void loadItems(); }}>
            {t("common.refresh", "刷新")}
          </button>
          <button className="secondary compact-btn" onClick={() => { localStorage.clear(); router.replace("/"); }}>
            {t("common.logout", "退出")}
          </button>
        </div>
      </header>

      <ManageTabs />

      <div className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>{t("admin.newItem", "新增菜品")}</h3>
          <button
            type="button"
            className="secondary compact-btn"
            onClick={() => setShowCreateForm((v) => !v)}
          >
            {showCreateForm ? (lang === "en" ? "Hide" : "收起") : (lang === "en" ? "Open" : "打开")}
          </button>
        </div>

        {showCreateForm ? (
        <div className="menu-create-form">
          <label className="stack">
            <span>{t("admin.name", "名称")}</span>
            <input
              placeholder={t("admin.name", "名称")}
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </label>

          <label className="stack">
            <span>{t("admin.price", "价格")}</span>
            <input
              placeholder={t("admin.price", "价格")}
              inputMode="numeric"
              value={form.price}
              onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
            />
          </label>

          <label className="stack">
            <span>{t("admin.group", "菜单")}</span>
            <select
              value={form.menuGroup}
              onChange={(e) => {
                const nextGroup = e.target.value as MenuGroup;
                setForm((prev) => ({
                  ...prev,
                  menuGroup: nextGroup,
                  category: getDefaultCategory(nextGroup)
                }));
              }}
            >
              {GROUP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{groupLabel(option.value)}</option>
              ))}
            </select>
          </label>

          <label className="stack">
            <span>{t("admin.category", "分类")}</span>
            <select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>{localizeMenuText(category, lang)}</option>
              ))}
            </select>
          </label>

          <label className="stack">
            <span>{t("admin.type", "类型")}</span>
            <select value={form.itemType} onChange={(e) => setForm((prev) => ({ ...prev, itemType: e.target.value as ItemType }))}>
              <option value="single">Single</option>
              <option value="set">Set</option>
            </select>
          </label>

          <label className="stack">
            <span>{t("admin.sort", "排序")}</span>
            <select value={form.sortOrder} onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}>
              {SORT_OPTIONS.map((sort) => (
                <option key={sort} value={String(sort)}>{sort}</option>
              ))}
            </select>
          </label>

          <button type="button" onClick={() => { void createItem(); }} disabled={savingNew}>
            {savingNew ? t("admin.saving", "保存中...") : t("admin.create", "新增")}
          </button>
        </div>
        ) : null}
      </div>

      <div className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>{t("admin.allItems", "全部菜品")}</h3>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("common.search", "搜索")}
            style={{ maxWidth: 220 }}
          />
        </div>
        {loading ? <div className="muted">{t("common.loading", "加载中...")}</div> : null}
        {error ? <div className="muted">{error}</div> : null}
        <div className="menu-simple-list">
          {filteredItems.map((item) => (
            <div key={item.id} className="menu-simple-row">
              <div className="menu-simple-name stack" style={{ gap: 2 }}>
                <input
                  value={item.name}
                  onChange={(e) => setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, name: e.target.value } : it))}
                />
                {localizeMenuText(item.name, lang) !== item.name ? (
                  <div className="muted">{localizeMenuText(item.name, lang)}</div>
                ) : null}
              </div>
              <input
                className="menu-simple-price"
                value={String(item.price)}
                onChange={(e) => setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, price: Number(e.target.value || 0) } : it))}
              />
              <button
                type="button"
                className="secondary compact-btn"
                onClick={() => { void deleteItem(item.id); }}
                disabled={deletingId === item.id}
              >
                {deletingId === item.id ? (lang === "en" ? "Deleting..." : "删除中...") : (lang === "en" ? "Delete" : "删除")}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="menu-save-bar">
        <button
          type="button"
          onClick={() => { void saveAllChanges(); }}
          disabled={savingBatch || items.filter(isDirty).length === 0}
        >
          {savingBatch ? t("admin.saving", "保存中...") : t("common.save", "保存")}
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
