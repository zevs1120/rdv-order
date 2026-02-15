-- Replace pin_salt and pin_hash with values from scripts/gen-pin.js
INSERT INTO users (username, role, pin_salt, pin_hash)
VALUES
  ('waiter1', 'waiter', 'REPLACE_SALT', 'REPLACE_HASH'),
  ('manager1', 'manager', 'REPLACE_SALT', 'REPLACE_HASH');

INSERT INTO menu_items (name, price, category, sort_order)
VALUES
  ('宫保鸡丁', 38, '热菜', 1),
  ('鱼香肉丝', 36, '热菜', 2),
  ('米饭', 3, '主食', 10),
  ('可乐', 8, '饮品', 20);
