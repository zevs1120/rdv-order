# RDV UI Map (Before/After)

## Current Route Inventory
- `/` Login
- `/tables` Tables select / open / merge
- `/order` Order flow for selected table
- `/manage` Manage home (module entry)
- `/manage/orders` Order operations and history
- `/manage/income` Revenue report
- `/manage/fees` Fee rules (global auto-apply)
- `/manage/hot` Hot items report
- `/manage/devices` Printer/device health
- `/manage/rbac` Access control
- `/admin/menu` Menu management

## Rebuilt Navigation Structure
- Global top bar (all pages):
  - Network status pill (online/weak/offline)
  - Language switch
  - More menu (refresh/logout)
- Global bottom tabs (fixed):
  - `Tables`
  - `Order` (opens recent table context)
  - `Manage`

## Page Structure (Redesign)

### 1) Tables
- Sticky app bar with title + refresh/select mode
- Filter chips: `All / In Service / Idle`
- 3-column table card board
  - Card info: table no, status badge, guests, duration
- Select mode for merge
  - choose two idle tables
  - sticky merge action bar (guest count + confirm)
- Open idle table via bottom sheet
  - guest stepper
  - confirm open

### 2) Order
- Sticky app bar
  - left: back to tables
  - center: table + guests badge
  - right: `Items` + `More`
- Search field below app bar
- Shift chips row (horizontal)
- Main body:
  - fixed category rail (left)
  - dish list rows (right, tap row = +1)
- Bottom cart dock (fixed/sticky above tab bar)
  - cart summary trigger
  - submit CTA
- Bottom sheets:
  - Sent items / bill
  - Cart editor (qty, note, remove)
  - Add custom dish
  - Note editor
- Toast feedback (add item / submit status)

### 3) Manage
- `/manage` changed to module entry list (mobile-first)
  - compact KPI cards (today orders/revenue)
  - module list rows with short descriptions
- Subpages keep existing business logic; top area normalized with app bar + sticky manage tabs

## Interaction Decisions
- Keep existing backend contracts and business actions unchanged.
- Reduce button wall by moving low-frequency order actions into `More` menu.
- Keep high-frequency actions thumb-reachable:
  - tap dish row
  - open cart
  - submit
- Keep edit-heavy actions in bottom sheets to avoid accidental taps.

## States Coverage
- Loading: skeleton blocks on table board and manage modules
- Empty: reusable empty state blocks on menu/category/cart/bill
- Error: inline muted error message area
- Offline: top banner + status pill

