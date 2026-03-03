UPDATE menu_items
SET available_shifts = ARRAY['beverage']::text[]
WHERE menu_group = 'lunch_dinner'
  AND lower(trim(COALESCE(category, ''))) IN (
    'beer',
    'soft drink',
    'soft drinks',
    'canned juice',
    'canned juices',
    'shake',
    'shakes',
    '啤酒',
    '软饮',
    '罐装果汁',
    '奶昔'
  );
