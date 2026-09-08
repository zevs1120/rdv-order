# Connection recovery — source-only batch, 2026-09-08

> Superseded delivery boundary: user authorized combined verification and release as 1.1.0 on 2026-09-08. See `release-1.1.0.md` for reused/new evidence and current rollout; source-only statements below describe the earlier implementation stage.

User decision: remove the app connectivity indicator globally on web and native. Normal use has no connection UI. A confirmed connectivity failure uses a modal dialog with Retry, concurrent automatic recovery, and automatic dismissal after recovery. No banner under the Header. Printer/device management status remains business information.

## Implemented source behavior

- Removed table-header Online/Offline text and all other app header connection dots, the unused web status component, and indicator-only styles. Table headings are vertically centered; other titles reserve space for their actual tools, without the status dot's padding. No new toolbar actions.
- A single foreground recovery controller per client combines real transport failures with network/lifecycle events. Browser `navigator.onLine` no longer vetoes API requests or order submission. Network-change events are hints that trigger a real, uncached check of the hotel's own origin.
- Added `GET /api/connectivity`, returning `{ "service": "rdv-order" }` with no-store headers, no authentication, no database query and no printing. This confirms origin reachability only; database failures, permission errors, expired login and printing failures retain their own operation handling.
- The probe has a 4.5-second limit. Two failed probes since the last newer HTTP response show one modal. Network events coalesce; automatic probe retries back off through 1/2/5/10/30 seconds. Manual Retry bypasses the backoff but never starts a concurrent probe. Normal successful use has no periodic heartbeat.
- Backgrounding stops scheduled probes and cancels the active probe; foregrounding checks again. Backgrounding for at least 30 seconds also requests safe current-screen reads. Cancelled page requests and superseded failure results do not mark the app offline. A cached web menu does not prove the server is reachable.
- Recovery after a failed probe requests safe page reads. A successful business request does not trigger an extra duplicate page refresh. A slow business endpoint with a reachable probe does not create an endless page-refresh loop.
- Read refreshes defer while relevant actions/loads are busy. Existing read-only tables/reports/devices use current filters. Menu caches avoid unnecessary downloads. The ordering page retains selections and separates menu-load errors from uncertain write errors. Native recovery preserves the current draft and ignores obsolete page/filter results.
- Fee editors only automatically retry an empty initial load. Native loaded menu/fee editors are preserved; the web menu editor defers refresh while dirty or while edit/create sheets are open. This intentionally favors preserving unsaved work over forcing fresh editor data.
- Recovery and its Retry button never submit orders, check out, print, or replay writes. Existing order idempotency/pending-submission behavior remains. Web's implicit write retry default is now zero; explicitly configured per-operation retries remain unchanged. Reconnecting does not by itself confirm an uncertain order or checkout.
- The modal uses Chinese/English app language. Web uses native `<dialog>` for focus containment; Android uses `AlertDialog`. Back/Escape/outside taps do not dismiss a still-disconnected dialog; successful connectivity does. Existing operation messages remain underneath.

## Delivery and verification boundary

No tests, type checks, lint, runtime/UI checks, APK builds, version bump, commit, push or deployment were performed for this work, as explicitly requested. Source reading/diff review only. Other in-progress menu, updater, backend and distribution changes were preserved.

Before the later combined release, perform focused checks for long background/foreground transitions, brief Wi-Fi switching, no network, captive portals/unreachable origin, retry deduplication/backoff, cached-menu isolation, stale callbacks, cancelled requests, preservation of edits/drafts and uncertain write messages, plus both-language small-screen/landscape modal and header layout. Do not claim these checks have passed.

Deploy the additive `/api/connectivity` endpoint with the web/backend batch before distributing an APK that probes it. The endpoint is deliberately a connectivity check, not a full database/printer health claim. Existing published V1.0 APKs remain unchanged until the later release.
