# Design Guidelines

## Native Android

Compose uses the existing brand/background/text colors, rounded bordered cards, centered global titles, the three physical table columns, left menu categories and fixed bottom actions. System safe areas, keyboard and back behavior are native adaptations. Components are in `android/app/src/main/java/com/rdv/order/ui/Components.kt`; shared translations are generated from web sources. Do not replace these screens with a stock Material navigation redesign. See `android-acceptance.md` for the remaining visual comparisons on actual devices.

## Principles
1. Mobile-first, one-hand operation.
2. Keep business flow fast (open table -> add dish -> submit).
3. Visual style: restrained iOS-like glass, high readability.
4. No business behavior inside style-only changes.

## Layout Rules
- Global AppShell only:
  - fixed TopBar
  - scrollable content region
  - fixed bottom TabBar
- Respect safe areas (`env(safe-area-inset-*)`).
- Avoid duplicate nav/action bars in page content.

## Spacing & Sizing
- 8px scale for spacing.
- Minimum touch target: 44px.
- Button heights should not drop below 44px on mobile.

## Visual Tokens
Source: `styles/tokens.css`.

- Radius: 12/16
- Shadows: very light
- Glass:
  - `--glass-blur`
  - `--glass-sat`
  - `--glass-surface`
  - `--glass-border`
- Brand accent: deep red for primary CTA
- Table semantic colors preserved:
  - green = idle
  - red = in service

## Component Rules
Source: `components/ui/*` + `styles/ui.css`.

- `Button`
  - `primary`: key action (submit/save)
  - `secondary`: regular action
  - `ghost`: low-priority text/icon action
- `BottomSheet`
  - use for mobile action groups and form tasks
  - supports backdrop close + drag dismiss
- `Toast`
  - anchored above tab bar
  - must not block tab bar touches
- `AppBar`
  - title + optional left/right actions + subline

## State Feedback
- Pressed: subtle scale/brightness change
- Loading: spinner + disabled guard
- Error: clear inline message or toast
- Success: lightweight toast

## Do / Don't
### Do
- Keep primary action obvious.
- Keep control density moderate.
- Keep text and amounts readable first.

### Don't
- Don't add floating dropdowns that overlap core ordering region.
- Don't use heavy shadows or saturated gradients outside required table status blocks.
- Don't add extra overlays if existing BottomSheet can solve the interaction.

## APK download page (2026-09-07)

The independent static download page reuses the RDV icon and cream/red palette. Its primary action is the Android APK download, followed by three installation steps. A language toggle supports English/Chinese, the viewport permits zoom, and small screens use a single column with the download button visible before scrolling. Existing ordering screens are unchanged.
