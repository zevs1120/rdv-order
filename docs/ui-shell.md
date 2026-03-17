# RDV App Shell (Mobile-First)

## Goal
- Keep all existing business logic unchanged.
- Unify global layout so mobile behaves like a native app:
  - fixed top bar
  - scrollable content area
  - fixed bottom tab bar
  - safe-area aware on iOS/Android

## Shell Structure
```tsx
<AppShell>
  <TopBar />
  <div className="app-shell-main">
    <main className="app-main">{children}</main>
  </div>
  <BottomNav />
</AppShell>
```

## Fixed Region Rules
- Top bar:
  - fixed at viewport top
  - `height: var(--topbar-h) + env(safe-area-inset-top)`
  - subpages use the global top bar for:
    - back action on the left
    - centered page title
    - globe language toggle on the right
    - online/offline status dot on the right
  - the global top bar no longer shows a secondary `More` action
- Tab bar:
  - fixed at viewport bottom
  - always rendered by AppShell only (page-level duplicates disabled)
  - includes `env(safe-area-inset-bottom)` to avoid iPhone home indicator overlap
- Main content:
  - fixed between top and bottom bars
  - only this region scrolls (`overflow-y: auto`)

## Safe Area + Viewport Strategy
- Use `100dvh` as primary viewport height.
- Keep `100svh` fallback.
- Use CSS env variables:
  - `env(safe-area-inset-top)`
  - `env(safe-area-inset-bottom)`
  - `env(safe-area-inset-left/right)`
- App offsets:
  - `--shell-top-offset = topbar + safe-top`
  - `--shell-bottom-offset = tabbar + safe-bottom`

## Z-Index Tokens
- `--z-base: 0`
- `--z-appbar: 50`
- `--z-tabbar: 50`
- `--z-actionbar: 60`
- `--z-sheet: 100`
- `--z-toast: 120`
- `--z-overlay-blocking: 200`

Applied to:
- TopBar / TabBar fixed layers
- submit/cart dock and sticky action bars
- BottomSheet/Modal
- Toast

## Toast/Undo Placement
- Toast uses a dedicated fixed slot above tab bar:
  - `bottom: calc(var(--bottombar-h) + env(safe-area-inset-bottom) + 12px)`
- Slot is non-blocking:
  - wrapper `pointer-events: none`
  - toast body/buttons `pointer-events: auto`
- Prevents toast from covering or disabling tab bar taps.

## Validation (manual)
1. iOS Safari / Android Chrome:
   - confirm tab bar is flush to bottom (no white gap)
   - confirm top bar and tab bar stay fixed while content scrolls
2. Order flow:
   - `Tables -> Order -> Add dish -> Submit -> Back`
3. Overlay stack:
   - open BottomSheet + show Toast
   - verify no overlap with tab bar and no blocked navigation taps
