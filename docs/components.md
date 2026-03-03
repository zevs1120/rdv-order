# RDV UI Kit & Tokens

## Token System (`/styles/tokens.css`)

### Spacing (8-based)
- `--space-1` 4
- `--space-2` 8
- `--space-3` 12
- `--space-4` 16
- `--space-5` 20
- `--space-6` 24
- `--space-8` 32

### Radius
- `--radius-sm` 10
- `--radius-md` 12
- `--radius-lg` 16

### Typography
- Font family: `Inter + system fallback`
- `--font-title` 22
- `--font-section` 16
- `--font-body` 14
- `--font-caption` 12

### Color Scale
- Gray: `--gray-0 ... --gray-900`
- Brand: `--brand-500`, `--brand-600`
- Semantic: `--success-500`, `--warning-500`, `--danger-500`

### Layout Constants
- `--topbar-h` 52
- `--bottombar-h` 62
- `--tap-min` 44

## UI Components (`/components/ui`)

### Action Components
- `Button` (`primary | secondary | ghost | danger`)
- `IconButton`
- `Chip` (filter/segmented option)

### Navigation / Structure
- `AppBar` (left/title/right + optional subline)
- `TabBar` (horizontal tabs)
- `Card`
- `ListRow`

### Feedback / Overlay
- `Badge` (`neutral | success | warning | danger | brand`)
- `BottomSheet`
- `Modal`
- `Toast` (optional action)
- `Skeleton`
- `EmptyState`

### Inputs
- `TextField`
- `SearchField`

## Styling Contract (`/styles/ui.css`)
- Unified states: normal/active/disabled/focus
- Mobile-first tap targets (`>=44px`)
- Lightweight shadows only (`--shadow-1`, `--shadow-2`)
- White surfaces + neutral borders + single brand accent

## Migration Notes
- Legacy classes are still present for compatibility.
- Reworked primary flows now use UI Kit primitives:
  - Tables
  - Order
  - Manage home + manage headers
- Next incremental migration target:
  - convert remaining settings/forms to pure UI Kit classes and remove legacy button style blocks.
