# Menu Subcategory

## Data structure

- Major category (top tabs in order page): `breakfast | lunch | dinner | beverage | cocktail | package`
- Subcategory (left sidebar in order page): new table `menu_subcategories`
- Dish relation: existing `menu_items.category` string is kept unchanged (no breaking change)

### Major categories table

`menu_major_categories`

- `key` (top tab key, unique)
- `menu_group` (`breakfast|lunch_dinner|cocktail|set_menu`)
- `label_en`, `label_zh`
- `include_empty_shift_items` (legacy compatibility for lunch/dinner)
- `sort_order`, `is_active`

Migration:

- `db/migrations/021_menu_major_categories.sql`
- seeds default tabs (Breakfast/Lunch/Dinner/Beverage/Cocktail/Package)
- updates `menu_subcategories.shift_key` constraint to support dynamic keys

### New table

`menu_subcategories`

- `id uuid pk`
- `shift_key text` (`breakfast|lunch|dinner|beverage|cocktail|package`)
- `name text` (displayed in order sidebar)
- `name_key text` (normalized lowercase key for unique check)
- `display_name_zh text null` (optional Chinese display name)
- `sort_order int default 1000`
- `is_active boolean default true`
- `created_at`, `updated_at`

Unique rule:

- unique active name per major category: `(shift_key, name_key)` where `is_active = true`

Migration:

- `db/migrations/019_menu_subcategories.sql`
- includes table creation + indexes + one-time seed from existing `menu_items.category`

## API

### `GET /api/admin/menu-subcategories`

- permission: `menu.manage`
- query: optional `shift`
- response:
  - `{ subcategories: [{ id, shift_key, name, display_name_zh, sort_order }] }`

### `POST /api/admin/menu-subcategories`

- permission: `menu.manage` + **manager role only**
- body:
  - `shift` (major category)
  - `name` (required)
  - `displayNameZh` (optional)
  - `sortOrder` (optional)
- response:
  - `{ subcategory: { id, shift_key, name, display_name_zh, sort_order } }`

### `GET /api/admin/menu-categories`

- permission: `menu.manage`
- response:
  - `{ majorCategories: [{ key, menu_group, label_en, label_zh, include_empty_shift_items, sort_order }] }`

### `POST /api/admin/menu-categories`

- permission: `menu.manage` + **manager role only**
- body:
  - `labelEn` (required)
  - `labelZh` (required)
  - `menuGroup` (required)
- response:
  - `{ majorCategory: { key, menu_group, label_en, label_zh, include_empty_shift_items, sort_order } }`

### Delete APIs

- `DELETE /api/admin/menu-subcategories/:id`
  - permission: `menu.manage` + **manager role only**
  - behavior: soft-delete (`is_active=false`)
- `DELETE /api/admin/menu-categories/:key`
  - permission: `menu.manage` + **manager role only**
  - behavior: soft-delete major category, and soft-delete all its subcategories
  - guard: cannot delete the last remaining major category

### Existing order menu API updated

- `GET /api/menu?shift=<shift>`
- now returns:
  - `{ items, subcategories, shift, menuGroup, majorCategories }`
- backward compatible: `items` payload unchanged
- if migration `019` is not applied yet, API gracefully falls back to item-derived categories only

## Validation and error messages

- trim name before save
- empty name rejected
- max length: 60
- duplicate (same major category, case-insensitive, trim-insensitive) rejected
- duplicate message: `Name already exists` / `子类目已存在`

## Manual test

1. Run migration `019_menu_subcategories.sql` and `021_menu_major_categories.sql`.
2. Login as manager -> open `Manage -> Menu`.
3. In **Subcategories** section:
   - switch major category to `Beverage`
   - click `+ Add subcategory`
   - input `Tea` and submit
4. In **Subcategories** section header:
   - click `+ Add main category`
   - create a new major category
   - verify new tab appears in order page top tabs
5. Delete actions:
   - delete one subcategory row
   - delete one major-category row
   - verify deleted entries disappear immediately
5. Confirm:
   - `Tea` appears immediately in subcategory list and briefly highlighted.
   - success toast shown.
6. Go to `Order` page:
   - select shift `Beverage`
   - left sidebar includes `Tea` subcategory.
7. Negative checks:
   - create `tea` again in `Beverage` -> rejected as duplicate.
   - create `Tea` in `Lunch` -> allowed (different major category).
