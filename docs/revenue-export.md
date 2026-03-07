# Revenue Export (CSV)

## Scope
- UI entry: `/manage/income` (Revenue page)
- API: `GET /api/manage/income/export`
- Permission: `report.finance` (manager)

## Export Range Rules
- Only natural month range is allowed.
- Single month: `fromMonth=YYYY-MM` and `toMonth=YYYY-MM` (same month).
- Multi-month: `fromMonth <= toMonth` (inclusive month range).
- Query window is left-closed/right-open:
  - `rangeStart = startMonth 1st 00:00:00`
  - `rangeEnd = monthAfter(endMonth) 1st 00:00:00`
- Timezone alignment:
  - Client sends `tzOffsetMin` (`Date#getTimezoneOffset()`).
  - Server converts month boundaries using this offset, so export month boundaries align with current mobile UI date logic.

## CSV Columns
- `created_at`
- `table`
- `order_id`
- `subtotal`
- `fees`
- `total`
- `currency`

Notes:
- Currency is `PHP`.
- If no data exists in range, export still succeeds with header-only CSV.
- Exported orders are revenue orders only: status in `paid/closed`, excluding cancelled and merged-child orders.

## Filename
- Single month: `RDV_Revenue_YYYY-MM.csv`
- Month range: `RDV_Revenue_YYYY-MM_to_YYYY-MM.csv`

## UI Flow
1. Go to **Manage → Revenue**.
2. Tap **Export**.
3. In Bottom Sheet choose:
   - **Single month** + one month, or
   - **Month range** + start/end month.
4. Tap **Export CSV**.
5. Success toast shown and file download starts.

## Manual Test Cases
1. Single month export:
   - Select `2026-02`.
   - Confirm API range equals `2026-02-01 00:00:00` to `2026-03-01 00:00:00` (local-month semantics).
2. Month range export:
   - Select `2026-01` to `2026-06`.
   - Confirm API range equals `2026-01-01 00:00:00` to `2026-07-01 00:00:00`.
3. Invalid month range:
   - End month earlier than start month.
   - Export button disabled and error shown.
4. Empty range:
   - Export CSV generated with header only.
5. Mobile verification:
   - iOS Safari and Android Chrome both trigger download successfully.
