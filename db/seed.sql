INSERT INTO users (username, role, pin_salt, pin_hash)
VALUES
  ('Mercy', 'manager', 'c54576a716b413db', '24918ad92b19d6597b0fcd32271ba9b9d02d86a0348e3505a932fbe6af8fef55'),
  ('Leo', 'manager', 'c54576a716b413db', '24918ad92b19d6597b0fcd32271ba9b9d02d86a0348e3505a932fbe6af8fef55'),
  ('Maria', 'waiter', '451901a6849e6bf1', '7fb6890f9b8ee8516cebceea1c58515e5f37c13dba1870107a0f8996b4655bba'),
  ('Joy', 'waiter', '0cb37db0ff76292e', '8834f571e39d6bb09261b18ea20c01b53c403d1644c51ba7193d0371a253930c'),
  ('Dani', 'waiter', 'cb050de0211330ec', 'a021c358772d2ce0262cd6100b32981145cae43d606d0a940046e99849d161e9');

INSERT INTO role_permissions (role, permission, allowed)
VALUES
  ('waiter', 'order.create', true),
  ('waiter', 'order.return_item', true),
  ('waiter', 'order.cancel', false),
  ('waiter', 'order.adjust_charge', false),
  ('waiter', 'order.split_merge', false),
  ('waiter', 'order.delete', false),
  ('waiter', 'cashier.reverse_checkout', false),
  ('waiter', 'cashier.close_shift', false),
  ('waiter', 'kitchen.view', true),
  ('waiter', 'kitchen.update', false),
  ('waiter', 'kitchen.rush', true),
  ('waiter', 'report.orders', true),
  ('waiter', 'report.finance', false),
  ('waiter', 'report.ops', false),
  ('waiter', 'menu.manage', false),
  ('waiter', 'rbac.manage', false),
  ('waiter', 'device.view', false),
  ('waiter', 'device.manage', false),
  ('manager', 'order.create', true),
  ('manager', 'order.return_item', true),
  ('manager', 'order.cancel', true),
  ('manager', 'order.adjust_charge', true),
  ('manager', 'order.split_merge', true),
  ('manager', 'order.delete', true),
  ('manager', 'cashier.reverse_checkout', true),
  ('manager', 'cashier.close_shift', true),
  ('manager', 'kitchen.view', true),
  ('manager', 'kitchen.update', true),
  ('manager', 'kitchen.rush', true),
  ('manager', 'report.orders', true),
  ('manager', 'report.finance', true),
  ('manager', 'report.ops', true),
  ('manager', 'menu.manage', true),
  ('manager', 'rbac.manage', true),
  ('manager', 'device.view', true),
  ('manager', 'device.manage', true)
ON CONFLICT (role, permission) DO NOTHING;

INSERT INTO device_status (device_code, device_type, label, status, is_backup)
VALUES
  ('printer-primary', 'printer', 'Primary Printer', 'offline', false),
  ('printer-backup', 'printer', 'Backup Printer', 'offline', true)
ON CONFLICT (device_code) DO NOTHING;

INSERT INTO menu_items (name, price, category, description, menu_group, item_type, sort_order, available_shifts)
VALUES
  ('Chinese Wonton Set', 500, 'Breakfast Set', 'Wontons, Egg pancake, Tea egg', 'breakfast', 'set', 10, ARRAY['breakfast']),
  ('Chinese Congee Set', 500, 'Breakfast Set', 'Steamed mantou, Congee, Tea egg, Pickled vegetables', 'breakfast', 'set', 11, ARRAY['breakfast']),
  ('Chinese Noodle Soup', 500, 'Breakfast Set', 'Noodle soup, Tea egg', 'breakfast', 'set', 12, ARRAY['breakfast']),
  ('Pancake Breakfast', 500, 'Breakfast Set', '3 pancakes, Maple syrup, Butter, Chocolate sauce, Whipped cream, Dried fruit, Raisins, Banana slices', 'breakfast', 'set', 13, ARRAY['breakfast']),
  ('Waffle Breakfast', 500, 'Breakfast Set', 'Waffle, Dried fruit, Austrian sausage, Chocolate sauce', 'breakfast', 'set', 14, ARRAY['breakfast']),
  ('Fruit Oatmeal', 500, 'Breakfast Set', 'Oats, Milk, Seasonal fruit (subject to availability)', 'breakfast', 'set', 15, ARRAY['breakfast']),
  ('Yogurt Parfait', 500, 'Breakfast Set', 'Yogurt, Dried fruit, Raisins, Three slices of toast', 'breakfast', 'set', 16, ARRAY['breakfast']),
  ('Continental Breakfast', 500, 'Breakfast Set', 'Bacon, Sausages, Scrambled eggs, Toast', 'breakfast', 'set', 17, ARRAY['breakfast']),
  ('Filipino Breakfast', 500, 'Breakfast Set', 'Beef with onions, Fish, Rice, Fried egg', 'breakfast', 'set', 18, ARRAY['breakfast']),
  ('套餐 A', 299, '套餐', NULL, 'set_menu', 'set', 5, ARRAY['package']),
  ('套餐 B', 399, '套餐', NULL, 'set_menu', 'set', 6, ARRAY['package']),
  ('经典莫吉托', 580, '鸡尾酒', NULL, 'cocktail', 'single', 30, ARRAY['cocktail']),
  ('阿佩罗橙光', 620, '鸡尾酒', NULL, 'cocktail', 'single', 31, ARRAY['cocktail']),
  ('Grouper', 120, 'Local Catch', 'Seasonal Seafood · Steamed / Braised / Pickled', 'lunch_dinner', 'single', 320, ARRAY['lunch', 'dinner']),
  ('Hairtail', 80, 'Local Catch', 'Seasonal Seafood · Steamed / Braised / Seared', 'lunch_dinner', 'single', 321, ARRAY['lunch', 'dinner']),
  ('Parrot Fish', 90, 'Local Catch', 'Seasonal Seafood · Steamed / Braised / Pickled', 'lunch_dinner', 'single', 322, ARRAY['lunch', 'dinner']),
  ('Crab', 150, 'Treasures from the Sea', 'Seasonal Seafood · Steamed / Ginger & Garlic', 'lunch_dinner', 'single', 323, ARRAY['lunch', 'dinner']),
  ('Mantis', 360, 'Treasures from the Sea', 'Seasonal Seafood · Steamed / Salt & Pepper', 'lunch_dinner', 'single', 324, ARRAY['lunch', 'dinner']),
  ('Tiger Prawn', 200, 'Treasures from the Sea', 'Seasonal Seafood · Poached / Braised / BBQ', 'lunch_dinner', 'single', 325, ARRAY['lunch', 'dinner']);
