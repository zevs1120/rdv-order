INSERT INTO users (username, role, pin_salt, pin_hash)
VALUES
  ('mercy', 'waiter', 'c54576a716b413db', '24918ad92b19d6597b0fcd32271ba9b9d02d86a0348e3505a932fbe6af8fef55'),
  ('manager1', 'manager', 'c54576a716b413db', '24918ad92b19d6597b0fcd32271ba9b9d02d86a0348e3505a932fbe6af8fef55');

INSERT INTO menu_items (name, price, category, menu_group, item_type, sort_order)
VALUES
  ('早餐套餐 A', 28, '早餐', 'breakfast', 'set', 1),
  ('早餐套餐 B', 32, '早餐', 'breakfast', 'set', 2),
  ('宫保鸡丁', 38, '热菜', 'lunch_dinner', 'single', 10),
  ('鱼香肉丝', 36, '热菜', 'lunch_dinner', 'single', 11),
  ('米饭', 3, '主食', 'lunch_dinner', 'single', 20),
  ('经典莫吉托', 58, '鸡尾酒', 'cocktail', 'single', 30),
  ('阿佩罗橙光', 62, '鸡尾酒', 'cocktail', 'single', 31);
