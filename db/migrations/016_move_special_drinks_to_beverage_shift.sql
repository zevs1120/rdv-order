UPDATE menu_items
SET available_shifts = ARRAY['beverage']::text[]
WHERE menu_group = 'lunch_dinner'
  AND (
    COALESCE(category, '') ILIKE '%特调%'
    OR COALESCE(category, '') ILIKE '%special%'
    OR name ILIKE '%特调%'
    OR name ILIKE '%signature%'
    OR name IN (
      '马尼拉远航特调',
      '海岛遐想特调',
      'Signature - Galleon Echoes',
      'Signature - Island Reverie'
    )
  );
