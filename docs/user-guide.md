# User Guide

## 1. Login
1. Open app URL.
2. Enter username and PIN.
3. Waiter lands on `/tables`; manager can access `/manage` modules.

## 2. Waiter Daily Flow

### Open Table
1. Go to `Tables`.
2. Tap an idle (green) table.
3. Select guest count and confirm open.

### Take Order
1. App enters `Order` for selected table.
2. Select shift tab (Breakfast/Lunch/Dinner/Beverage/Cocktail/Package).
3. Select left subcategory.
4. Tap `Add +` on dishes.
5. Open `Current Order` to edit qty/note/remove.
6. Tap `Submit Order`.

### Review / Print / Checkout
1. Open `Actions` -> `Items` to review current ordered items.
2. Tap `Print Receipt` to print guest copy (manual trigger).
3. Tap `Checkout + Close` to complete payment and close table.

### Return Dish (if ordered by mistake)
1. Open ordered items panel.
2. In order details, use `Return` on a dish line.
3. Enter return qty.
4. Bill amount and quantities recalculate.

## 3. Manager Daily Flow

### Orders
- `More -> Orders`
- Filter by date range / table.
- View details, cancel, apply charges, reverse checkout (if permitted).

### Revenue
- `More -> Revenue`
- Use quick range or custom dates.

### Fees
- `More -> Fees`
- Add/edit rule (`discount|service_fee|tax`, `percent|amount`, value).
- Toggle active/inactive.
- Save to apply globally to open orders.

### Hot Items
- `More -> Hot Items`
- Check sold quantity by period.

### Devices
- `More -> Devices`
- Check print queue and device states.
- Run print self-test and dispatch retry.

### Access (RBAC)
- `More -> Access`
- Toggle permissions per role.

### Menu
- `More -> Menu`
- Manage items, major categories, subcategories.

## 4. Notes
- If network is unstable/offline, app shows top status indication.
- For complete outage, use handwritten fallback process and reconcile later.

打印连接异常：新版打印账单会等待云端接收结果。提示结果未确认时，先检查是否已经出纸，不要连续重复点击。设备页“云端实时状态”反映查询时的设备连接；“记录状态”是历史请求结果。云端离线时检查打印机供电和联网；查询不可用不等于打印机离线。重试队列每次处理一笔；结果未知且已停止自动重试的任务需要人工核对，不能靠反复点击恢复。
