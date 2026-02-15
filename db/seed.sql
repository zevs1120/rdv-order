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

INSERT INTO menu_items (name, price, category, menu_group, item_type, sort_order)
VALUES
  ('早餐套餐 A', 280, '早餐', 'breakfast', 'set', 1),
  ('早餐套餐 B', 320, '早餐', 'breakfast', 'set', 2),
  ('套餐 A', 299, '套餐', 'set_menu', 'set', 5),
  ('套餐 B', 399, '套餐', 'set_menu', 'set', 6),
  ('经典莫吉托', 580, '鸡尾酒', 'cocktail', 'single', 30),
  ('阿佩罗橙光', 620, '鸡尾酒', 'cocktail', 'single', 31);
