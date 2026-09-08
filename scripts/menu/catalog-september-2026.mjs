// Transcribed from the user's September PDFs. Unlisted catalog rows are retained.
const option = (id, en, zh, price_delta = 0) => ({ id, label_en: en, label_zh: zh, price_delta });
const group = (id, en, zh, options) => ({ id, label_en: en, label_zh: zh, options });
export const drinks = group('beverage', 'Beverage', '选择饮料', [
  option('coke', 'Coke', '可乐'), option('coke_zero', 'Coke Zero', '零度可乐'),
  option('sprite', 'Sprite', '雪碧'), option('royal', 'Royal', 'Royal 橙味汽水'),
  option('mango', 'Mango Juice', '芒果汁'), option('pineapple', 'Pineapple Juice', '菠萝汁'),
  option('four_seasons', 'Four Seasons Juice', '四季果汁'), option('pineapple_orange', 'Pineapple Orange Juice', '菠萝橙汁'),
  option('instant_coffee', 'Instant Black Coffee', '速溶黑咖啡'), option('milk', 'Pure Milk', '纯牛奶'), option('tea', 'Tea', '茶'),
]);
const filipino = [
  group('protein', 'Protein', '选择肉类', [option('beef', 'Beef', '牛肉'), option('fish', 'Fish', '鱼')]),
  group('rice', 'Rice', '选择米饭', [option('plain', 'Plain Rice', '白米饭'), option('garlic', 'Garlic Rice', '蒜香饭')]),
];
export const breakfast = [
  ['Chinese Wonton Set', 500, 'Wontons, Chinese crepe, Boiled egg'],
  ['Chinese Congee Set', 300, 'Steamed mantou, Congee, Boiled egg, Pickled vegetables'],
  ['Chinese Noodle Soup', 400, 'Noodle soup, Fried egg'],
  ['Pancake Breakfast', 450, 'Pancakes, Honey, Butter, Dried fruit, Raisins, Banana slices'],
  ['Waffle Breakfast', 450, 'Waffle, Dried fruit, Oreo, Chocolate sauce'],
  ['Sandwich Set', 450, 'Sandwich, French fries, Ketchup'],
  ['Fruit Oatmeal', 450, 'Oats, Milk, Seasonal fruit (subject to availability)'],
  ['Yogurt Parfait', 450, 'Yogurt, Dried fruit, Raisins, Three slices of toast'],
  ['Continental Breakfast', 550, 'Bacon, Sausages, Scrambled eggs, Toast'],
  ['Filipino Breakfast', 450, 'Choice of Beef or Fish, Plain rice or Garlic rice, Fried egg'],
];
// The system's seafood quantity is 100g; PDF prices are per kg except Tiger Prawn.
const allDayText = `Chicken Curry|450|Filipino Food
Caramelized Chicken|420|Filipino Food
Dory en Blanc|480|Filipino Food
Beef Jalapeno|480|Filipino Food
Chicken Tomato Stew|450|Filipino Food
Chicken Royal|480|Filipino Food
Sweet & Sour Chicken|450|Filipino Food
Chicken Schnitzel|450|Filipino Food
Chop Suey|420|Filipino Food
Chicken Garlic Mushroom|450|Filipino Food
Shrimp Tempura|480|Filipino Food
Pork Hamonado|480|Filipino Food
Beef Bulalo|520|Filipino Food
Shrimp Sinigang|480|Filipino Food
Rice Platter|150|Rice
Plain Rice|25|Rice
Garlic Rice|35|Rice
Garlic Shrimp Pasta|420|Pasta
Chicken Alfredo Pasta|420|Pasta
Calamari Pasta|420|Pasta
Tuna Pesto Pasta|450|Pasta
Carbonara|420|Pasta
Classic Spaghetti|480|Pasta
Hotdog Sandwich|280|Sandwiches
Club Sandwich|380|Sandwiches
Bruschetta|320|Sandwiches
Dejavu Hamburger|380|Sandwiches
Lumpia|420|Appetizer
Calamares|320|Appetizer
Chinese Smashed Cucumber|280|Appetizer
Mouth Watering Chicken|400|Appetizer
Deviled Egg|280|Appetizer
Marinated Peanuts|290|Appetizer
Sweet Dressed Tomatoes|280|Appetizer
French Fries|150|Appetizer
Corn Tortilla Chips|450|Entrées
Garlic Butter Prawns|600|Entrées
Spanish Seafood Paella|1200|Entrées
Crispy Chicken|600|Entrées
Garlic Squid|290|Entrées
Hot Pot Soup Base|480|Hotpot
Beef Roll|450|Hotpot
Seafood Tofu|360|Hotpot
Sausage (Hotpot)|320|Hotpot
Dipping Sauce|50|Hotpot
Beef Tongue|390|Hotpot
Lobster Roll|360|Hotpot
Chikuwa|360|Hotpot
Squid Roll|220|Hotpot
Radish|120|Hotpot
Luncheon Meat|400|Hotpot
Vermicelli|280|Hotpot
Potato|150|Hotpot
Shrimp (Hotpot)|450|Hotpot
Beef Skewer|80|Sunset BBQ
Cheese Fish Tofu|80|Sunset BBQ
Sausage (BBQ)|60|Sunset BBQ
Chicken Thigh|350|Sunset BBQ
Fish Ball|60|Sunset BBQ
Shrimp (BBQ)|200|Sunset BBQ
Eggplant|50|Sunset BBQ
Potato Slice|50|Sunset BBQ
Grouper|160|Local Catch
Hairtail|120|Local Catch
Parrot Fish|120|Local Catch
Crab|150|Treasures from the Sea
Mantis|360|Treasures from the Sea
Tiger Prawn|200|Treasures from the Sea
Dumplings (8 pcs)|300|Chinese Food
Steamed Egg Soup|90|Chinese Food
Chinese Style Prawns|420|Chinese Food
Braised Chicken|450|Chinese Food
Braised Pork|490|Chinese Food
Chicken in Soy Bean Sauce|420|Chinese Food
Mapo Tofu|380|Chinese Food
Stir-fried Pork with Chillies|480|Chinese Food
Kung Pao Chicken|480|Chinese Food
Braised Beef Brisket|520|Chinese Food
Sichuan Spicy Chicken Cubes|420|Chinese Food
Pan-fried Tofu|370|Chinese Food
Stir-fried Beef w/ Onion|490|Chinese Food
Steamed Fish|1200|Chinese Food
Hong Shao Yu|1200|Chinese Food
Suan Cai Yu|1200|Chinese Food
Wok-seared Lettuce|360|Chinese Food
Morning Glory w/ Garlic|280|Chinese Food
Dry-fried Green Beans|360|Chinese Food
Stir-fried Cabbage w/ Chili|290|Chinese Food
Stir-fried Eggs w/ Tomato Onion Cucumber|300|Chinese Food
Stir-fried Potatoes w/ Chili|320|Chinese Food
Peking Zha Jiang Noodle|400|Chinese Food
Braised Eggplant|360|Chinese Food
Wontons|260|Chinese Food
Fried Rice|320|Chinese Food
San Mig Pilsen|120|Beer
San Mig Light|120|Beer
Stallion|120|Beer
Grande (San Mig)|180|Beer
Red Horse (Liter)|180|Beer
Coke|90|Soft Drinks
Coke Zero|90|Soft Drinks
Sprite|90|Soft Drinks
Royal|90|Soft Drinks
Coke Zero (Vanilla)|100|Soft Drinks
Coke (Jack Daniels)|200|Special Drinks
Mango Juice|90|Canned Juices
Pineapple Juice|90|Canned Juices
Pineapple Orange Juice|90|Canned Juices
Four Seasons Juice|90|Canned Juices
Mango Shake|150|Shakes
Watermelon Shake|150|Shakes
Banana Shake|150|Shakes
Black Coffee|100|Coffee
Espresso|100|Coffee
Latte|180|Coffee
Americano|150|Coffee
Long Island Iced Tea|240|Classic Cocktails
Cuba Libre|180|Classic Cocktails
Gin & Tonic|180|Classic Cocktails
Caipirinha|180|Classic Cocktails
Mojito|180|Classic Cocktails
Margarita|180|Classic Cocktails
Pina Colada|180|Classic Cocktails
Sex on the Beach|180|Classic Cocktails
Mai Tai|180|Classic Cocktails
Rhum Coke|180|Classic Cocktails
Mango Daiquiri|180|Classic Cocktails
Amaretto Sour|180|Classic Cocktails
Screwdriver|180|Classic Cocktails
Sidecar|180|Classic Cocktails
Blue Lagoon|180|Classic Cocktails
Tequila Sunrise|180|Classic Cocktails
Whiskey Sour|200|Classic Cocktails`;
const beverageCategories = new Set(['Beer', 'Soft Drinks', 'Special Drinks', 'Canned Juices', 'Shakes', 'Coffee']);
export function catalog() {
  const rows = allDayText.split('\n').map((line, index) => {
    const [name, price, category] = line.split('|');
    return { name, price: Number(price), category, menu_group: category === 'Classic Cocktails' ? 'cocktail' : 'lunch_dinner',
      available_shifts: category === 'Classic Cocktails' ? ['cocktail'] : beverageCategories.has(category) ? ['beverage'] : ['lunch', 'dinner'],
      sort_order: 100 + index, option_groups: name === 'Chop Suey' ? [group('protein', 'Protein', '选择肉类', [option('chicken', 'Chicken', '鸡肉'), option('pork', 'Pork', '猪肉', 30)])] : [] };
  });
  for (const [index, [name, price, description]] of breakfast.entries()) {
    rows.push({ name, price, description, category: 'Set', menu_group: 'breakfast', available_shifts: ['breakfast'],
      item_type: 'set', sort_order: 10 + index, option_groups: name === 'Filipino Breakfast' ? filipino : [] });
    rows.push({ name, price: 0, description, category: 'Free', menu_group: 'breakfast', available_shifts: ['breakfast'],
      item_type: 'set', is_complimentary: true, sort_order: -20 + index, option_groups: [drinks, ...(name === 'Filipino Breakfast' ? filipino : [])] });
  }
  for (const [index, [name, price, description]] of [
    ['Tea Egg', 50, '1 pc'], ['Fried Egg', 35, '1 pc'], ['Wontons', 260, '8 pcs'], ['Bacon', 150, '3 pcs'],
    ['Pan-fried Mantou', 100, '1 serving'], ['Chinese Crepe', 40, '1 pc'], ['Steamed Mantou', 30, '1 pc'], ['Toast', 30, '1 pc'],
  ].entries()) rows.push({ name, price, description, category: 'Add-ons', menu_group: 'breakfast', available_shifts: ['breakfast'], sort_order: 30 + index, option_groups: [] });
  const breakfastDrinks = [
    ['Coke', 90], ['Coke Zero', 90], ['Sprite', 90], ['Royal', 90], ['Coke Zero (Vanilla)', 100],
    ['Mango Juice', 90], ['Pineapple Juice', 90], ['Four Seasons Juice', 90], ['Pineapple Orange Juice', 90],
    ['Mango Shake', 150], ['Watermelon Shake', 150], ['Banana Shake', 150], ['Instant Black Coffee', 100],
    ['Espresso', 80], ['Americano', 150], ['Latte', 180], ['Tea', 100],
  ];
  for (const [index, [name, price]] of breakfastDrinks.entries()) {
    const shared = rows.find(row => row.name === name && row.menu_group === 'lunch_dinner' && row.price === price && name !== 'Espresso');
    if (shared) shared.available_shifts.push('breakfast');
    else rows.push({ name, price, category: 'Coffee', menu_group: 'breakfast',
      available_shifts: ['breakfast'], sort_order: 50 + index,
      option_groups: name === 'Espresso' ? [group('shots', 'Shots', '浓缩份数', [option('single', '1 shot', '单份'), option('double', '2 shots', '双份', 70)])] : [] });
  }
  return rows;
}

// No deletion or disabling. Existing names/IDs and unlisted staff items survive.
export async function refreshCatalog(client) {
  const changes = [];
  for (const item of catalog()) {
    const existing = (await client.query(`SELECT * FROM menu_items WHERE is_active AND NOT is_temporary
      AND lower(name) = lower($1) AND menu_group = $2 AND is_complimentary = $3 ORDER BY id`,
    [item.name, item.menu_group, Boolean(item.is_complimentary)])).rows;
    if (existing.length > 1) throw new Error(`Ambiguous catalog match: ${item.name} (${item.menu_group}). No changes applied.`);
    const old = existing[0];
    if (old) {
      await client.query(`UPDATE menu_items SET price=$2, description=COALESCE($3,description), category=$4, option_groups=$5::jsonb, available_shifts=$6
        WHERE id=$1`, [old.id, item.price, item.description ?? null, item.category, JSON.stringify(item.option_groups), [...new Set([...old.available_shifts, ...item.available_shifts])]]);
      if (old.price !== item.price || old.category !== item.category || JSON.stringify(old.option_groups) !== JSON.stringify(item.option_groups))
        changes.push({ name: old.name, before: old.price, after: item.price, category: item.category });
    } else {
      const result = await client.query(`INSERT INTO menu_items(name,price,category,description,menu_group,item_type,available_shifts,sort_order,option_groups,is_complimentary)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING id,code`,
      [item.name,item.price,item.category,item.description ?? null,item.menu_group,item.item_type || 'single',item.available_shifts,item.sort_order,JSON.stringify(item.option_groups),Boolean(item.is_complimentary)]);
      changes.push({ name: item.name, added: true, price: item.price, code: result.rows[0].code, category: item.category });
    }
  }
  return changes;
}
