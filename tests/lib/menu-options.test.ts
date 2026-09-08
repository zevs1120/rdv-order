import { expect, it } from 'vitest';
import { cartLineKey, choicesComplete, matchesMenuCode, selectedPrice } from '../../lib/menu-options';
import { parseItems, buildItemSignature } from '../../lib/orders-utils';
const id = '11111111-1111-4111-8111-111111111111';
const dish = { code: 12, price: 420, option_groups: [{ id: 'protein', label_en: 'Protein', options: [
  { id: 'chicken', label_en: 'Chicken', price_delta: 0 }, { id: 'pork', label_en: 'Pork', price_delta: 30 },
] }] };
it('exact codes accept omitted leading zeros, without matching other numeric fields', () => {
  expect(matchesMenuCode(dish, '012')).toBe(true); expect(matchesMenuCode(dish, '12')).toBe(true);
  expect(matchesMenuCode(dish, '1')).toBe(false); expect(matchesMenuCode(dish, '420')).toBe(false);
});
it('requires a choice and totals the selected variant; complimentary prices always remain zero', () => {
  expect(choicesComplete(dish, {})).toBe(false); expect(choicesComplete(dish, { protein: 'beef' })).toBe(false);
  expect(choicesComplete(dish, { protein: 'pork' })).toBe(true);
  expect(selectedPrice(dish, { protein: 'pork' })).toBe(450);
  expect(selectedPrice({ ...dish, is_complimentary: true }, { protein: 'pork' })).toBe(0);
});
it('cart and idempotency identities preserve different selections and canonicalize key order', () => {
  expect(cartLineKey(id, { beverage: 'tea' })).not.toBe(cartLineKey(id, { beverage: 'milk' }));
  const a = { menuItemId: id, qty: 1, note: null, choices: { protein: 'beef', rice: 'garlic' } };
  const b = { ...a, choices: { rice: 'garlic', protein: 'beef' } };
  expect(buildItemSignature([a])).toBe(buildItemSignature([b]));
  expect(parseItems([a, b])).toHaveLength(1);
  expect(parseItems([a, { ...a, choices: { protein: 'fish', rice: 'garlic' } }])).toHaveLength(2);
});
