# RDV Visual System (Polish Upgrade)

## Scope
- UI-only upgrade (no business logic or workflow changes).
- Mobile-first consistency across Tables / Order / Manage.

## Design Tokens
Defined in `/Users/qiao/Downloads/rdv-order/styles/tokens.css`.

### Spacing (8-based)
- `--space-1/2/3/4/5/6/8` = `4/8/12/16/20/24/32`

### Radius
- `--radius-sm: 10px`
- `--radius-md: 12px`
- `--radius-lg: 16px`

### Typography
- Font family: Inter + system fallback
- Size tiers:
  - title `22`
  - section `16`
  - body `14`
  - caption `12`

### Color
- Brand red preserved for primary CTA and active state.
- Table red/green gradients preserved (business visual language unchanged).
- Neutral gray scale unified for borders/text/background.

### Glass Tokens
- `--glass-blur: 18px`
- `--glass-sat: 1.2`
- `--glass-surface`
- `--glass-border`

Used only on high-level chrome:
- Top bar
- Bottom tab bar shell
- App bar rows
- sheet/cart surfaces

## UI Kit Components
Used from `/Users/qiao/Downloads/rdv-order/components/ui`.

- `AppBar` (glass row style)
- `Button` / `IconButton` (press feedback, loading state)
- `Chip`, `Badge`
- `Card`, `ListRow`
- `BottomSheet` (glass + drag handle + dismiss)
- `Toast` (non-blocking slot, safe-area aware)
- `SearchField`, `TextField`
- `Skeleton`, `EmptyState`

## Interaction Feedback
- Button pressed: subtle scale + highlight.
- BottomSheet: rise animation + drag-to-dismiss from handle.
- Toast: anchored above tab bar, does not block page interactions.

## Consistency Rules
- Tab bar rendered only once globally via AppShell.
- Page-level bottom nav instances are disabled (no duplicate bars).
- Content pages run inside shared shell with unified paddings/borders.
