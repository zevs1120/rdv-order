# Changelog

All notable changes to this project are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]
### Changed
- Documentation system refactor and governance baseline (README/docs/contributing).

## [2026-03-06]
### Added
- Global mobile AppShell with fixed top bar + fixed tab bar + safe-area layout.
- UI glass tokens and z-index token system for mobile overlays.
- New docs: `docs/ui-shell.md`, `docs/visual-system.md`.
- Manager-only create/delete for menu major categories and subcategories.
- Menu admin API and UI support for subcategory management.

### Changed
- Order submit interaction hardening (loading/error/retry feedback, dedupe guard).
- Toast/BottomSheet interaction behavior for mobile.
- Order page mobile layout rewritten to improve narrow-screen compatibility.
- Bottom navigation architecture switched to global shell rendering.

### Fixed
- Submit flow reliability under weak networks.
- Duplicate submission protection + idempotency behavior.
- Table/bill/order UI overlap issues in multiple mobile breakpoints.

## [2026-03-05]
### Added
- Printing integration for XPYUN cloud printer.
- Guest copy printing support and print health/self-test endpoints.
- Hot items reporting page and API.
- Fee rules management and automatic application to open orders.
- Role-based permission management UI (RBAC).

### Changed
- Manage module reorganized into home + subpages.
- Menu structure aligned with breakfast/lunch/dinner/beverage/cocktail/package.

## [2026-02-15]
### Added
- Initial MVP baseline for login, tables, order, summary, serverless APIs.
