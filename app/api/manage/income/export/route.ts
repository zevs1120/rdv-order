import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { requirePermission } from "../../../../../lib/permissions";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_TZ_OFFSET = 14 * 60;

type ExportRow = {
  created_at: string;
  table_no: string;
  order_id: string;
  subtotal: number;
  fees: number;
  total: number;
};

function compareMonth(a: string, b: string) {
  return a.localeCompare(b);
}

function parseMonth(month: string) {
  if (!MONTH_RE.test(month)) return null;
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null;
  }
  return { year, monthIndex };
}

function nextMonth(month: string) {
  const parsed = parseMonth(month);
  if (!parsed) return null;
  const d = new Date(Date.UTC(parsed.year, parsed.monthIndex, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function toUtcIsoAtClientMonthStart(month: string, tzOffsetMin: number) {
  const parsed = parseMonth(month);
  if (!parsed) return null;
  // `tzOffsetMin` follows Date#getTimezoneOffset semantics (UTC - local).
  const utcMs = Date.UTC(parsed.year, parsed.monthIndex, 1, 0, 0, 0, 0) + tzOffsetMin * 60_000;
  return new Date(utcMs).toISOString();
}

function formatAtClientOffset(iso: string, tzOffsetMin: number) {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const shifted = new Date(ts - tzOffsetMin * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  const ss = String(shifted.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function csvCell(value: string | number | null | undefined) {
  const raw = value == null ? "" : String(value);
  if (!/[",\n\r]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, "\"\"")}"`;
}

function csvRow(values: Array<string | number | null | undefined>) {
  return values.map(csvCell).join(",");
}

function toFilename(fromMonth: string, toMonth: string) {
  if (fromMonth === toMonth) return `RDV_Revenue_${fromMonth}.csv`;
  return `RDV_Revenue_${fromMonth}_to_${toMonth}.csv`;
}

export async function GET(req: Request) {
  try {
    await requirePermission(req, "report.finance");

    const url = new URL(req.url);
    const fromMonthRaw = String(url.searchParams.get("fromMonth") || "").trim();
    const toMonthRaw = String(url.searchParams.get("toMonth") || "").trim();
    const tzOffsetMinRaw = Number(url.searchParams.get("tzOffsetMin") || 0);
    const tzOffsetMin = Number.isFinite(tzOffsetMinRaw)
      ? Math.max(-MAX_TZ_OFFSET, Math.min(MAX_TZ_OFFSET, Math.round(tzOffsetMinRaw)))
      : 0;

    if (!MONTH_RE.test(fromMonthRaw) || !MONTH_RE.test(toMonthRaw)) {
      return NextResponse.json({ error: "月份格式错误" }, { status: 400 });
    }
    if (compareMonth(fromMonthRaw, toMonthRaw) > 0) {
      return NextResponse.json({ error: "月份范围无效" }, { status: 400 });
    }

    const endMonth = nextMonth(toMonthRaw);
    if (!endMonth) {
      return NextResponse.json({ error: "月份范围无效" }, { status: 400 });
    }

    const rangeFromIso = toUtcIsoAtClientMonthStart(fromMonthRaw, tzOffsetMin);
    const rangeToIso = toUtcIsoAtClientMonthStart(endMonth, tzOffsetMin);
    if (!rangeFromIso || !rangeToIso) {
      return NextResponse.json({ error: "月份范围无效" }, { status: 400 });
    }

    const detail = await pool.query<ExportRow>(
      `WITH item_total AS (
         SELECT oi.order_id,
                COALESCE(SUM(oi.qty * mi.price), 0)::int AS subtotal
         FROM order_items oi
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         GROUP BY oi.order_id
       ),
       charge_total AS (
         SELECT oc.order_id,
                COALESCE(SUM(oc.amount), 0)::int AS fees
         FROM order_charges oc
         GROUP BY oc.order_id
       )
       SELECT o.created_at,
              o.table_no,
              o.id AS order_id,
              COALESCE(it.subtotal, 0)::int AS subtotal,
              COALESCE(ct.fees, 0)::int AS fees,
              (COALESCE(it.subtotal, 0) + COALESCE(ct.fees, 0))::int AS total
       FROM orders o
       LEFT JOIN item_total it ON it.order_id = o.id
       LEFT JOIN charge_total ct ON ct.order_id = o.id
       WHERE o.created_at >= $1
         AND o.created_at < $2
         AND o.status IN ('paid', 'closed')
         AND o.cancelled_at IS NULL
         AND o.merged_into_order_id IS NULL
       ORDER BY o.created_at ASC`,
      [rangeFromIso, rangeToIso]
    );

    const lines: string[] = [
      csvRow(["created_at", "table", "order_id", "subtotal", "fees", "total", "currency"])
    ];

    for (const row of detail.rows) {
      lines.push(
        csvRow([
          formatAtClientOffset(row.created_at, tzOffsetMin),
          row.table_no || "",
          row.order_id || "",
          row.subtotal ?? "",
          row.fees ?? "",
          row.total ?? "",
          "PHP"
        ])
      );
    }

    const csv = `\uFEFF${lines.join("\n")}\n`;
    const filename = toFilename(fromMonthRaw, toMonthRaw);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "导出失败" }, { status: 500 });
  }
}
