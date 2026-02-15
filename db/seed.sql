INSERT INTO users (username, role, pin_salt, pin_hash)
VALUES
  ('mercy', 'waiter', 'c54576a716b413db', '24918ad92b19d6597b0fcd32271ba9b9d02d86a0348e3505a932fbe6af8fef55'),
  ('manager1', 'manager', 'c54576a716b413db', '24918ad92b19d6597b0fcd32271ba9b9d02d86a0348e3505a932fbe6af8fef55');

INSERT INTO menu_items (name, price, category, sort_order)
VALUES
  ('宫保鸡丁', 38, '热菜', 1),
  ('鱼香肉丝', 36, '热菜', 2),
  ('米饭', 3, '主食', 10),
  ('可乐', 8, '饮品', 20);
