-- Apply before the menu refresh. Freeze the prices visible at migration time.
-- Historical prices before this snapshot cannot be reconstructed from this schema.
BEGIN;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS code integer UNIQUE;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS option_groups jsonb NOT NULL DEFAULT '[]';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_complimentary boolean NOT NULL DEFAULT false;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price integer;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS choices jsonb NOT NULL DEFAULT '{}';
UPDATE order_items oi SET unit_price = mi.price FROM menu_items mi
WHERE mi.id = oi.menu_item_id AND oi.unit_price IS NULL;

CREATE SEQUENCE IF NOT EXISTS menu_code_seq START 1;
SELECT setval('menu_code_seq', GREATEST(COALESCE((SELECT MAX(code) FROM menu_items),0)+1,
  (SELECT CASE WHEN is_called THEN last_value+1 ELSE last_value END FROM menu_code_seq)), false);
DO $$ DECLARE dish record; BEGIN
  FOR dish IN SELECT id FROM menu_items WHERE is_active AND NOT is_temporary AND code IS NULL
    ORDER BY CASE menu_group WHEN 'breakfast' THEN 1 WHEN 'lunch_dinner' THEN 2 WHEN 'cocktail' THEN 3 ELSE 4 END,
      sort_order, name, id
  LOOP
    UPDATE menu_items SET code = nextval('menu_code_seq') WHERE id = dish.id;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION assign_menu_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS NULL AND NEW.is_active AND NOT NEW.is_temporary THEN
    NEW.code := nextval('menu_code_seq');
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.code IS NOT NULL AND NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'MENU_CODE_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS menu_code_assignment ON menu_items;
CREATE TRIGGER menu_code_assignment BEFORE INSERT OR UPDATE ON menu_items
FOR EACH ROW EXECUTE FUNCTION assign_menu_code();

-- One mandatory selection per group. Prices and printable labels come only
-- from the server's catalog. Split/merge explicitly copy the saved price/note.
CREATE OR REPLACE FUNCTION snapshot_order_item() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  dish menu_items%ROWTYPE;
  grp jsonb;
  opt jsonb;
  labels text[] := '{}';
BEGIN
  IF NEW.unit_price IS NOT NULL THEN RETURN NEW; END IF;
  SELECT * INTO STRICT dish FROM menu_items WHERE id = NEW.menu_item_id;
  NEW.unit_price := dish.price;
  IF jsonb_typeof(NEW.choices) <> 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(NEW.choices)) <> jsonb_array_length(dish.option_groups) THEN
    RAISE EXCEPTION 'INVALID_CHOICES';
  END IF;
  FOR grp IN SELECT value FROM jsonb_array_elements(dish.option_groups) LOOP
    SELECT value INTO opt FROM jsonb_array_elements(grp->'options')
      WHERE value->>'id' = NEW.choices->>(grp->>'id');
    IF opt IS NULL THEN RAISE EXCEPTION 'INVALID_CHOICES'; END IF;
    NEW.unit_price := NEW.unit_price + COALESCE((opt->>'price_delta')::integer, 0);
    labels := array_append(labels, (grp->>'label_en') || ': ' || (opt->>'label_en'));
  END LOOP;
  IF dish.is_complimentary THEN NEW.unit_price := 0; END IF;
  NEW.note := NULLIF(concat_ws('; ', NULLIF(array_to_string(labels, '; '), ''), NULLIF(NEW.note, '')), '');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_item_snapshot ON order_items;
CREATE TRIGGER order_item_snapshot BEFORE INSERT ON order_items
FOR EACH ROW EXECUTE FUNCTION snapshot_order_item();
COMMIT;
