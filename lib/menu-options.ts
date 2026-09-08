export type MenuOption = { id: string; label_en: string; label_zh?: string; price_delta: number };
export type MenuOptionGroup = { id: string; label_en: string; label_zh?: string; options: MenuOption[] };
export type MenuChoices = Record<string, string>;
export type ConfigurableMenuItem = {
  price: number;
  code?: number | null;
  option_groups?: MenuOptionGroup[];
  is_complimentary?: boolean;
};

export function choiceKey(choices: MenuChoices = {}) {
  return Object.keys(choices).sort().map((key) => `${key}=${choices[key]}`).join('&');
}
export function cartLineKey(id: string, choices: MenuChoices = {}) {
  const key = choiceKey(choices);
  return key ? `${id}::${key}` : id;
}
export function choicesComplete(item: ConfigurableMenuItem, choices: MenuChoices = {}) {
  const groups = item.option_groups || [];
  return Object.keys(choices).length === groups.length && groups.every((g) => g.options.some((o) => o.id === choices[g.id]));
}
export function selectedPrice(item: ConfigurableMenuItem, choices: MenuChoices = {}) {
  if (item.is_complimentary) return 0;
  return item.price + (item.option_groups || []).reduce((sum, g) => sum + (g.options.find((o) => o.id === choices[g.id])?.price_delta || 0), 0);
}
export function choiceLabels(item: ConfigurableMenuItem, choices: MenuChoices = {}, lang = 'en') {
  return (item.option_groups || []).flatMap((g) => {
    const option = g.options.find((o) => o.id === choices[g.id]);
    return option ? [`${lang === 'zh' ? g.label_zh || g.label_en : g.label_en}: ${lang === 'zh' ? option.label_zh || option.label_en : option.label_en}`] : [];
  }).join('; ');
}
export function matchesMenuCode(item: ConfigurableMenuItem, input: string) {
  return /^\d+$/.test(input.trim()) && item.code != null && item.code === Number(input.trim());
}
