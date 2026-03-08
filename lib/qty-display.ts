import type { Lang } from "./i18n";

const WEIGHT_BASED_SEAFOOD = new Set([
  "grouper",
  "石斑鱼",
  "hairtail",
  "带鱼",
  "parrot fish",
  "青衣鱼",
  "crab",
  "金玉蟹",
  "mantis",
  "富贵虾"
]);

const PIECE_BASED_SEAFOOD = new Set([
  "tiger prawn",
  "老虎虾"
]);

function normalizeDishKey(name: string | null | undefined) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function formatItemQtyDisplay(name: string | null | undefined, qtyRaw: number, lang: Lang) {
  const qty = Math.max(0, Number(qtyRaw) || 0);
  const key = normalizeDishKey(name);
  if (WEIGHT_BASED_SEAFOOD.has(key)) {
    return `${qty * 100}g`;
  }
  if (PIECE_BASED_SEAFOOD.has(key)) {
    return lang === "en" ? `${qty} pcs` : `${qty}只`;
  }
  return String(qty);
}
