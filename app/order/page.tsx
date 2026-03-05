"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BottomNav from "../components/bottom-nav";
import { apiFetchJson, getStoredAuth } from "../../lib/client-api";
import { useI18n } from "../components/i18n-provider";
import { localizeMenuText, shortCategoryLabel } from "../../lib/menu-text";
import { useActionGuard } from "../../lib/use-action-guard";
import { AppBar, Badge, BottomSheet, Button, Card, Chip, EmptyState, SearchField, Toast } from "../../components/ui";
import styles from "./page.module.css";

type ShiftKey = string;
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
  cancelled_at?: string | null;
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
type BillCachePayload = {
  tableNo: string;
  fetchedAt: number;
  items: BillItem[];
  orders: BillOrder[];
  totalAmount: number;
  totalQty: number;
};

type NoteMode = "more" | "no";
type SubmitUiState = "idle" | "loading" | "success" | "error";
type ToastState = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};
type MenuCachePayload = {
  updatedAt: number;
  items: MenuItem[];
  subcategories?: string[];
};

type MajorCategoryOption = {
  key: string;
  label_en: string;
  label_zh: string;
};

const MENU_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MENU_CACHE_VERSION = 3;

const DEFAULT_SHIFT_OPTIONS: MajorCategoryOption[] = [
  { key: "breakfast", label_zh: "早餐", label_en: "Breakfast" },
  { key: "lunch", label_zh: "午餐", label_en: "Lunch" },
  { key: "dinner", label_zh: "晚餐", label_en: "Dinner" },
  { key: "beverage", label_zh: "饮品", label_en: "Beverage" },
  { key: "cocktail", label_zh: "鸡尾酒", label_en: "Cocktail" },
  { key: "package", label_zh: "套餐", label_en: "Package" }
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
  const [submitState, setSubmitState] = useState<SubmitUiState>("idle");
  const [submitNotice, setSubmitNotice] = useState("");
  const [submitPressed, setSubmitPressed] = useState(false);
  const [menuLoading, setMenuLoading] = useState(false);
  const [shift, setShift] = useState<ShiftKey>("lunch");
  const [shiftOptions, setShiftOptions] = useState<MajorCategoryOption[]>(DEFAULT_SHIFT_OPTIONS);
  const [keyword, setKeyword] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [shiftSubcategories, setShiftSubcategories] = useState<Record<string, string[]>>({});
  const [cartSelections, setCartSelections] = useState<Record<string, CartSelection>>({});
  const [paramsReady, setParamsReady] = useState(false);

  const [showBill, setShowBill] = useState(false);
  const [billLoading, setBillLoading] = useState(false);
  const [printingBillReceipt, setPrintingBillReceipt] = useState(false);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [billOrders, setBillOrders] = useState<BillOrder[]>([]);
  const [returningItemKey, setReturningItemKey] = useState("");
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
  const [cartSheetOpen, setCartSheetOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const menuCacheRef = useRef<Record<string, MenuItem[]>>({});
  const subcategoryCacheRef = useRef<Record<string, string[]>>({});
  const menuRequestRef = useRef(0);
  const menuIndexRef = useRef<Map<string, number>>(new Map());
  const menuMetaRef = useRef<Map<string, MenuItem>>(new Map());
  const cartSelectionsRef = useRef<Record<string, CartSelection>>({});
  const billCacheRef = useRef<BillCachePayload | null>(null);
  const draftRef = useRef<OrderDraft | null>(null);
  const draftSerializedRef = useRef("");
  const submitInFlightRef = useRef(false);
  const submitClickCountRef = useRef(0);
  const submitAttemptRef = useRef(0);
  const submitResetTimerRef = useRef<number | null>(null);
  const submitPressedTimerRef = useRef<number | null>(null);
  const lastSubmittedSignatureRef = useRef("");
  const lastSubmittedAtRef = useRef(0);
  const isMergedTable = tableNo.includes("+");
  const canRunAction = useActionGuard();
  const deferredKeyword = useDeferredValue(keyword);

  function debugSubmit(stage: string, payload: Record<string, unknown> = {}) {
    if (process.env.NODE_ENV === "production") return;
    console.info("[submit-order]", {
      stage,
      time: new Date().toISOString(),
      tableNo,
      guests,
      cartCount: cart.length,
      ...payload
    });
  }

  function resetSubmitStateLater(ms = 1200) {
    if (submitResetTimerRef.current) {
      window.clearTimeout(submitResetTimerRef.current);
    }
    submitResetTimerRef.current = window.setTimeout(() => {
      setSubmitState("idle");
      setSubmitNotice("");
      submitResetTimerRef.current = null;
    }, ms);
  }

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

  function readMenuCache(shiftKey: ShiftKey): MenuCachePayload | null {
    if (typeof window === "undefined") return null;
    const key = `rdv_menu_cache:v${MENU_CACHE_VERSION}:${shiftKey}`;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as MenuCachePayload;
      if (!parsed || !Array.isArray(parsed.items)) return null;
      const age = Date.now() - Number(parsed.updatedAt || 0);
      if (!Number.isFinite(age) || age < 0 || age > MENU_CACHE_TTL_MS) return null;
      return {
        updatedAt: Number(parsed.updatedAt || 0),
        items: parsed.items.map((item) => stripTransientFields(item)),
        subcategories: Array.isArray(parsed.subcategories)
          ? parsed.subcategories.map((value) => String(value || "").trim()).filter(Boolean)
          : []
      };
    } catch {
      return null;
    }
  }

  function writeMenuCache(shiftKey: ShiftKey, items: MenuItem[], subcategories: string[]) {
    if (typeof window === "undefined") return;
    const key = `rdv_menu_cache:v${MENU_CACHE_VERSION}:${shiftKey}`;
    const payload: MenuCachePayload = {
      updatedAt: Date.now(),
      items: items.map((item) => stripTransientFields(item)),
      subcategories
    };
    try {
      sessionStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // Ignore storage errors.
    }
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
    localStorage.setItem("rdv_recent_table", tableNo);
    localStorage.setItem("rdv_recent_guests", String(guests));
  }, [tableNo, guests, paramsReady, router]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    cartSelectionsRef.current = cartSelections;
  }, [cartSelections]);

  useEffect(() => {
    menuCacheRef.current = {};
    menuMetaRef.current.clear();
    billCacheRef.current = null;
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
      if (typeof parsed.shift === "string" && parsed.shift.trim()) {
        setShift(parsed.shift.trim().toLowerCase());
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
    const storageCached = readMenuCache(shift);
    if (storageCached && !menuCacheRef.current[shift]) {
      menuCacheRef.current[shift] = storageCached.items;
      subcategoryCacheRef.current[shift] = storageCached.subcategories || [];
      for (const item of storageCached.items) {
        menuMetaRef.current.set(item.id, item);
      }
    }
    const cached = menuCacheRef.current[shift];
    const cachedSubcategories = subcategoryCacheRef.current[shift] || [];
    if (cached) {
      setMenu(hydrateMenuItems(cached, cartSelectionsRef.current));
      setShiftSubcategories((prev) => ({ ...prev, [shift]: cachedSubcategories }));
    }

    const controller = new AbortController();
    const requestId = menuRequestRef.current + 1;
    menuRequestRef.current = requestId;
    setMenuLoading(true);

    apiFetchJson<{ items: MenuItem[]; subcategories?: string[]; majorCategories?: MajorCategoryOption[]; shift?: string }>(`/api/menu?shift=${encodeURIComponent(shift)}`, {
      useAuth: false,
      signal: controller.signal,
      timeoutMs: 5000,
      retries: 1
    })
      .then((data) => {
        if (requestId !== menuRequestRef.current) return;
        const items = data.items || [];
        const majorCategories = Array.isArray(data.majorCategories)
          ? data.majorCategories
            .map((row) => ({
              key: String(row?.key || "").trim().toLowerCase(),
              label_en: String(row?.label_en || "").trim(),
              label_zh: String(row?.label_zh || "").trim()
            }))
            .filter((row) => row.key && row.label_en && row.label_zh)
          : [];
        if (majorCategories.length > 0) {
          setShiftOptions(majorCategories);
        }
        const nextShift = String(data.shift || "").trim().toLowerCase();
        if (nextShift && nextShift !== shift) {
          setShift(nextShift);
        }
        const subcategories = Array.isArray(data.subcategories)
          ? data.subcategories.map((value) => String(value || "").trim()).filter(Boolean)
          : [];
        for (const item of items) {
          menuMetaRef.current.set(item.id, stripTransientFields(item));
        }
        const hydrated = hydrateMenuItems(items, cartSelectionsRef.current);
        menuCacheRef.current[shift] = items.map((item) => stripTransientFields(item));
        subcategoryCacheRef.current[shift] = subcategories;
        writeMenuCache(shift, items, subcategories);
        setMenu(hydrated);
        setShiftSubcategories((prev) => ({ ...prev, [shift]: subcategories }));
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
    const fromShift = shiftSubcategories[shift] || [];
    const seen = new Set<string>();
    const categories: string[] = [];
    for (const category of fromShift) {
      const value = String(category || "").trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      categories.push(value);
    }
    for (const item of menu) {
      const value = item.category || uncategorizedLabel;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      categories.push(value);
    }
    if (categories.length === 0) {
      setSelectedCategory("");
      return;
    }
    if (!selectedCategory || !categories.includes(selectedCategory)) {
      setSelectedCategory(categories[0]);
    }
  }, [menu, selectedCategory, shift, shiftSubcategories, uncategorizedLabel]);

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
    if (shiftOptions.length === 0) return;
    if (shiftOptions.some((item) => item.key === shift)) return;
    setShift(shiftOptions[0].key);
  }, [shiftOptions, shift]);

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

  const baseCategories = useMemo(() => {
    const fromShift = shiftSubcategories[shift] || [];
    const seen = new Set<string>();
    const values: string[] = [];
    for (const category of fromShift) {
      const value = String(category || "").trim();
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      values.push(value);
    }
    for (const item of menu) {
      const value = item.category || uncategorizedLabel;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      values.push(value);
    }
    return values;
  }, [menu, shift, shiftSubcategories, uncategorizedLabel]);

  const categories = useMemo(() => {
    if (!deferredKeyword.trim()) return baseCategories;
    const matched = new Set(filteredMenu.map((item) => item._category));
    return baseCategories.filter((category) => matched.has(category));
  }, [baseCategories, filteredMenu, deferredKeyword]);

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
  const cartSignature = useMemo(() => {
    return cart
      .map((item) => `${item.id}:${item.qty}:${String(item.note || "").trim().toLowerCase()}`)
      .sort()
      .join("|");
  }, [cart]);
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const menuById = useMemo(() => {
    const map = new Map<string, MenuItem>();
    for (const item of menu) {
      map.set(item.id, item);
    }
    return map;
  }, [menu]);
  const noteSheetItem = useMemo(
    () => menuById.get(noteSheetItemId) || null,
    [menuById, noteSheetItemId]
  );

  function setQty(id: string, qty: number) {
    const current = menuById.get(id);
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

  function applyManualNote(itemId: string, input = noteInput) {
    const clean = input.trim();
    if (!clean) return;
    const current = menuById.get(itemId);
    if (!current) return;
    const token = `${noteMode} ${clean}`;
    const tokens = parseNoteTokens(current.note);
    const exists = tokens.some((v) => v.toLowerCase() === token.toLowerCase());
    const nextTokens = exists ? tokens : [...tokens, token];
    const nextNote = serializeNoteTokens(nextTokens) || undefined;
    setMenu((prev) => prev.map((item) => (item.id === itemId ? { ...item, note: nextNote } : item)));
    updateCartSelection(itemId, current.qty || 0, nextNote);
    if (input === noteInput) {
      setNoteInput("");
    }
  }

  function clearManualNote(itemId: string) {
    const current = menuById.get(itemId);
    if (!current) return;
    setMenu((prev) => prev.map((item) => (item.id === itemId ? { ...item, note: undefined } : item)));
    updateCartSelection(itemId, current.qty || 0, undefined);
    setNoteInput("");
  }

  function addFromMenu(item: MenuItem) {
    const previousQty = item.qty || 0;
    setQty(item.id, previousQty + 1);
    setNoteSheetOpen(false);
    setCartSheetOpen(true);
  }

  function closeNoteSheet(shouldSaveInput = true) {
    if (shouldSaveInput && noteSheetItemId && noteInput.trim()) {
      applyManualNote(noteSheetItemId, noteInput);
    }
    setNoteSheetOpen(false);
  }

  function shiftLabel(value: ShiftKey) {
    const option = shiftOptions.find((item) => item.key === value);
    if (!option) return value;
    return lang === "en" ? option.label_en : option.label_zh;
  }

  async function loadBill() {
    if (!tableNo) return;
    const cached = billCacheRef.current;
    if (
      cached &&
      cached.tableNo === tableNo &&
      Date.now() - cached.fetchedAt < 1800
    ) {
      setBillItems(cached.items);
      setBillOrders(cached.orders);
      setBillTotal(cached.totalAmount);
      setBillQty(cached.totalQty);
      return;
    }
    setBillLoading(true);
    try {
      const body = await apiFetchJson<{ items: BillItem[]; orders?: BillOrder[]; totalAmount: number; totalQty: number }>(
        `/api/tables/bill?tableNo=${encodeURIComponent(tableNo)}`,
        { timeoutMs: 6000, retries: 1 }
      );
      const nextItems = body.items || [];
      const nextOrders = body.orders || [];
      const nextTotalAmount = body.totalAmount || 0;
      const nextTotalQty = body.totalQty || 0;
      setBillItems(nextItems);
      setBillOrders(nextOrders);
      setBillTotal(nextTotalAmount);
      setBillQty(nextTotalQty);
      billCacheRef.current = {
        tableNo,
        fetchedAt: Date.now(),
        items: nextItems,
        orders: nextOrders,
        totalAmount: nextTotalAmount,
        totalQty: nextTotalQty
      };
    } catch (err: any) {
      setError(err.message || t("order.billLoadFailed", "Failed to load bill"));
    } finally {
      setBillLoading(false);
    }
  }

  async function printGuestReceipt() {
    if (!canRunAction()) return;
    if (!tableNo) return;
    setError("");
    setPrintingBillReceipt(true);
    try {
      await apiFetchJson("/api/tables/print-bill", {
        method: "POST",
        body: { tableNo },
        timeoutMs: 10000,
        retries: 0
      });
      window.alert(t("order.printReceiptSuccess", "Receipt sent to printer"));
    } catch (err: any) {
      setError(err.message || t("order.printReceiptFailed", "Failed to print receipt"));
    } finally {
      setPrintingBillReceipt(false);
    }
  }

  async function returnDish(orderId: string, item: BillItem) {
    if (!canRunAction()) return;

    const input = window.prompt(
      lang === "en"
        ? `Return qty for ${localizeMenuText(item.name, lang)} (max ${item.qty})`
        : `${localizeMenuText(item.name, lang)} 退菜数量（最多 ${item.qty}）`,
      "1"
    );
    if (!input) return;

    const qty = Number(input);
    if (!Number.isInteger(qty) || qty <= 0) {
      setError(lang === "en" ? "Invalid return quantity" : "退菜数量无效");
      return;
    }
    if (qty > item.qty) {
      setError(lang === "en" ? "Return quantity exceeds ordered quantity" : "退菜数量超过已点数量");
      return;
    }

    setError("");
    const opKey = `${orderId}:${item.menu_item_id}`;
    setReturningItemKey(opKey);
    try {
      await apiFetchJson(`/api/orders/${orderId}/return-item`, {
        method: "POST",
        body: {
          menuItemId: item.menu_item_id,
          qty,
          reason: "manual correction"
        },
        timeoutMs: 7000,
        retries: 0
      });
      billCacheRef.current = null;
      await loadBill();
      setToast({
        message: lang === "en"
          ? `Returned ${localizeMenuText(item.name, lang)} x${qty}`
          : `已退菜 ${localizeMenuText(item.name, lang)} x${qty}`
      });
    } catch (err: any) {
      setError(err.message || (lang === "en" ? "Failed to return dish" : "退菜失败"));
    } finally {
      setReturningItemKey("");
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
    submitClickCountRef.current += 1;
    debugSubmit("click", { clickCount: submitClickCountRef.current, submitState });

    if (submitInFlightRef.current || submitState === "loading") {
      const waitMsg = t("order.submitInProgressToast", "Submitting... please wait");
      setToast({ message: waitMsg });
      setSubmitNotice(waitMsg);
      debugSubmit("blocked_inflight", { clickCount: submitClickCountRef.current });
      return;
    }

    setError("");
    setSubmitNotice("");
    if (submitResetTimerRef.current) {
      window.clearTimeout(submitResetTimerRef.current);
      submitResetTimerRef.current = null;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      const offlineMsg = t("order.submitOffline", "You are offline. Please reconnect and retry.");
      setSubmitState("error");
      setSubmitNotice(offlineMsg);
      setError(offlineMsg);
      setToast({
        message: offlineMsg,
        actionLabel: lang === "en" ? "Retry" : "重试",
        onAction: () => { void submitOrder(); }
      });
      debugSubmit("blocked_offline");
      return;
    }

    if (!tableNo) {
      const msg = t("order.tableMissing", "Table number is missing. Please reselect table.");
      setSubmitState("error");
      setSubmitNotice(msg);
      setError(msg);
      debugSubmit("blocked_no_table");
      return;
    }
    if (cart.length === 0) {
      const msg = t("order.emptyCart", "Please select at least one dish");
      setSubmitState("error");
      setSubmitNotice(msg);
      setError(msg);
      debugSubmit("blocked_empty_cart");
      return;
    }
    if (
      cartSignature &&
      cartSignature === lastSubmittedSignatureRef.current &&
      Date.now() - lastSubmittedAtRef.current < 12000
    ) {
      const msg = t("order.duplicateBlocked", "Duplicate submit blocked. Please wait a moment.");
      setSubmitState("error");
      setSubmitNotice(msg);
      setError(msg);
      setToast({ message: msg });
      debugSubmit("blocked_recent_duplicate");
      return;
    }

    submitAttemptRef.current += 1;
    const attemptNo = submitAttemptRef.current;
    const startedAt = performance.now();
    submitInFlightRef.current = true;
    setLoading(true);
    setSubmitState("loading");
    setSubmitNotice(t("order.submitProgress", "Submitting order, please wait..."));
    try {
      const requestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const payload = {
        tableNo,
        guestCount: guests,
        shift,
        items: cart.map((c) => ({ menuItemId: c.id, qty: c.qty, note: c.note || null }))
      };

      debugSubmit("request_start", {
        attemptNo,
        idempotencyKey: requestId,
        payload
      });

      const body = await apiFetchJson<{ orderId: string; deduped?: boolean; dedupeReason?: string }>("/api/orders", {
        method: "POST",
        headers: { "X-Idempotency-Key": requestId },
        body: payload,
        timeoutMs: 12000,
        retries: 0
      });

      setMenu((prev) => prev.map((item) => ({ ...item, qty: 0, note: undefined })));
      setCartSelections({});
      cartSelectionsRef.current = {};
      setCartSheetOpen(false);
      localStorage.removeItem(`rdv_order_draft:${tableNo}`);
      draftSerializedRef.current = "";
      billCacheRef.current = null;
      lastSubmittedSignatureRef.current = cartSignature;
      lastSubmittedAtRef.current = Date.now();
      await loadBill();
      setShowBill(true);
      setSubmitState("success");
      setSubmitNotice("");
      const latencyMs = Math.round(performance.now() - startedAt);
      if (body.deduped) {
        if (body.dedupeReason === "recent_duplicate") {
          setToast({ message: t("order.duplicateBlocked", "Duplicate submit blocked. Please wait a moment.") });
        } else {
          setToast({ message: t("order.submitDeduped", "Duplicate submission detected. Existing order reused.") });
        }
      } else {
        setToast({
          message: `${t("order.submitSuccess", "Order submitted. Print has been triggered.")} #${body.orderId.slice(0, 8)}`,
          actionLabel: t("order.ordered", "Items"),
          onAction: () => {
            setShowBill(true);
            void loadBill();
          }
        });
      }
      debugSubmit("request_success", {
        attemptNo,
        idempotencyKey: requestId,
        orderId: body.orderId,
        deduped: Boolean(body.deduped),
        dedupeReason: body.dedupeReason || "none",
        latencyMs
      });
      resetSubmitStateLater();
    } catch (err: any) {
      const message = String(err?.message || "").trim();
      const normalized = message.includes("timed out")
        ? t("order.submitTimeout", "Request timed out. Please check network and retry.")
        : message.includes("offline")
          ? t("order.submitOffline", "You are offline. Please reconnect and retry.")
          : (message || t("order.submitFailed", "Failed to submit order"));
      setSubmitState("error");
      setSubmitNotice(normalized);
      setError(normalized);
      setToast({
        message: `${t("order.submitFailed", "Failed to submit order")}: ${normalized}`,
        actionLabel: lang === "en" ? "Retry" : "重试",
        onAction: () => { void submitOrder(); }
      });
      debugSubmit("request_error", {
        attemptNo,
        latencyMs: Math.round(performance.now() - startedAt),
        error: normalized
      });
    } finally {
      setLoading(false);
      submitInFlightRef.current = false;
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
      setCartSheetOpen(false);
      localStorage.removeItem(`rdv_order_draft:${tableNo}`);
      draftSerializedRef.current = "";
      billCacheRef.current = null;
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
      setCartSheetOpen(false);
      localStorage.removeItem(`rdv_order_draft:${tableNo}`);
      draftSerializedRef.current = "";
      billCacheRef.current = null;
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

  useEffect(() => {
    return () => {
      if (submitResetTimerRef.current) {
        window.clearTimeout(submitResetTimerRef.current);
        submitResetTimerRef.current = null;
      }
      if (submitPressedTimerRef.current) {
        window.clearTimeout(submitPressedTimerRef.current);
        submitPressedTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.topFixed}>
        <AppBar
          className={styles.appBar}
          title={
            <div className={styles.topTitle}>
              <span>{lang === "en" ? `Table ${tableNo}` : `桌号 ${tableNo}`}</span>
              <Badge tone="brand">{lang === "en" ? `${guests} Guests` : `${guests} 人`}</Badge>
            </div>
          }
          left={
            <Button variant="secondary" onClick={() => router.push("/tables")}>
              {lang === "en" ? "Back" : "返回"}
            </Button>
          }
          right={
            <div className={styles.topActions}>
              <Button variant="secondary" onClick={() => setActionMenuOpen(true)}>
                {lang === "en" ? "Actions" : "操作"}
              </Button>
            </div>
          }
          subline={
            <SearchField
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t("order.searchPlaceholder", "Search dishes")}
              className={styles.searchCompact}
            />
          }
        />

        <Card className={styles.shiftPanel}>
          <div className={styles.shiftRow}>
            {shiftOptions.map((option) => (
              <Chip key={option.key} active={shift === option.key} onClick={() => setShift(option.key)}>
                {shiftLabel(option.key)}
              </Chip>
            ))}
          </div>
        </Card>
      </div>

      <div className={styles.middle}>
        <aside className={styles.sidebar}>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`${styles.categoryBtn} ${selectedCategory === category ? styles.categoryBtnActive : ""}`}
              onClick={() => setSelectedCategory(category)}
            >
              {shortCategoryLabel(category, lang)}
            </button>
          ))}
        </aside>

        <section className={styles.menuPane}>
          {menuLoading ? (
            <div className="stack">
              <div className="ui-skeleton" style={{ height: 64 }} />
              <div className="ui-skeleton" style={{ height: 64 }} />
              <div className="ui-skeleton" style={{ height: 64 }} />
            </div>
          ) : null}
          {!menuLoading && categories.length === 0 ? (
            <EmptyState title={t("order.menuEmpty", "No menu for this shift")} />
          ) : null}
          {!menuLoading && categories.length > 0 && visibleItems.length === 0 ? (
            <EmptyState title={t("order.categoryEmpty", "No dishes in this category")} />
          ) : null}
          {!menuLoading ? (
            <div className={styles.menuList}>
              {visibleItems.map((item) => (
                <div key={item.id} className={styles.menuRow}>
                  <div className={styles.menuMain}>
                    <div className={styles.menuTitle}>
                      {localizeMenuText(item.name, lang)}
                      {item.item_type === "set" ? (lang === "en" ? " (Set)" : "（套餐）") : ""}
                    </div>
                    <div className={styles.menuSubtitle}>
                      {localizeMenuText(item.category || "", lang) || item.description || " "}
                    </div>
                  </div>
                  <strong className={styles.menuPrice}>₱{item.price}</strong>
                  <Button
                    variant="secondary"
                    type="button"
                    className={styles.addBtn}
                    onClick={() => addFromMenu(item)}
                  >
                    {lang === "en" ? "Add +" : "加入 +"}
                  </Button>
                  {(item.qty || 0) > 0 ? <Badge className={styles.qtyBadge} tone="brand">x{item.qty}</Badge> : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <div className={styles.bottomFixed}>
        <Card className={styles.cartDock}>
          <Button
            variant="secondary"
            className={styles.cartSummaryBtn}
            onClick={() => {
              setNoteSheetOpen(false);
              setCartSheetOpen(true);
            }}
          >
            {t("order.currentOrder", "Current Order")} · {cart.length} · ₱{total}
          </Button>
          <Button
            onClick={() => { void submitOrder(); }}
            onPointerDown={() => {
              setSubmitPressed(true);
              if (submitPressedTimerRef.current) {
                window.clearTimeout(submitPressedTimerRef.current);
              }
              submitPressedTimerRef.current = window.setTimeout(() => {
                setSubmitPressed(false);
                submitPressedTimerRef.current = null;
              }, 90);
            }}
            loading={submitState === "loading"}
            disableWhenLoading={false}
            disabled={cart.length === 0}
            className={`${styles.submitBtn} ${submitPressed ? styles.submitBtnPressed : ""}`}
          >
            {submitState === "loading" ? t("order.submitting", "Submitting...") : t("order.submit", "Submit Order")}
          </Button>
        </Card>
        {submitState === "loading" ? (
          <div className={styles.submitProgressHint}>
            {submitNotice || t("order.submitProgress", "Submitting order, please wait...")}
          </div>
        ) : null}
        {submitState === "error" && submitNotice ? (
          <div className={styles.submitErrorHint}>
            {submitNotice} · {t("order.submitRetryHint", "Tap Submit to retry")}
          </div>
        ) : null}
      </div>

      <BottomSheet
        open={actionMenuOpen}
        onClose={() => setActionMenuOpen(false)}
        title={lang === "en" ? "Actions" : "操作"}
      >
        <div className={styles.actionsSheet}>
          <button
            type="button"
            className={styles.actionsSheetRow}
            onClick={async () => {
              setActionMenuOpen(false);
              setShowBill(true);
              await loadBill();
            }}
          >
            {t("order.ordered", "Items")}
          </button>
          <button
            type="button"
            className={styles.actionsSheetRow}
            onClick={() => {
              setActionMenuOpen(false);
              setShowAddDish(true);
            }}
          >
            {t("order.addDish", "Add")}
          </button>
          <button
            type="button"
            className={styles.actionsSheetRow}
            onClick={() => {
              setActionMenuOpen(false);
              router.push(`/manage/orders?tableNo=${encodeURIComponent(tableNo)}`);
            }}
          >
            {t("orders.title", "Orders")}
          </button>
          {isMergedTable ? (
            <button
              type="button"
              className={styles.actionsSheetRow}
              onClick={() => {
                setActionMenuOpen(false);
                void unmergeTable();
              }}
            >
              {t("order.unmerge", "Unmerge")}
            </button>
          ) : null}
          <button
            type="button"
            className={styles.actionsSheetRow}
            onClick={() => {
              setActionMenuOpen(false);
              void checkout();
            }}
          >
            {t("order.checkout", "Checkout")}
          </button>
          <button
            type="button"
            className={`${styles.actionsSheetRow} ${styles.actionsSheetRowDanger}`}
            onClick={() => {
              setActionMenuOpen(false);
              void closeTable();
            }}
          >
            {t("order.closeTable", "Close")}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={showAddDish}
        onClose={() => setShowAddDish(false)}
        title={t("order.addDishTitle", "Add Custom Dish")}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setShowAddDish(false)}>{t("common.cancel", "Cancel")}</Button>
            <Button onClick={createCustomDish} loading={addingDish}>{t("order.addDishCreate", "Create & Add")}</Button>
          </>
        )}
      >
        <div className="stack">
          <div className="row" style={{ flexWrap: "wrap" }}>
            <Chip active={addDishMode === "temporary"} onClick={() => setAddDishMode("temporary")}>
              {t("order.addDishTemp", "Temporary (this order only)")}
            </Chip>
            <Chip active={addDishMode === "permanent"} onClick={() => setAddDishMode("permanent")} disabled={role !== "manager"}>
              {t("order.addDishPermanent", "Permanent (add to menu)")}
            </Chip>
          </div>
          {role !== "manager" ? (
            <div className="muted">{t("order.addDishPermanentManagerOnly", "Permanent dish requires manager")}</div>
          ) : null}
          <input
            placeholder={t("order.addDishName", "Dish Name")}
            value={addDishForm.name}
            onChange={(e) => setAddDishForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <input
            placeholder={t("order.addDishPrice", "Price")}
            value={addDishForm.price}
            onChange={(e) => setAddDishForm((prev) => ({ ...prev, price: e.target.value }))}
            inputMode="numeric"
          />
          <input
            placeholder={t("order.addDishCategory", "Category")}
            value={addDishForm.category}
            onChange={(e) => setAddDishForm((prev) => ({ ...prev, category: e.target.value }))}
          />
          <input
            placeholder={t("order.addDishDesc", "Description")}
            value={addDishForm.description}
            onChange={(e) => setAddDishForm((prev) => ({ ...prev, description: e.target.value }))}
          />
        </div>
      </BottomSheet>

      <BottomSheet
        open={showBill}
        onClose={() => setShowBill(false)}
        title={`${t("order.billTitle", "Ordered Items")} (${tableNo})`}
        footer={(
          <>
            <Button
              variant="secondary"
              onClick={printGuestReceipt}
              loading={printingBillReceipt}
              disabled={billLoading || billItems.length === 0}
            >
              {t("order.printReceipt", "Print Receipt")}
            </Button>
            <Button onClick={checkout} loading={loading}>
              {`${t("order.checkout", "Checkout")} + ${t("order.closeTable", "Close")}`}
            </Button>
          </>
        )}
      >
        {billLoading ? <div className="muted">{t("common.loading", "Loading...")}</div> : null}
        {!billLoading && billItems.length === 0 ? <EmptyState title={t("order.billEmpty", "No items yet")} /> : null}
        {!billLoading ? (
          <div className="order-list">
            {billItems.map((item) => (
              <div key={`${item.menu_item_id}-${item.note || ""}`} className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="stack" style={{ gap: 2 }}>
                  <span>{localizeMenuText(item.name, lang)} x{item.qty}</span>
                  {item.note ? <span className="muted">{t("order.noteLabel", "Note")}: {item.note}</span> : null}
                </div>
                <strong>₱{item.amount}</strong>
              </div>
            ))}
          </div>
        ) : null}
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>{t("order.billQty", "Total Qty")}: {billQty}</strong>
          <strong>{t("order.billAmount", "Total Amount")}: ₱{billTotal}</strong>
        </div>

        {!billLoading && billOrders.length > 0 ? (
          <div className="stack" style={{ marginTop: 12 }}>
            <strong>{lang === "en" ? "Order Details (Return Dish)" : "订单明细（退菜）"}</strong>
            {billOrders.map((order) => {
              const canReturn = !order.cancelled_at && ["submitted", "preparing", "served"].includes(order.status);
              return (
                <div key={`bill-order-${order.id}`} className="panel stack" style={{ padding: 10 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <span>#{order.id.slice(0, 8)} · {order.status}</span>
                    <strong>₱{order.total_amount}</strong>
                  </div>
                  {(order.items || []).map((item) => {
                    const opKey = `${order.id}:${item.menu_item_id}`;
                    return (
                      <div
                        key={`bill-order-item-${order.id}-${item.menu_item_id}-${item.note || ""}`}
                        className="row"
                        style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}
                      >
                        <div className="stack" style={{ gap: 2 }}>
                          <span>{localizeMenuText(item.name, lang)} x{item.qty}</span>
                          {item.note ? <span className="muted">{t("order.noteLabel", "Note")}: {item.note}</span> : null}
                        </div>
                        <div className="row" style={{ gap: 8, alignItems: "center" }}>
                          <span>₱{item.amount}</span>
                          {canReturn ? (
                            <button
                              type="button"
                              className="secondary compact-btn"
                              disabled={returningItemKey === opKey}
                              onClick={() => { void returnDish(order.id, item); }}
                            >
                              {returningItemKey === opKey
                                ? (lang === "en" ? "Returning..." : "退菜中...")
                                : (lang === "en" ? "Return" : "退菜")}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={cartSheetOpen}
        onClose={() => setCartSheetOpen(false)}
        title={t("order.currentOrder", "Current Order")}
        footer={(
          <>
            <strong>{t("order.total", "Current Total")}: ₱{total}</strong>
            <Button onClick={submitOrder} loading={loading} disabled={cart.length === 0}>
              {t("order.submit", "Submit Order")}
            </Button>
          </>
        )}
      >
        <div className="order-list">
          {cart.map((item) => (
            <div key={`cart-${item.id}-${item.note || ""}`} className="row cart-row">
              <div className="stack" style={{ gap: 2, flex: "1 1 auto" }}>
                <span>{localizeMenuText(item.name, lang)}</span>
                <span className="muted">₱{item.price} x {item.qty}</span>
                {item.note ? <span className="muted">{t("order.noteLabel", "Note")}: {item.note}</span> : null}
              </div>
              <div className="cart-row-actions">
                <Button variant="secondary" onClick={() => setQty(item.id, Math.max(0, item.qty - 1))}>-</Button>
                <span>{item.qty}</span>
                <Button variant="secondary" onClick={() => setQty(item.id, item.qty + 1)}>+</Button>
                <Button variant="secondary" onClick={() => openNoteSheetFor(item.id)}>
                  {t("order.noteAction", "Note")}
                </Button>
                <Button variant="danger" onClick={() => setQty(item.id, 0)}>
                  {lang === "en" ? "Remove" : "移除"}
                </Button>
              </div>
            </div>
          ))}
          {cart.length === 0 ? <EmptyState title={t("order.currentOrderEmpty", "Cart is empty")} /> : null}
        </div>
      </BottomSheet>

      <BottomSheet
        open={noteSheetOpen && Boolean(noteSheetItem)}
        onClose={() => closeNoteSheet(true)}
        title={noteSheetItem ? localizeMenuText(noteSheetItem.name, lang) : undefined}
        footer={(
          <>
            <Button variant="secondary" onClick={() => noteSheetItem && clearManualNote(noteSheetItem.id)}>
              {t("order.noteClear", "Clear")}
            </Button>
            <Button onClick={() => noteSheetItem && applyManualNote(noteSheetItem.id)}>
              {t("order.noteAdd", "Add")}
            </Button>
          </>
        )}
      >
        {noteSheetItem ? (
          <div className="stack">
            <div className="row note-mode-row">
              <Button variant={noteMode === "more" ? "primary" : "secondary"} onClick={() => setNoteMode("more")}>
                {t("order.noteModeMore", "more")}
              </Button>
              <Button variant={noteMode === "no" ? "primary" : "secondary"} onClick={() => setNoteMode("no")}>
                {t("order.noteModeNo", "no")}
              </Button>
            </div>
            <input
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder={t("order.noteInputPlaceholder", "Type your note")}
              maxLength={60}
              autoFocus
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                applyManualNote(noteSheetItem.id);
              }}
            />
            <div className="muted">
              {t("order.noteLabel", "Note")}: {noteSheetItem.note || "-"}
            </div>
          </div>
        ) : null}
      </BottomSheet>

      {error ? <div className="muted" aria-live="polite">{error}</div> : null}

      <Toast
        open={Boolean(toast)}
        message={toast?.message || ""}
        actionLabel={toast?.actionLabel}
        onAction={toast?.onAction}
        onClose={() => setToast(null)}
      />

      <BottomNav />
    </div>
  );
}
