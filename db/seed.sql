INSERT INTO users (username, role, pin_salt, pin_hash)
VALUES
  ('Mercy', 'manager', 'c54576a716b413db', '24918ad92b19d6597b0fcd32271ba9b9d02d86a0348e3505a932fbe6af8fef55'),
  ('Leo', 'manager', 'c54576a716b413db', '24918ad92b19d6597b0fcd32271ba9b9d02d86a0348e3505a932fbe6af8fef55'),
  ('Maria', 'waiter', '451901a6849e6bf1', '7fb6890f9b8ee8516cebceea1c58515e5f37c13dba1870107a0f8996b4655bba'),
  ('Joy', 'waiter', '0cb37db0ff76292e', '8834f571e39d6bb09261b18ea20c01b53c403d1644c51ba7193d0371a253930c'),
  ('Dani', 'waiter', 'cb050de0211330ec', 'a021c358772d2ce0262cd6100b32981145cae43d606d0a940046e99849d161e9');

INSERT INTO menu_items (name, price, category, menu_group, item_type, sort_order)
VALUES
  ('早餐套餐 A', 28, '早餐', 'breakfast', 'set', 1),
  ('早餐套餐 B', 32, '早餐', 'breakfast', 'set', 2),
  ('宫保鸡丁', 38, '热菜', 'lunch_dinner', 'single', 10),
  ('鱼香肉丝', 36, '热菜', 'lunch_dinner', 'single', 11),
  ('米饭', 3, '主食', 'lunch_dinner', 'single', 20),
  ('经典莫吉托', 58, '鸡尾酒', 'cocktail', 'single', 30),
  ('阿佩罗橙光', 62, '鸡尾酒', 'cocktail', 'single', 31);
