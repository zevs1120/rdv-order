# UI Map

## Route Inventory
- `/` Login
- `/tables` Table board
- `/order` Order page for active table
- `/manage` Manage module launcher
- `/manage/orders` Orders management
- `/manage/income` Revenue
- `/manage/fees` Fees rules
- `/manage/hot` Hot items
- `/manage/devices` Devices + print health
- `/manage/rbac` Access (RBAC)
- `/admin/menu` Menu management
- Legacy routes still present: `/manage/cashier`, `/manage/ops`, `/summary`

## Global Shell
- Fixed TopBar:
  - network status
  - language toggle
  - more menu (refresh/logout)
- Main content scroll area (page-specific)
- Fixed bottom tabs:
  - `Tables`
  - `More`

## Key Screen Structures

### Tables
- Header appbar + actions
- Table card grid (3 columns)
- Open-table sheet
- Merge action bar (when multi-select mode enabled)

### Order
- Header appbar (Back / table context / Actions)
- Search
- Shift tabs
- Left subcategory rail + right dish list
- Sticky cart bar (Current Order + Submit)
- Sheets:
  - Actions sheet
  - Current order sheet
  - Ordered items/bill sheet
  - Note sheet
  - Add custom dish sheet

### Manage
- Home page: module buttons
- Subpages: own AppBar with `Back`
- No secondary top tab strip inside subpages
