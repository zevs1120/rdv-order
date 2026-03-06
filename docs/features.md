# Features Matrix

## Product Scope
RDV is a mobile-first ordering and table-service system for waiter/manager use.

## Role Matrix

| Capability | Waiter | Manager |
|---|---:|---:|
| Login / language switch | ✅ | ✅ |
| Open table / merge / unmerge / close | ✅ | ✅ |
| Create order | ✅ | ✅ |
| Add note / adjust cart before submit | ✅ | ✅ |
| View table bill + print guest copy | ✅ | ✅ |
| Return ordered item | ✅ | ✅ |
| Cancel order | ❌ | ✅ |
| Add discount/service/tax charge | ❌ | ✅ |
| Delete order | ❌ | ✅ |
| Reverse checkout | ❌ | ✅ |
| View orders list/details | ✅ | ✅ |
| View revenue / hot items / ops | ❌ | ✅ |
| Manage fee rules | ❌ | ✅ |
| Manage devices / print health | ❌ | ✅ |
| Manage RBAC permissions | ❌ | ✅ |
| Manage menu items/categories/subcategories | ❌ | ✅ |

> Actual enforcement is in `role_permissions` and API permission checks.

## Module Features

### 1) Authentication
- Account + PIN login via JWT
- Role-based route access

### 2) Tables
- Fixed table layout board (red=open, green=idle)
- Open table with guest count
- Merge two idle tables
- Unmerge merged table
- Table state includes guests, elapsed time, current bill amount

### 3) Ordering
- Shift tabs (major categories)
- Left subcategory rail + right dish list
- Add item to cart, note editing, quantity controls in cart sheet
- Submit with idempotency + dedupe guard + print job enqueue
- Per-table bill view and guest receipt print trigger

### 4) Order Lifecycle
- Current enforced status path: `submitted -> paid -> closed`
- Supports return item and cancellation with audit traces

### 5) Pricing Rules (Fees)
- Discount/service fee/tax rule definitions
- Enable/disable rules
- Active rules auto-apply to open orders

### 6) Reporting
- Orders query by range and table filter
- Revenue summary by period
- Hot items by sold qty
- Optional ops/cashier endpoints available in codebase

### 7) Menu Management
- CRUD menu items
- Manage major categories (top tabs)
- Manage subcategories (left rail)
- Subcategory uniqueness per major category

### 8) Printing
- Provider: cloud / agent / XPYUN
- Async print queue (`print_jobs`)
- Retries + fail tracking
- Health check + self-test
- Category/keyword route rules for bar channel

### 9) UI System
- Global AppShell (fixed top/bottom bars)
- Safe-area aware mobile layout
- Reusable UI kit components and design tokens
