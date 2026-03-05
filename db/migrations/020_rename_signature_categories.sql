UPDATE menu_items
SET category = CASE
  WHEN BTRIM(category) IN ('Signature - Galleon Echoes', '马尼拉远航特调', '帆船回响') THEN 'Galleon Echoes'
  WHEN BTRIM(category) IN ('Signature - Island Reverie', '海岛遐想特调', '海岛白日梦') THEN 'Island Reverie'
  ELSE category
END
WHERE BTRIM(category) IN (
  'Signature - Galleon Echoes',
  '马尼拉远航特调',
  '帆船回响',
  'Signature - Island Reverie',
  '海岛遐想特调',
  '海岛白日梦'
);

-- If menu_subcategories table exists (migration 019), rename related subcategory records as well.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'menu_subcategories'
  ) THEN
    UPDATE menu_subcategories
    SET name = CASE
      WHEN BTRIM(name) IN ('Signature - Galleon Echoes', '马尼拉远航特调', '帆船回响') THEN 'Galleon Echoes'
      WHEN BTRIM(name) IN ('Signature - Island Reverie', '海岛遐想特调', '海岛白日梦') THEN 'Island Reverie'
      ELSE name
    END,
        name_key = CASE
      WHEN BTRIM(name) IN ('Signature - Galleon Echoes', '马尼拉远航特调', '帆船回响') THEN LOWER('Galleon Echoes')
      WHEN BTRIM(name) IN ('Signature - Island Reverie', '海岛遐想特调', '海岛白日梦') THEN LOWER('Island Reverie')
      ELSE LOWER(BTRIM(name))
    END,
        display_name_zh = CASE
      WHEN BTRIM(name) IN ('Signature - Galleon Echoes', '马尼拉远航特调', '帆船回响') THEN '帆船回响'
      WHEN BTRIM(name) IN ('Signature - Island Reverie', '海岛遐想特调', '海岛白日梦') THEN '海岛白日梦'
      ELSE display_name_zh
    END
    WHERE BTRIM(name) IN (
      'Signature - Galleon Echoes',
      '马尼拉远航特调',
      '帆船回响',
      'Signature - Island Reverie',
      '海岛遐想特调',
      '海岛白日梦'
    );
  END IF;
END $$;
