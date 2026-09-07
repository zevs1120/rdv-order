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

The independent download page is a single-screen team app selector. Use the hotel's real RDV wordmark (optimized locally from `rdv-website/public/rdv-logo.png`), warm cream `#f4ecdf`, deep green `#21483d`, and system serif typography. The lightly raised top bar and segmented capsule borrow the restrained surface treatment of the Taboo website; only hover transitions remain, respecting reduced motion.

Show only the brand bar, Ordering app / Staff app tabs, app icon/name, download button and release metadata. The staff panel is an unpublished placeholder labelled “制作中 / In the making” with no download link. Per the user's explicit direction, omit feature introductions, account/PIN/backend explanations, platform disclaimers and installation steps. English/Chinese switching preserves the selected app. Arrow keys, Home and End operate tabs with a single tab stop and associated hidden panels. Allow zoom or unusually short screens to scroll rather than clipping controls; ordinary desktop and portrait mobile layouts fit one screen. Backend, APK and native screens are unchanged.
