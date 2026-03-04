import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { requirePermission } from "../../../lib/permissions";
import { writeAuditLogSafe } from "../../../lib/audit";
import { lockBaseTables } from "../../../lib/table-lock";

const TABLE_LAYOUT = [
  { tableNo: "01", column: 1, order: 1 },
  { tableNo: "02", column: 1, order: 2 },
  { tableNo: "03", column: 1, order: 3 },
  { tableNo: "04", column: 2, order: 4 },
  { tableNo: "05", column: 2, order: 5 },
  { tableNo: "06", column: 2, order: 6 },
  { tableNo: "07", column: 3, order: 7 },
  { tableNo: "08", column: 3, order: 8 },
  { tableNo: "09", column: 3, order: 9 },
  { tableNo: "10", column: 3, order: 10 },
  { tableNo: "11", column: 3, order: 11 }
] as const;

const TABLE_SET = new Set<string>(TABLE_LAYOUT.map((t) => t.tableNo));
const TABLE_ORDER = new Map<string, number>(TABLE_LAYOUT.map((t) => [t.tableNo, t.order]));
const TABLE_COLUMN = new Map<string, number>(TABLE_LAYOUT.map((t) => [t.tableNo, t.column]));

type OpenSessionRow = {
  session_id: string;
  session_table_no: string;
  guest_count: number;
  opened_at: string;
  table_no: string | null;
};

function splitTableNo(raw: string) {
  return raw
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
}

function isMissingTableSessionTablesError(err: any) {
  return err?.code === "42P01" && String(err?.message || "").includes("table_session_tables");
}

async function getOpenSessionRows() {
  try {
    const { rows } = await pool.query<OpenSessionRow>(
      `SELECT ts.id AS session_id,
              ts.table_no AS session_table_no,
              ts.guest_count,
              ts.opened_at,
              tst.table_no
       FROM table_sessions ts
       LEFT JOIN table_session_tables tst ON tst.session_id = ts.id
       WHERE ts.closed_at IS NULL
       ORDER BY ts.opened_at ASC`
    );
    return rows;
  } catch (err: any) {
    if (!isMissingTableSessionTablesError(err)) {
      throw err;
    }

    const fallback = await pool.query<OpenSessionRow>(
      `SELECT ts.id AS session_id,
              ts.table_no AS session_table_no,
              ts.guest_count,
              ts.opened_at,
              NULL::text AS table_no
       FROM table_sessions ts
       WHERE ts.closed_at IS NULL
       ORDER BY ts.opened_at ASC`
    );
    return fallback.rows;
  }
}

function buildTables(rows: OpenSessionRow[]) {
  const group = new Map<string, OpenSessionRow[]>();
  for (const row of rows) {
    if (!group.has(row.session_id)) group.set(row.session_id, []);
    group.get(row.session_id)!.push(row);
  }

  const hiddenTables = new Set<string>();
  const openDisplays: Array<{
    tableNo: string;
    baseTables: string[];
    column: number;
    status: "open";
    guestCount: number;
    openedAt: string;
  }> = [];

  for (const sessionRows of group.values()) {
    const mapped = sessionRows
      .map((r) => r.table_no)
      .filter((t): t is string => Boolean(t))
      .flatMap((t) => splitTableNo(t))
      .filter((t) => TABLE_SET.has(t));

    const fallbackFromSessionName = splitTableNo(sessionRows[0].session_table_no)
      .filter((t) => TABLE_SET.has(t));

    const uniqueMapped = Array.from(new Set(mapped));
    const baseTables = uniqueMapped.length > 0
      ? uniqueMapped.sort((a, b) => (TABLE_ORDER.get(a) || 999) - (TABLE_ORDER.get(b) || 999))
      : fallbackFromSessionName;

    if (baseTables.length === 0) {
      continue;
    }

    const displayName = baseTables.join("+");
    const primary = baseTables[0];

    for (let i = 1; i < baseTables.length; i += 1) {
      hiddenTables.add(baseTables[i]);
    }

    openDisplays.push({
      tableNo: displayName,
      baseTables,
      column: TABLE_COLUMN.get(primary) || 1,
      status: "open",
      guestCount: sessionRows[0].guest_count,
      openedAt: sessionRows[0].opened_at
    });
  }

  const openByPrimary = new Map<string, (typeof openDisplays)[number]>();
  for (const item of openDisplays) {
    openByPrimary.set(item.baseTables[0], item);
  }

  const tables = TABLE_LAYOUT
    .filter((base) => !hiddenTables.has(base.tableNo))
    .map((base) => {
      const open = openByPrimary.get(base.tableNo);
      if (open) {
        return {
          tableNo: open.tableNo,
          baseTables: open.baseTables,
          column: open.column,
          status: "open" as const,
          guestCount: open.guestCount,
          openedAt: open.openedAt
        };
      }
      return {
        tableNo: base.tableNo,
        baseTables: [base.tableNo],
        column: base.column,
        status: "idle" as const,
        guestCount: null,
        openedAt: null
      };
    });

  return tables;
}

async function getUsedBaseTables(client: Awaited<ReturnType<typeof pool.connect>>) {
  try {
    const { rows } = await client.query<{ table_no: string }>(
      `SELECT DISTINCT tst.table_no
       FROM table_sessions ts
       JOIN table_session_tables tst ON tst.session_id = ts.id
       WHERE ts.closed_at IS NULL`
    );
    return new Set(rows.map((r) => r.table_no));
  } catch (err: any) {
    if (!isMissingTableSessionTablesError(err)) {
      throw err;
    }

    const fallback = await client.query<{ table_no: string }>(
      `SELECT table_no
       FROM table_sessions
       WHERE closed_at IS NULL`
    );
    const used = new Set<string>();
    for (const row of fallback.rows) {
      for (const part of splitTableNo(row.table_no)) {
        if (TABLE_SET.has(part)) {
          used.add(part);
        }
      }
    }
    return used;
  }
}

export async function GET(req: Request) {
  try {
    await requirePermission(req, "order.create");
    const rows = await getOpenSessionRows();
    const tables = buildTables(rows);

    return NextResponse.json({
      barLabel: "吧台（BAR）",
      tables
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "查询桌台失败" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requirePermission(req, "order.create");
    const body = await req.json().catch(() => null);
    const tableNo = String(body?.tableNo || "").trim();
    const guestCount = Number(body?.guestCount);

    if (!TABLE_SET.has(tableNo) || !Number.isInteger(guestCount) || guestCount <= 0) {
      return NextResponse.json({ error: "桌号或人数无效" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockBaseTables(client, [tableNo]);

      const used = await getUsedBaseTables(client);
      if (used.has(tableNo)) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "该桌已开台" }, { status: 409 });
      }

      const created = await client.query(
        `INSERT INTO table_sessions (table_no, guest_count, opened_by)
         VALUES ($1, $2, $3)
         RETURNING id, table_no, guest_count, opened_at`,
        [tableNo, guestCount, auth.userId]
      );

      try {
        await client.query(
          `INSERT INTO table_session_tables (session_id, table_no)
           VALUES ($1, $2)`,
          [created.rows[0].id, tableNo]
        );
      } catch (err: any) {
        if (!isMissingTableSessionTablesError(err)) {
          throw err;
        }
      }

      await client.query("COMMIT");
      await writeAuditLogSafe({
        actorUserId: auth.userId,
        action: "table.open",
        entityType: "table_session",
        entityId: created.rows[0].id,
        detail: { tableNo: created.rows[0].table_no, guestCount: created.rows[0].guest_count },
        req
      });
      return NextResponse.json({
        session: {
          id: created.rows[0].id,
          tableNo: created.rows[0].table_no,
          guestCount: created.rows[0].guest_count,
          openedAt: created.rows[0].opened_at
        }
      }, { status: 201 });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "开台失败" }, { status: 500 });
  }
}
