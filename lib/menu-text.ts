import type { Lang } from "./i18n";

type Pair = { zh: string; en: string };

const pairs: Pair[] = [
  { zh: "早餐", en: "Breakfast" },
  { zh: "套餐", en: "Package" },
  { zh: "鸡尾酒", en: "Cocktail" },
  { zh: "经典鸡尾酒", en: "Classic Cocktails" },
  { zh: "菲律宾菜", en: "Filipino Food" },
  { zh: "中式菜", en: "Chinese Food" },
  { zh: "开胃菜", en: "Appetizer" },
  { zh: "意面", en: "Pasta" },
  { zh: "米饭", en: "Rice" },
  { zh: "三明治", en: "Sandwiches" },
  { zh: "火锅", en: "Hotpot" },
  { zh: "日落烧烤", en: "Sunset BBQ" },
  { zh: "啤酒", en: "Beer" },
  { zh: "软饮", en: "Soft Drinks" },
  { zh: "罐装果汁", en: "Canned Juices" },
  { zh: "特调饮品", en: "Special Drinks" },
  { zh: "奶昔", en: "Shakes" },
  { zh: "咖啡", en: "Coffee" },
  { zh: "马尼拉远航特调", en: "Signature - Galleon Echoes" },
  { zh: "海岛遐想特调", en: "Signature - Island Reverie" },
  { zh: "临时菜", en: "Temporary" },
  { zh: "早餐套餐 A", en: "Breakfast Set A" },
  { zh: "早餐套餐 B", en: "Breakfast Set B" },
  { zh: "套餐 A", en: "Package A" },
  { zh: "套餐 B", en: "Package B" },
  { zh: "经典莫吉托", en: "Mojito" }
];

const zhToEn = new Map<string, string>();
const enToZh = new Map<string, string>();

for (const item of pairs) {
  zhToEn.set(item.zh.toLowerCase(), item.en);
  enToZh.set(item.en.toLowerCase(), item.zh);
}

export function localizeMenuText(text: string | null | undefined, lang: Lang) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (lang === "en") {
    return zhToEn.get(value.toLowerCase()) || value;
  }
  return enToZh.get(value.toLowerCase()) || value;
}

export function shortCategoryLabel(text: string | null | undefined, lang: Lang) {
  const localized = localizeMenuText(text, lang).trim();
  if (!localized) return "";

  if (lang === "zh") {
    return localized;
  }

  const compact = localized
    .replace(/\s+(food|foods|cuisine|dishes|menu|specials)$/i, "")
    .replace(/\s*\/\s*.*/, "")
    .trim();

  if (compact.length <= 11) {
    return compact;
  }

  const first = compact.split(/\s+/)[0];
  return first || compact;
}
