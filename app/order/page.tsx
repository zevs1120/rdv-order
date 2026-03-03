"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../components/bottom-nav";
import { apiFetchJson, getStoredAuth } from "../../lib/client-api";
import { useI18n } from "../components/i18n-provider";
import { localizeMenuText, shortCategoryLabel } from "../../lib/menu-text";
import { useActionGuard } from "../../lib/use-action-guard";

type ShiftKey = "breakfast" | "lunch" | "dinner" | "beverage" | "cocktail" | "package";
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
type CartSelection = { qty: number; note?: string };

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

type NoteMode = "more" | "no";

const SHIFT_OPTIONS: Array<{ key: ShiftKey; zh: string; en: string }> = [
  { key: "breakfast", zh: "早餐", en: "Breakfast" },
  { key: "lunch", zh: "午餐", en: "Lunch" },
  { key: "dinner", zh: "晚餐", en: "Dinner" },
  { key: "beverage", zh: "饮品", en: "Beverage" },
  { key: "cocktail", zh: "鸡尾酒", en: "Cocktail" },
  { key: "package", zh: "套餐", en: "Package" }
];

export default function OrderPage() {
  const router = useRouter();
  const { t, lang } = useI18n();
  const uncategorizedLabel = t("order.uncategorized", "Uncategorized");
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
  const [cartSelections, setCartSelections] = useState<Record<string, CartSelection>>({});
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
  const [noteSheetOpen, setNoteSheetOpen] = useState(false);
  const [noteSheetItemId, setNoteSheetItemId] = useState("");
  const [noteMode, setNoteMode] = useState<NoteMode>("no");
  const [noteInput, setNoteInput] = useState("");

  const menuCacheRef = useRef<Partial<Record<ShiftKey, MenuItem[]>>>({});
  const menuRequestRef = useRef(0);
  const menuIndexRef = useRef<Map<string, number>>(new Map());
  const menuMetaRef = useRef<Map<string, MenuItem>>(new Map());
  const cartSelectionsRef = useRef<Record<string, CartSelection>>({});
  const draftRef = useRef<OrderDraft | null>(null);
  const draftSerializedRef = useRef("");
  const isMergedTable = tableNo.includes("+");
  const canRunAction = useActionGuard();
  const deferredKeyword = useDeferredValue(keyword);

  function stripTransientFields(item: MenuItem): MenuItem {
    return {
      id: item.id,
      name: item.name,
      price: item.price,
      category: item.category,
      description: item.description,
      allergens: item.allergens,
      menu_group: item.menu_group,
      item_type: item.item_type
    };
  }

  function hydrateMenuItems(items: MenuItem[], selections: Record<string, CartSelection>) {
    return items.map((item) => {
      const picked = selections[item.id];
      return {
        ...item,
        qty: picked && picked.qty > 0 ? picked.qty : 0,
        note: picked?.note || undefined
      };
    });
  }

  function updateCartSelection(id: string, nextQty: number, nextNote?: string) {
    setCartSelections((prev) => {
      const current = prev[id];
      if (nextQty <= 0) {
        if (!current) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }

      const normalizedNote = nextNote?.trim() || undefined;
      if (current && current.qty === nextQty && current.note === normalizedNote) {
        return prev;
      }
      return {
        ...prev,
        [id]: {
          qty: nextQty,
          note: normalizedNote
        }
      };
    });
  }

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
    cartSelectionsRef.current = cartSelections;
  }, [cartSelections]);

  useEffect(() => {
    menuCacheRef.current = {};
    menuMetaRef.current.clear();
    cartSelectionsRef.current = {};
    setCartSelections({});
    draftSerializedRef.current = "";
    setMenu([]);
  }, [tableNo]);

  useEffect(() => {
    if (!paramsReady || !tableNo) return;
    const key = `rdv_order_draft:${tableNo}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        draftRef.current = null;
        cartSelectionsRef.current = {};
        setCartSelections({});
        return;
      }
      const parsed = JSON.parse(raw) as OrderDraft;
      if (!parsed || parsed.tableNo !== tableNo) {
        draftRef.current = null;
        draftSerializedRef.current = "";
        cartSelectionsRef.current = {};
        setCartSelections({});
        return;
      }
      draftRef.current = parsed;
      draftSerializedRef.current = raw;
      const restored: Record<string, CartSelection> = {};
      if (Array.isArray(parsed.items)) {
        for (const item of parsed.items) {
          const id = String(item?.id || "").trim();
          const qty = Number(item?.qty);
          const note = String(item?.note || "").trim();
          if (!id || !Number.isInteger(qty) || qty <= 0) continue;
          restored[id] = {
            qty,
            note: note || undefined
          };
        }
      }
      cartSelectionsRef.current = restored;
      setCartSelections(restored);
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
      draftSerializedRef.current = "";
      cartSelectionsRef.current = {};
      setCartSelections({});
    }
  }, [paramsReady, tableNo]);

  useEffect(() => {
    setError("");
    const cached = menuCacheRef.current[shift];
    if (cached) {
      setMenu(hydrateMenuItems(cached, cartSelectionsRef.current));
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
        for (const item of items) {
          menuMetaRef.current.set(item.id, stripTransientFields(item));
        }
        const hydrated = hydrateMenuItems(items, cartSelectionsRef.current);
        menuCacheRef.current[shift] = items.map((item) => stripTransientFields(item));
        setMenu(hydrated);
      })
      .catch((err: Error) => {
        if (requestId !== menuRequestRef.current) return;
        if (!cached) {
          setMenu([]);
        }
        setError(err.message || t("order.menuLoadFailed", "Failed to load menu"));
      })
      .finally(() => {
        if (requestId === menuRequestRef.current) {
          setMenuLoading(false);
        }
      });

    return () => controller.abort();
  }, [shift]);

  useEffect(() => {
    const categories = Array.from(new Set(menu.map((item) => item.category || uncategorizedLabel)));
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
    if (!shift) return;
    const baseItems = menu.map((item) => stripTransientFields(item));
    menuCacheRef.current[shift] = baseItems;
    for (const item of baseItems) {
      menuMetaRef.current.set(item.id, item);
    }
  }, [menu, shift]);

  useEffect(() => {
    if (!paramsReady || !tableNo) return;
    const key = `rdv_order_draft:${tableNo}`;
    const timer = window.setTimeout(() => {
      const draft: OrderDraft = {
        tableNo,
        shift,
        keyword: keyword.trim(),
        selectedCategory,
        items: Object.entries(cartSelections)
          .filter(([, selected]) => Number.isInteger(selected.qty) && selected.qty > 0)
          .map(([id, selected]) => ({
            id,
            qty: selected.qty,
            note: selected.note?.trim() || undefined
          })),
        updatedAt: Date.now()
      };
      const serialized = JSON.stringify(draft);
      if (serialized === draftSerializedRef.current) return;
      draftSerializedRef.current = serialized;
      draftRef.current = draft;
      localStorage.setItem(key, serialized);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [paramsReady, tableNo, shift, keyword, selectedCategory, cartSelections]);

  const derivedMenu = useMemo(() => menu.map((item) => ({
    ...item,
    _search: `${item.name} ${item.category || ""}`.toLowerCase(),
    _category: item.category || uncategorizedLabel
  })), [menu, uncategorizedLabel]);

  const filteredMenu = useMemo(() => {
    const key = deferredKeyword.trim().toLowerCase();
    if (!key) return derivedMenu;
    return derivedMenu.filter((item) => item._search.includes(key));
  }, [derivedMenu, deferredKeyword]);

  const categories = useMemo(
    () => Array.from(new Set(filteredMenu.map((item) => item._category))),
    [filteredMenu]
  );

  const visibleItems = useMemo(() => {
    if (!selectedCategory) return filteredMenu;
    return filteredMenu.filter((item) => item._category === selectedCategory);
  }, [filteredMenu, selectedCategory]);

  const cart = useMemo(() => {
    const meta = new Map(menuMetaRef.current);
    for (const item of menu) {
      meta.set(item.id, stripTransientFields(item));
    }
    const picked: CartItem[] = [];
    for (const [id, selected] of Object.entries(cartSelections)) {
      if (!selected || !Number.isInteger(selected.qty) || selected.qty <= 0) continue;
      const base = meta.get(id);
      if (!base) continue;
      picked.push({
        ...base,
        qty: selected.qty,
        note: selected.note || undefined
      });
    }
    return picked;
  }, [cartSelections, menu]);
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const noteSheetItem = useMemo(
    () => menu.find((item) => item.id === noteSheetItemId) || null,
    [menu, noteSheetItemId]
  );

  function setQty(id: string, qty: number) {
    const current = menu.find((item) => item.id === id);
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
    updateCartSelection(id, qty, qty > 0 ? current?.note : undefined);
  }

  function openNoteSheetFor(itemId: string) {
    setNoteSheetItemId(itemId);
    setNoteMode("no");
    setNoteInput("");
    setNoteSheetOpen(true);
  }

  function parseNoteTokens(note: string | undefined) {
    return String(note || "")
      .split(";")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function serializeNoteTokens(tokens: string[]) {
    const trimmed: string[] = [];
    for (const token of tokens) {
      const next = trimmed.length === 0 ? token : `${trimmed.join("; ")}; ${token}`;
      if (next.length > 120) break;
      trimmed.push(token);
    }
    return trimmed.join("; ");
  }

  function applyManualNote(itemId: string) {
    const clean = noteInput.trim();
    if (!clean) return;
    const current = menu.find((item) => item.id === itemId);
    if (!current) return;
    const token = `${noteMode} ${clean}`;
    const tokens = parseNoteTokens(current.note);
    const exists = tokens.some((v) => v.toLowerCase() === token.toLowerCase());
    const nextTokens = exists ? tokens : [...tokens, token];
    const nextNote = serializeNoteTokens(nextTokens) || undefined;
    setMenu((prev) => prev.map((item) => (item.id === itemId ? { ...item, note: nextNote } : item)));
    updateCartSelection(itemId, current.qty || 0, nextNote);
    setNoteInput("");
  }

  function clearManualNote(itemId: string) {
    const current = menu.find((item) => item.id === itemId);
    if (!current) return;
    setMenu((prev) => prev.map((item) => (item.id === itemId ? { ...item, note: undefined } : item)));
    updateCartSelection(itemId, current.qty || 0, undefined);
    setNoteInput("");
  }

  function increaseQtyAndOpenNote(item: MenuItem) {
    setQty(item.id, (item.qty || 0) + 1);
    openNoteSheetFor(item.id);
  }

  function shiftLabel(value: ShiftKey) {
    const option = SHIFT_OPTIONS.find((item) => item.key === value);
    if (!option) return value;
    return lang === "en" ? option.en : option.zh;
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
      setError(err.message || t("order.billLoadFailed", "Failed to load bill"));
    } finally {
      setBillLoading(false);
    }
  }

  async function createCustomDish() {
    if (!canRunAction()) return;
    setError("");
    if (!addDishForm.name.trim() || !addDishForm.price.trim()) {
      setError(t("order.addDishRequireNamePrice", "Dish name and price are required"));
      return;
    }
    if (addDishMode === "permanent" && role !== "manager") {
      setError(t("order.addDishPermanentManagerOnly", "永久菜仅经理可创建"));
      return;
    }

    const price = Number(addDishForm.price);
    if (!Number.isFinite(price) || price <= 0) {
      setError(t("order.addDishInvalidPrice", "Price must be greater than 0"));
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
      menuMetaRef.current.set(item.id, stripTransientFields(item));
      setMenu((prev) => {
        const found = prev.find((it) => it.id === item.id);
        if (found) {
          return prev.map((it) => it.id === item.id ? { ...it, qty: (it.qty || 0) + 1 } : it);
        }
        return [...prev, { ...item, qty: 1 }];
      });
      setCartSelections((prev) => {
        const current = prev[item.id];
        const nextQty = (current?.qty || 0) + 1;
        return {
          ...prev,
          [item.id]: {
            qty: nextQty,
            note: current?.note
          }
        };
      });

      const category = item.category || uncategorizedLabel;
      setSelectedCategory(category);
      setShowAddDish(false);
      setAddDishMode("temporary");
      setAddDishForm({ name: "", price: "", category: "", description: "" });
    } catch (err: any) {
      setError(err.message || t("order.addDishFailed", "Failed to add dish"));
    } finally {
      setAddingDish(false);
    }
  }

  async function submitOrder() {
    if (!canRunAction()) return;
    setError("");
    if (!tableNo) {
      setError(t("order.tableMissing", "Table number is missing. Please reselect table."));
      return;
    }
    if (cart.length === 0) {
      setError(t("order.emptyCart", "Please select at least one dish"));
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
      setCartSelections({});
      cartSelectionsRef.current = {};
      localStorage.removeItem(`rdv_order_draft:${tableNo}`);
      draftSerializedRef.current = "";
      await loadBill();
      setShowBill(true);
      if (body.deduped) {
        alert(t("order.submitDeduped", "Duplicate submission detected. Existing order reused."));
      } else {
        alert(t("order.submitSuccess", "Order submitted. Print has been triggered."));
      }
    } catch (err: any) {
      setError(err.message || t("order.submitFailed", "Failed to submit order"));
    } finally {
      setLoading(false);
    }
  }

  async function checkout() {
    if (!canRunAction()) return;
    const confirmed = window.confirm(
      lang === "en"
        ? `Confirm checkout and close table?\nTable: ${tableNo}`
        : `确认结账并关台吗？\n桌号：${tableNo}`
    );
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

      window.alert(
        lang === "en"
          ? `Checkout complete\nOrders: ${body.orderCount}\nTotal: ₱${body.totalAmount}`
          : `结账完成\n订单数：${body.orderCount}\n总金额：₱${body.totalAmount}`
      );
      setCartSelections({});
      cartSelectionsRef.current = {};
      localStorage.removeItem(`rdv_order_draft:${tableNo}`);
      draftSerializedRef.current = "";
      router.replace("/tables");
    } catch (err: any) {
      setError(err.message || t("order.checkoutFailed", "Checkout failed"));
    } finally {
      setLoading(false);
    }
  }

  async function unmergeTable() {
    if (!canRunAction()) return;
    if (!isMergedTable) return;
    const confirmed = window.confirm(
      lang === "en"
        ? `Confirm unmerge table?\nCurrent table: ${tableNo}`
        : `确认取消拼桌吗？\n当前桌号：${tableNo}`
    );
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
      window.alert(
        lang === "en"
          ? `Unmerge success\nCurrent table: ${body.tableNo}\nReleased table: ${body.releasedTable}`
          : `取消拼桌成功\n当前桌号：${body.tableNo}\n释放桌号：${body.releasedTable}`
      );
      router.replace(`/order?tableNo=${encodeURIComponent(body.tableNo)}&guests=${body.guestCount}`);
    } catch (err: any) {
      setError(err.message || t("order.unmergeFailed", "Failed to unmerge table"));
    } finally {
      setLoading(false);
    }
  }

  async function closeTable() {
    if (!canRunAction()) return;
    const confirmed = window.confirm(
      lang === "en"
        ? `Confirm close table?\nTable: ${tableNo}`
        : `确认关台吗？\n桌号：${tableNo}`
    );
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
      window.alert(lang === "en" ? `Table closed\nTable: ${body.tableNo}` : `关台完成\n桌号：${body.tableNo}`);
      setCartSelections({});
      cartSelectionsRef.current = {};
      localStorage.removeItem(`rdv_order_draft:${tableNo}`);
      draftSerializedRef.current = "";
      router.replace("/tables");
    } catch (err: any) {
      setError(err.message || t("order.closeFailed", "Failed to close table"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!noteSheetOpen) return;
    if (!noteSheetItem) {
      setNoteSheetOpen(false);
      setNoteSheetItemId("");
      return;
    }
    if ((noteSheetItem.qty || 0) <= 0) {
      setNoteSheetOpen(false);
      setNoteSheetItemId("");
    }
  }, [noteSheetOpen, noteSheetItem]);

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
          <button type="button" onClick={checkout} disabled={loading}>
            {loading ? t("order.processing", "Processing...") : `${t("order.checkout", "结账")} + ${t("order.closeTable", "关台")}`}
          </button>
        </div>
      ) : null}

      <div className="panel stack">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div><strong>{t("order.table", "桌号")}：</strong>{tableNo || "-"}</div>
          <div><strong>{t("order.guests", "人数")}：</strong>{guests > 0 ? `${guests}` : "-"}</div>
        </div>
      </div>

      <div className="panel">
        <div className="row shift-tabs">
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
                  <div className="menu-item-title">
                    {localizeMenuText(item.name, lang)}
                    {item.item_type === "set" ? (lang === "en" ? " (Set)" : "（套餐）") : ""}
                  </div>
                  <div className="muted menu-item-price">₱{item.price}</div>
                  {Array.isArray(item.allergens) && item.allergens.length > 0 ? (
                    <div className="muted">{t("order.allergens", "过敏原")}: {item.allergens.join(", ")}</div>
                  ) : null}
                  {item.description ? <div className="muted">{item.description}</div> : null}
                  {item.note && (item.qty || 0) > 0 ? (
                    <div className="muted">{t("order.noteLabel", "备注")}: {item.note}</div>
                  ) : null}
                  <div className="row qty-stepper">
                    <button
                      className="secondary compact-btn qty-btn"
                      onClick={() => setQty(item.id, Math.max(0, (item.qty || 0) - 1))}
                      type="button"
                    >
                      -
                    </button>
                    <div className="qty-value">{item.qty || 0}</div>
                    <button className="compact-btn qty-btn" onClick={() => increaseQtyAndOpenNote(item)} type="button">+</button>
                    <button
                      className="secondary compact-btn note-action"
                      onClick={() => openNoteSheetFor(item.id)}
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
      {noteSheetOpen && noteSheetItem ? (
        <>
          <button
            type="button"
            className="note-sheet-backdrop"
            onClick={() => setNoteSheetOpen(false)}
            aria-label={t("common.close", "关闭")}
          />
          <div className="panel note-sheet">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{localizeMenuText(noteSheetItem.name, lang)}</strong>
              <button type="button" className="secondary compact-btn" onClick={() => setNoteSheetOpen(false)}>
                {t("common.done", "完成")}
              </button>
            </div>
            <div className="row note-mode-row">
              <button
                type="button"
                className={noteMode === "more" ? "compact-btn" : "secondary compact-btn"}
                onClick={() => setNoteMode("more")}
              >
                {t("order.noteModeMore", "more")}
              </button>
              <button
                type="button"
                className={noteMode === "no" ? "compact-btn" : "secondary compact-btn"}
                onClick={() => setNoteMode("no")}
              >
                {t("order.noteModeNo", "no")}
              </button>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <input
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder={t("order.noteInputPlaceholder", "Type your note")}
                maxLength={60}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  applyManualNote(noteSheetItem.id);
                }}
              />
              <div className="row" style={{ justifyContent: "space-between" }}>
                <button type="button" className="compact-btn" onClick={() => applyManualNote(noteSheetItem.id)}>
                  {t("order.noteAdd", "Add")}
                </button>
                <button type="button" className="secondary compact-btn" onClick={() => clearManualNote(noteSheetItem.id)}>
                  {t("order.noteClear", "Clear")}
                </button>
              </div>
            </div>
            <div className="muted">
              {t("order.noteLabel", "备注")}: {noteSheetItem.note || "-"}
            </div>
          </div>
        </>
      ) : null}
      {error && <div className="muted" aria-live="polite">{error}</div>}

      <BottomNav />
    </div>
  );
}
