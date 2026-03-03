WITH breakfast_items(name, price, category, description, sort_order) AS (
  VALUES
    ('Chinese Wonton Set', 500, 'Breakfast Set', 'Wontons, Egg pancake, Tea egg', 10),
    ('Chinese Congee Set', 500, 'Breakfast Set', 'Steamed mantou, Congee, Tea egg, Pickled vegetables', 11),
    ('Chinese Noodle Soup', 500, 'Breakfast Set', 'Noodle soup, Tea egg', 12),
    ('Pancake Breakfast', 500, 'Breakfast Set', '3 pancakes, Maple syrup, Butter, Chocolate sauce, Whipped cream, Dried fruit, Raisins, Banana slices', 13),
    ('Waffle Breakfast', 500, 'Breakfast Set', 'Waffle, Dried fruit, Austrian sausage, Chocolate sauce', 14),
    ('Fruit Oatmeal', 500, 'Breakfast Set', 'Oats, Milk, Seasonal fruit (subject to availability)', 15),
    ('Yogurt Parfait', 500, 'Breakfast Set', 'Yogurt, Dried fruit, Raisins, Three slices of toast', 16),
    ('Continental Breakfast', 500, 'Breakfast Set', 'Bacon, Sausages, Scrambled eggs, Toast', 17),
    ('Filipino Breakfast', 500, 'Breakfast Set', 'Beef with onions, Fish, Rice, Fried egg', 18)
)
UPDATE menu_items mi
SET price = bi.price,
    category = bi.category,
    description = bi.description,
    menu_group = 'breakfast',
    item_type = 'set',
    is_active = true,
    is_temporary = false,
    sort_order = bi.sort_order,
    available_shifts = ARRAY['breakfast']::text[]
FROM breakfast_items bi
WHERE lower(mi.name) = lower(bi.name)
  AND mi.menu_group = 'breakfast';

WITH breakfast_items(name, price, category, description, sort_order) AS (
  VALUES
    ('Chinese Wonton Set', 500, 'Breakfast Set', 'Wontons, Egg pancake, Tea egg', 10),
    ('Chinese Congee Set', 500, 'Breakfast Set', 'Steamed mantou, Congee, Tea egg, Pickled vegetables', 11),
    ('Chinese Noodle Soup', 500, 'Breakfast Set', 'Noodle soup, Tea egg', 12),
    ('Pancake Breakfast', 500, 'Breakfast Set', '3 pancakes, Maple syrup, Butter, Chocolate sauce, Whipped cream, Dried fruit, Raisins, Banana slices', 13),
    ('Waffle Breakfast', 500, 'Breakfast Set', 'Waffle, Dried fruit, Austrian sausage, Chocolate sauce', 14),
    ('Fruit Oatmeal', 500, 'Breakfast Set', 'Oats, Milk, Seasonal fruit (subject to availability)', 15),
    ('Yogurt Parfait', 500, 'Breakfast Set', 'Yogurt, Dried fruit, Raisins, Three slices of toast', 16),
    ('Continental Breakfast', 500, 'Breakfast Set', 'Bacon, Sausages, Scrambled eggs, Toast', 17),
    ('Filipino Breakfast', 500, 'Breakfast Set', 'Beef with onions, Fish, Rice, Fried egg', 18)
)
INSERT INTO menu_items (name, price, category, description, menu_group, item_type, is_active, is_temporary, sort_order, allergens, available_shifts)
SELECT
  bi.name,
  bi.price,
  bi.category,
  bi.description,
  'breakfast',
  'set',
  true,
  false,
  bi.sort_order,
  '{}'::text[],
  ARRAY['breakfast']::text[]
FROM breakfast_items bi
WHERE NOT EXISTS (
  SELECT 1
  FROM menu_items mi
  WHERE lower(mi.name) = lower(bi.name)
    AND mi.menu_group = 'breakfast'
);
