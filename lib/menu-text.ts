import type { Lang } from "./i18n";

type Pair = { zh: string; en: string };

const pairs: Pair[] = [
  { zh: "早餐", en: "Breakfast" },
  { zh: "热菜", en: "Hot Dish" },
  { zh: "主食", en: "Staple" },
  { zh: "鸡尾酒", en: "Cocktail" },
  { zh: "临时菜", en: "Temporary" },
  { zh: "早餐套餐 A", en: "Breakfast Set A" },
  { zh: "早餐套餐 B", en: "Breakfast Set B" },
  { zh: "宫保鸡丁", en: "Kung Pao Chicken" },
  { zh: "鱼香肉丝", en: "Fish-Fragrant Pork" },
  { zh: "米饭", en: "Steamed Rice" },
  { zh: "经典莫吉托", en: "Classic Mojito" },
  { zh: "阿佩罗橙光", en: "Aperol Orange Glow" }
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

