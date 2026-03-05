-- Remove temporary cocktail category entries from cocktail shift.
-- Keep only: Classic Cocktails / Manila / Island Reverie category groups.
UPDATE menu_items
SET is_active = false
WHERE menu_group = 'cocktail'
  AND (
    lower(trim(name)) IN (
      'classic mojito',
      'aperol glow',
      '经典莫吉托',
      '阿佩罗橙光'
    )
    OR lower(trim(COALESCE(category, ''))) IN ('cocktail', '鸡尾酒')
  );
