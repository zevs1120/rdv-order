"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../components/bottom-nav";
import { apiFetchJson, getStoredAuth } from "../../lib/client-api";
import { useI18n } from "../components/i18n-provider";
import { localizeMenuText, shortCategoryLabel } from "../../lib/menu-text";
import { useActionGuard } from "../../lib/use-action-guard";

type ShiftKey = "breakfast" | "lunch" | "dinner" | "cocktail" | "package";
type CustomDishMode = "temporary" | "permanent";
type UserRole = "waiter" | "manager" | "";

type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string | null;
  description: string | null;
  allergens?: string[];
  menu_group: "breakfast" | "lunch_dinner" | "cocktail" | "set_menu";
  item_type: "single" | "set";
  qty?: number;
  note?: string;
};

type BillItem = {
  menu_item_id: string;
  name: string;
  qty: number;
  amount: number;
  note?: string | null;
};

type BillOrder = {
  id: string;
  status: string;
  created_at: string;
  item_amount: number;
  charge_amount: number;
  total_amount: number;
  items: BillItem[];
  charges: Array<{
    id: string;
    charge_type: "discount" | "service_fee";
    amount: number;
    mode: "amount" | "percent";
    value: number;
    note: string | null;
  }>;
};

type CartItem = MenuItem & { qty: number };

type OrderDraft = {
  tableNo: string;
  shift: ShiftKey;
  keyword: string;
  selectedCategory: string;
  items: Array<{
    id: string;
    qty: number;
    note?: string;
  }>;
  updatedAt: number;
};

const SHIFT_OPTIONS: Array<{ key: ShiftKey; label: string }> = [
  { key: "breakfast", label: "早餐" },
  { key: "lunch", label: "午餐" },
  { key: "dinner", label: "晚餐" },
  { key: "cocktail", label: "鸡尾酒" },
  { key: "package", label: "套餐" }
];

export default function OrderPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [role, setRole] = useState<UserRole>("");
  const [tableNo, setTableNo] = useState("");
  const [guests, setGuests] = useState(0);

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuLoading, setMenuLoading] = useState(false);
  const [shift, setShift] = useState<ShiftKey>("lunch");
  const [keyword, setKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [paramsReady, setParamsReady] = useState(false);

  const [showBill, setShowBill] = useState(false);
  const [billLoading, setBillLoading] = useState(false);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [billOrders, setBillOrders] = useState<BillOrder[]>([]);
  const [billTotal, setBillTotal] = useState(0);
  const [billQty, setBillQty] = useState(0);
  const [showAddDish, setShowAddDish] = useState(false);
  const [addingDish, setAddingDish] = useState(false);
  const [addDishMode, setAddDishMode] = useState<CustomDishMode>("temporary");
  const [addDishForm, setAddDishForm] = useState({
    name: "",
    price: "",
    category: "",
    description: ""
  });

  const menuCacheRef = useRef<Partial<Record<ShiftKey, MenuItem[]>>>({});
  const menuRequestRef = useRef(0);
  const menuIndexRef = useRef<Map<string, number>>(new Map());
  const draftRef = useRef<OrderDraft | null>(null);
  const isMergedTable = tableNo.includes("+");
  const canRunAction = useActionGuard();
  const deferredKeyword = useDeferredValue(keyword);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTableNo(params.get("tableNo") || "");
    setGuests(Number(params.get("guests") || 0));
    setParamsReady(true);
  }, []);

  useEffect(() => {
    if (!paramsReady) return;
    const auth = getStoredAuth();
    setRole(auth.role as UserRole);
    if (auth.role !== "waiter" && auth.role !== "manager") {
      router.replace("/");
      return;
    }
    if (!tableNo || !Number.isInteger(guests) || guests <= 0) {
      router.replace("/tables");
      return;
    }
  }, [tableNo, guests, paramsReady, router]);

  useEffect(() => {
    menuCacheRef.current = {};
    setMenu([]);
  }, [tableNo]);

  useEffect(() => {
    if (!paramsReady || !tableNo) return;
    const key = `rdv_order_draft:${tableNo}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        draftRef.current = null;
        return;
      }
      const parsed = JSON.parse(raw) as OrderDraft;
      if (!parsed || parsed.tableNo !== tableNo) {
        draftRef.current = null;
        return;
      }
      draftRef.current = parsed;
      if (parsed.shift && SHIFT_OPTIONS.some((item) => item.key === parsed.shift)) {
        setShift(parsed.shift);
      }
      if (typeof parsed.keyword === "string") {
        setKeyword(parsed.keyword);
      }
      if (typeof parsed.selectedCategory === "string") {
        setSelectedCategory(parsed.selectedCategory);
      }
    } catch {
      draftRef.current = null;
    }
  }, [paramsReady, tableNo]);

  useEffect(() => {
    setError("");
    const cached = menuCacheRef.current[shift];
    if (cached) {
      setMenu(cached);
    }

    const controller = new AbortController();
    const requestId = menuRequestRef.current + 1;
    menuRequestRef.current = requestId;
    setMenuLoading(true);

    apiFetchJson<{ items: MenuItem[] }>(`/api/menu?shift=${shift}`, {
      useAuth: false,
      signal: controller.signal,
      timeoutMs: 5000,
      retries: 1
    })
      .then((data) => {
        if (requestId !== menuRequestRef.current) return;
        const items = data.items || [];
        const draft = draftRef.current;
        const draftMap = new Map(
          (draft && draft.shift === shift ? draft.items : []).map((item) => [item.id, item])
        );
        const hydrated = items.map((item) => {
          const picked = draftMap.get(item.id);
          if (!picked) return item;
          return {
            ...item,
            qty: Number.isInteger(picked.qty) && picked.qty > 0 ? picked.qty : 0,
            note: picked.note || undefined
          };
        });
        menuCacheRef.current[shift] = hydrated;
        setMenu(hydrated);
      })
      .catch((err: Error) => {
        if (requestId !== menuRequestRef.current) return;
        if (!cached) {
          setMenu([]);
        }
        setError(err.message || "菜单加载失败");
      })
      .finally(() => {
        if (requestId === menuRequestRef.current) {
          setMenuLoading(false);
        }
      });

    return () => controller.abort();
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

  useEffect(() => {
    const next = new Map<string, number>();
    for (let i = 0; i < menu.length; i += 1) {
      next.set(menu[i].id, i);
    }
    menuIndexRef.current = next;
  }, [menu]);

  useEffect(() => {
    if (!paramsReady || !tableNo) return;
    const key = `rdv_order_draft:${tableNo}`;
    const timer = window.setTimeout(() => {
      const draft: OrderDraft = {
        tableNo,
        shift,
        keyword: keyword.trim(),
        selectedCategory,
        items: menu
          .filter((item) => (item.qty || 0) > 0)
          .map((item) => ({
            id: item.id,
            qty: item.qty || 0,
            note: item.note?.trim() || undefined
          })),
        updatedAt: Date.now()
      };
      draftRef.current = draft;
      localStorage.setItem(key, JSON.stringify(draft));
    }, 120);

    return () => window.clearTimeout(timer);
  }, [paramsReady, tableNo, shift, keyword, selectedCategory, menu]);

  const filteredMenu = useMemo(() => {
    const key = deferredKeyword.trim().toLowerCase();
    if (!key) return menu;
    return menu.filter((item) => {
      const target = `${item.name} ${item.category || ""}`.toLowerCase();
      return target.includes(key);
    });
  }, [menu, deferredKeyword]);

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
    setMenu((prev) => {
      const hintedIndex = menuIndexRef.current.get(id);
      const index = typeof hintedIndex === "number" && prev[hintedIndex]?.id === id
        ? hintedIndex
        : prev.findIndex((item) => item.id === id);
      if (index < 0) return prev;
      const target = prev[index];
      if ((target.qty || 0) === qty) return prev;
      const next = prev.slice();
      next[index] = {
        ...target,
        qty,
        note: qty > 0 ? target.note : undefined
      };
      return next;
    });
  }

  function editItemNote(id: string, current?: string) {
    const value = window.prompt(
      t("order.notePrompt", "输入此菜备注（不辣/不要冰等，留空则清空）"),
      current || ""
    );
    if (value === null) return;
    const nextNote = value.trim().slice(0, 120);
    setMenu((prev) => prev.map((item) => item.id === id ? { ...item, note: nextNote || undefined } : item));
  }

  function shiftLabel(value: ShiftKey) {
    const option = SHIFT_OPTIONS.find((item) => item.key === value);
    if (!option) return value;
    if (lang === "en") {
      if (value === "breakfast") return "Breakfast";
      if (value === "lunch") return "Lunch";
      if (value === "dinner") return "Dinner";
      if (value === "package") return "Package";
      return "Cocktail";
    }
    return option.label;
  }

  async function loadBill() {
    if (!tableNo) return;
    setBillLoading(true);
    try {
      const body = await apiFetchJson<{ items: BillItem[]; orders?: BillOrder[]; totalAmount: number; totalQty: number }>(
        `/api/tables/bill?tableNo=${encodeURIComponent(tableNo)}`,
        { timeoutMs: 6000, retries: 1 }
      );
      setBillItems(body.items || []);
      setBillOrders(body.orders || []);
      setBillTotal(body.totalAmount || 0);
      setBillQty(body.totalQty || 0);
    } catch (err: any) {
      setError(err.message || "账单加载失败");
    } finally {
      setBillLoading(false);
    }
  }

  async function createCustomDish() {
    if (!canRunAction()) return;
    setError("");
    if (!addDishForm.name.trim() || !addDishForm.price.trim()) {
      setError("请填写菜名和价格");
      return;
    }
    if (addDishMode === "permanent" && role !== "manager") {
      setError(t("order.addDishPermanentManagerOnly", "永久菜仅经理可创建"));
      return;
    }

    const price = Number(addDishForm.price);
    if (!Number.isFinite(price) || price <= 0) {
      setError("价格必须大于 0");
      return;
    }

    setAddingDish(true);
    try {
      const body = await apiFetchJson<{ item: MenuItem }>(
        "/api/menu/custom",
        {
          method: "POST",
          body: {
            name: addDishForm.name.trim(),
            price: Math.round(price),
            category: addDishForm.category.trim() || null,
            description: addDishForm.description.trim() || null,
            shift,
            mode: addDishMode
          },
          timeoutMs: 7000,
          retries: 0
        }
      );

      const item = body.item;
      setMenu((prev) => {
        const found = prev.find((it) => it.id === item.id);
        if (found) {
          return prev.map((it) => it.id === item.id ? { ...it, qty: (it.qty || 0) + 1 } : it);
        }
        return [...prev, { ...item, qty: 1 }];
      });

      const category = item.category || "Uncategorized";
      setSelectedCategory(category);
      setShowAddDish(false);
      setAddDishMode("temporary");
      setAddDishForm({ name: "", price: "", category: "", description: "" });
    } catch (err: any) {
      setError(err.message || "新增菜失败");
    } finally {
      setAddingDish(false);
    }
  }

  async function submitOrder() {
    if (!canRunAction()) return;
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
      const requestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const body = await apiFetchJson<{ orderId: string; deduped?: boolean }>("/api/orders", {
        method: "POST",
        headers: { "X-Idempotency-Key": requestId },
        body: {
          tableNo,
          guestCount: guests,
          shift,
          items: cart.map((c) => ({ menuItemId: c.id, qty: c.qty, note: c.note || null }))
        },
        timeoutMs: 8000,
        retries: 1
      });

      setMenu((prev) => prev.map((item) => ({ ...item, qty: 0, note: undefined })));
      localStorage.removeItem(`rdv_order_draft:${tableNo}`);
      await loadBill();
      setShowBill(true);
      if (body.deduped) {
        alert("检测到重复提交，已使用原订单");
      } else {
        alert("订单已提交，后厨将自动出单");
      }
    } catch (err: any) {
      setError(err.message || "提交失败");
    } finally {
      setLoading(false);
    }
  }

  async function checkout() {
    if (!canRunAction()) return;
    const confirmed = window.confirm(`确认结账并关台吗？\n桌号：${tableNo}`);
    if (!confirmed) return;

    setLoading(true);
    setError("");
    try {
      const body = await apiFetchJson<{ orderCount: number; totalAmount: number }>("/api/tables/checkout", {
        method: "POST",
        body: { tableNo },
        timeoutMs: 8000,
        retries: 1
      });

      window.alert(`结账完成\n订单数：${body.orderCount}\n总金额：₱${body.totalAmount}`);
      localStorage.removeItem(`rdv_order_draft:${tableNo}`);
      router.replace("/tables");
    } catch (err: any) {
      setError(err.message || "结账失败");
    } finally {
      setLoading(false);
    }
  }

  async function unmergeTable() {
    if (!canRunAction()) return;
    if (!isMergedTable) return;
    const confirmed = window.confirm(`确认取消拼桌吗？\n当前桌号：${tableNo}`);
    if (!confirmed) return;

    setLoading(true);
    setError("");
    try {
      const body = await apiFetchJson<{ tableNo: string; releasedTable: string; guestCount: number }>("/api/tables/unmerge", {
        method: "POST",
        body: { tableNo },
        timeoutMs: 7000,
        retries: 1
      });
      window.alert(`取消拼桌成功\n当前桌号：${body.tableNo}\n释放桌号：${body.releasedTable}`);
      router.replace(`/order?tableNo=${encodeURIComponent(body.tableNo)}&guests=${body.guestCount}`);
    } catch (err: any) {
      setError(err.message || "取消拼桌失败");
    } finally {
      setLoading(false);
    }
  }

  async function closeTable() {
    if (!canRunAction()) return;
    const confirmed = window.confirm(`确认关台吗？\n桌号：${tableNo}`);
    if (!confirmed) return;

    setLoading(true);
    setError("");
    try {
      const body = await apiFetchJson<{ tableNo: string }>("/api/tables/close", {
        method: "POST",
        body: { tableNo },
        timeoutMs: 7000,
        retries: 1
      });
      window.alert(`关台完成\n桌号：${body.tableNo}`);
      localStorage.removeItem(`rdv_order_draft:${tableNo}`);
      router.replace("/tables");
    } catch (err: any) {
      setError(err.message || "关台失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <header className="order-header">
        <h1 className="order-title">{t("order.title", "新订单")}</h1>
        <div className="row order-actions" role="toolbar" aria-label={t("order.toolbar", "订单操作栏")}>
          <input
            className="order-search-input"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t("order.searchPlaceholder", "搜索菜品")}
            inputMode="search"
            enterKeyHint="search"
          />
          <button className="secondary compact-btn" type="button" onClick={() => { router.push("/tables"); }}>
            {t("common.back", "返回")}
          </button>
          <button className="secondary compact-btn" type="button" onClick={async () => { setShowBill(true); await loadBill(); }}>
            {t("order.ordered", "已点")}
          </button>
          <button className="secondary compact-btn" type="button" onClick={() => setShowAddDish((v) => !v)}>
            {t("order.addDish", "新增菜")}
          </button>
          <button
            className="secondary compact-btn"
            type="button"
            onClick={() => {
              router.push(`/manage/orders?tableNo=${encodeURIComponent(tableNo)}`);
            }}
          >
            {t("orders.title", "订单操作")}
          </button>
          {isMergedTable ? <button className="secondary compact-btn" type="button" onClick={unmergeTable}>{t("order.unmerge", "取消拼桌")}</button> : null}
          <button className="secondary compact-btn" type="button" onClick={checkout}>{t("order.checkout", "结账")}</button>
          <button className="secondary compact-btn" type="button" onClick={closeTable}>{t("order.closeTable", "关台")}</button>
        </div>
      </header>

      {showAddDish ? (
        <div className="panel stack">
          <h3 style={{ margin: 0 }}>{t("order.addDishTitle", "新增菜品")}</h3>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              className={addDishMode === "temporary" ? "compact-btn" : "secondary compact-btn"}
              onClick={() => setAddDishMode("temporary")}
            >
              {t("order.addDishTemp", "临时菜（仅本次可用）")}
            </button>
            <button
              type="button"
              className={addDishMode === "permanent" ? "compact-btn" : "secondary compact-btn"}
              onClick={() => setAddDishMode("permanent")}
              disabled={role !== "manager"}
            >
              {t("order.addDishPermanent", "永久菜（加入菜单）")}
            </button>
          </div>
          {role !== "manager" ? (
            <div className="muted">{t("order.addDishPermanentManagerOnly", "永久菜仅经理可创建")}</div>
          ) : null}
          <input
            placeholder={t("order.addDishName", "菜名")}
            value={addDishForm.name}
            onChange={(e) => setAddDishForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <input
            placeholder={t("order.addDishPrice", "价格")}
            value={addDishForm.price}
            onChange={(e) => setAddDishForm((prev) => ({ ...prev, price: e.target.value }))}
            inputMode="numeric"
          />
          <input
            placeholder={t("order.addDishCategory", "分类")}
            value={addDishForm.category}
            onChange={(e) => setAddDishForm((prev) => ({ ...prev, category: e.target.value }))}
          />
          <input
            placeholder={t("order.addDishDesc", "描述")}
            value={addDishForm.description}
            onChange={(e) => setAddDishForm((prev) => ({ ...prev, description: e.target.value }))}
          />
          <div className="row">
            <button className="secondary" type="button" onClick={() => setShowAddDish(false)}>{t("common.cancel", "取消")}</button>
            <button type="button" onClick={createCustomDish} disabled={addingDish}>
              {addingDish ? t("admin.saving", "保存中...") : t("order.addDishCreate", "创建并加入")}
            </button>
          </div>
        </div>
      ) : null}

      {showBill ? (
        <div className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>{t("order.billTitle", "已点餐品")}（{tableNo}）</h3>
            <button className="secondary" type="button" onClick={() => setShowBill(false)}>{t("common.close", "关闭")}</button>
          </div>
          {billLoading ? <div className="muted">{t("common.loading", "加载中...")}</div> : null}
          {!billLoading && billItems.length === 0 ? <div className="muted">{t("order.billEmpty", "暂无已点餐品")}</div> : null}
          {!billLoading ? (
            <div className="order-list">
              {billItems.map((item) => (
                <div key={`${item.menu_item_id}-${item.note || ""}`} className="row" style={{ justifyContent: "space-between" }}>
                  <div className="stack" style={{ gap: 2 }}>
                    <span>{localizeMenuText(item.name, lang)} x{item.qty}</span>
                    {item.note ? <span className="muted">{t("order.noteLabel", "备注")}: {item.note}</span> : null}
                  </div>
                  <div>₱{item.amount}</div>
                </div>
              ))}
            </div>
          ) : null}
          {!billLoading && billOrders.length > 0 ? (
            <div className="order-detail-list">
              {billOrders.map((order) => (
                <div key={order.id} className="stack" style={{ gap: 4 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>#{order.id.slice(0, 8)}</strong>
                    <span className="tag">{order.status}</span>
                  </div>
                  <div className="muted">{new Date(order.created_at).toLocaleString()}</div>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span>₱{order.item_amount}</span>
                    <span>{order.charge_amount >= 0 ? "+" : ""}{order.charge_amount}</span>
                    <strong>₱{order.total_amount}</strong>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{t("order.billQty", "总数量")}：{billQty}</strong>
            <strong>{t("order.billAmount", "总金额")}：₱{billTotal}</strong>
          </div>
          <button type="button" onClick={checkout} disabled={loading}>{loading ? "处理中..." : `${t("order.checkout", "结账")} + ${t("order.closeTable", "关台")}`}</button>
        </div>
      ) : null}

      <div className="panel stack">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div><strong>{t("order.table", "桌号")}：</strong>{tableNo || "-"}</div>
          <div><strong>{t("order.guests", "人数")}：</strong>{guests > 0 ? `${guests}` : "-"}</div>
        </div>
      </div>

      <div className="panel">
        <div className="row" style={{ flexWrap: "wrap", marginBottom: 12 }}>
          {SHIFT_OPTIONS.map((option) => (
            <button
              key={option.key}
              className={shift === option.key ? "compact-btn" : "secondary compact-btn"}
              onClick={() => setShift(option.key)}
              type="button"
            >
              {shiftLabel(option.key)}
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
                {shortCategoryLabel(category, lang)}
              </button>
            ))}
          </aside>
          <div className="menu-content">
            <div className="menu-grid">
              {menuLoading ? (
                <>
                  <div className="skeleton skeleton-card" />
                  <div className="skeleton skeleton-card" />
                  <div className="skeleton skeleton-card" />
                </>
              ) : null}
              {visibleItems.map((item) => (
                <div key={item.id} className="menu-item stack">
                  <div>
                    {localizeMenuText(item.name, lang)}
                    {item.item_type === "set" ? "（Set）" : ""}
                  </div>
                  <div className="muted">₱{item.price}</div>
                  {Array.isArray(item.allergens) && item.allergens.length > 0 ? (
                    <div className="muted">{t("order.allergens", "过敏原")}: {item.allergens.join(", ")}</div>
                  ) : null}
                  {item.description ? <div className="muted">{item.description}</div> : null}
                  {item.note && (item.qty || 0) > 0 ? (
                    <div className="muted">{t("order.noteLabel", "备注")}: {item.note}</div>
                  ) : null}
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
                    <button
                      className="secondary compact-btn"
                      onClick={() => editItemNote(item.id, item.note)}
                      type="button"
                    >
                      {t("order.noteAction", "备注")}
                    </button>
                  </div>
                </div>
              ))}
              {!menuLoading && visibleItems.length === 0 ? <div className="muted">{t("order.categoryEmpty", "该分类暂无菜品")}</div> : null}
            </div>
          </div>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="panel">
          <div className="muted">{t("order.menuEmpty", "当前班次暂无可用菜单")}</div>
        </div>
      ) : null}

      <div className="panel row order-submit-bar" style={{ justifyContent: "space-between" }}>
        <div>{t("order.total", "当前加购合计")}：₱{total}</div>
        <button onClick={submitOrder} disabled={loading}>{loading ? t("order.submitting", "提交中...") : t("order.submit", "提交订单")}</button>
      </div>
      {error && <div className="muted" aria-live="polite">{error}</div>}

      <BottomNav />
    </div>
  );
}
