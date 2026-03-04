export type OrderItemInput = {
  menuItemId: string;
  qty: number;
  note: string | null;
};

const UUID_V4_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDER_DEDUPE_WINDOW_DEFAULT_SECONDS = 8;

export function parseItems(raw: unknown): OrderItemInput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("INVALID_ITEMS");
  }

  const merged = new Map<string, OrderItemInput>();
  for (const item of raw) {
    const menuItemId = String((item as { menuItemId?: unknown })?.menuItemId || "").trim();
    const qty = Number((item as { qty?: unknown })?.qty);
    const noteRaw = String((item as { note?: unknown })?.note || "").trim();
    const note = noteRaw || null;

    if (!UUID_V4_LIKE.test(menuItemId)) {
      throw new Error("INVALID_ITEMS");
    }
    if (!Number.isInteger(qty) || qty <= 0 || qty > 30) {
      throw new Error("INVALID_ITEMS");
    }
    if (noteRaw.length > 120) {
      throw new Error("INVALID_ITEMS");
    }

    const key = `${menuItemId}::${normalizeNote(note)}`;
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, { ...existing, qty: existing.qty + qty });
    } else {
      merged.set(key, { menuItemId, qty, note });
    }
  }

  if (merged.size === 0 || merged.size > 40) {
    throw new Error("INVALID_ITEMS");
  }

  return Array.from(merged.values());
}

function normalizeNote(value: string | null) {
  return String(value || "").trim().toLowerCase();
}

export function buildItemSignature(items: OrderItemInput[]) {
  return items
    .map((item) => `${item.menuItemId}:${item.qty}:${normalizeNote(item.note)}`)
    .sort()
    .join("|");
}

export function getOrderDedupeWindowSeconds() {
  const raw = Number(process.env.ORDER_DEDUPE_WINDOW_SECONDS || ORDER_DEDUPE_WINDOW_DEFAULT_SECONDS);
  if (!Number.isFinite(raw)) return ORDER_DEDUPE_WINDOW_DEFAULT_SECONDS;
  return Math.min(20, Math.max(3, Math.round(raw)));
}
