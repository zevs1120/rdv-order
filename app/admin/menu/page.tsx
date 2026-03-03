"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetchJson, getStoredAuth } from "../../../lib/client-api";
import { useI18n } from "../../components/i18n-provider";
import ManageTabs from "../../components/manage-tabs";
import BottomNav from "../../components/bottom-nav";
import { localizeMenuText } from "../../../lib/menu-text";

type MenuGroup = "breakfast" | "lunch_dinner" | "cocktail" | "set_menu";
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
  allergens?: string[];
};

const GROUP_OPTIONS: Array<{ value: MenuGroup; labelZh: string; labelEn: string }> = [
  { value: "breakfast", labelZh: "早餐", labelEn: "Breakfast" },
  { value: "lunch_dinner", labelZh: "午晚餐", labelEn: "Lunch/Dinner" },
  { value: "cocktail", labelZh: "鸡尾酒", labelEn: "Cocktail" },
  { value: "set_menu", labelZh: "套餐", labelEn: "Package" }
];

const DEFAULT_CATEGORY_OPTIONS: Record<MenuGroup, string[]> = {
  breakfast: ["Breakfast Set", "Eggs", "Bread", "Coffee", "Juice"],
  lunch_dinner: ["Filipino Food", "Soup", "Salad", "Pasta", "Rice", "Dessert"],
  cocktail: ["Classic", "Signature", "Mocktail", "Beer", "Wine", "Spirits"],
  set_menu: ["套餐"]
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
  const [showAllItems, setShowAllItems] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [baseline, setBaseline] = useState<Record<string, { name: string; price: number; allergens: string[] }>>({});

  const [form, setForm] = useState({
    name: "",
    price: "",
    menuGroup: "lunch_dinner" as MenuGroup,
    itemType: "single" as ItemType,
    category: getDefaultCategory("lunch_dinner"),
    allergens: "",
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
      const nextBaseline: Record<string, { name: string; price: number; allergens: string[] }> = {};
      for (const item of nextItems) {
        nextBaseline[item.id] = {
          name: item.name,
          price: item.price,
          allergens: Array.isArray(item.allergens) ? item.allergens : []
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
          allergens: form.allergens.split(",").map((v) => v.trim()).filter(Boolean),
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
        allergens: "",
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
    const allergens = Array.isArray(item.allergens) ? item.allergens : [];
    return base.name !== item.name || base.price !== item.price || base.allergens.join(",") !== allergens.join(",");
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
            allergens: item.allergens || [],
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

  async function editAllergens(item: MenuItem) {
    const value = window.prompt("过敏原（用英文逗号分隔）", (item.allergens || []).join(", "));
    if (value === null) return;
    const allergens = value.split(",").map((v) => v.trim()).filter(Boolean);
    setItems((prev) => prev.map((row) => row.id === item.id ? { ...row, allergens } : row));
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
          <button type="button" className="secondary compact-btn" onClick={() => { void loadItems(); }}>
            {t("common.refresh", "刷新")}
          </button>
          <button type="button" className="secondary compact-btn" onClick={() => { localStorage.clear(); router.replace("/"); }}>
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
            {showCreateForm ? t("common.collapse", "收起") : t("common.expand", "展开")}
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

          <label className="stack">
            <span>过敏原（逗号分隔）</span>
            <input
              placeholder="eg. peanut, shellfish, dairy"
              value={form.allergens}
              onChange={(e) => setForm((prev) => ({ ...prev, allergens: e.target.value }))}
            />
          </label>

          <button type="button" onClick={() => { void createItem(); }} disabled={savingNew}>
            {savingNew ? t("admin.saving", "保存中...") : t("admin.create", "新增")}
          </button>
          <div className="muted">{t("admin.allergenHint", "过敏原标记：新增时在输入框填写，已存在菜品可在下方点“过敏原”修改。")}</div>
        </div>
        ) : null}
      </div>

      <div className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>{t("admin.allItems", "全部菜品")}</h3>
          <div className="row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("common.search", "搜索")}
              style={{ maxWidth: 220 }}
            />
            <button
              type="button"
              className="secondary compact-btn"
              onClick={() => setShowAllItems((v) => !v)}
            >
              {showAllItems ? t("common.collapse", "收起") : t("common.expand", "展开")}
            </button>
          </div>
        </div>
        {loading ? <div className="muted">{t("common.loading", "加载中...")}</div> : null}
        {error ? <div className="muted">{error}</div> : null}
        {showAllItems ? (
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
                {Array.isArray(item.allergens) && item.allergens.length > 0 ? (
                  <div className="muted">过敏原：{item.allergens.join(", ")}</div>
                ) : null}
              </div>
              <input
                className="menu-simple-price"
                value={String(item.price)}
                onChange={(e) => setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, price: Number(e.target.value || 0) } : it))}
              />
              <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="secondary compact-btn"
                  onClick={() => { void editAllergens(item); }}
                >
                  过敏原
                </button>
                <button
                  type="button"
                  className="secondary compact-btn"
                  onClick={() => { void deleteItem(item.id); }}
                  disabled={deletingId === item.id}
                >
                  {deletingId === item.id ? (lang === "en" ? "Deleting..." : "删除中...") : (lang === "en" ? "Delete" : "删除")}
                </button>
              </div>
            </div>
          ))}
        </div>
        ) : null}
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
