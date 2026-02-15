import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { requireAuth } from "../../../lib/api-auth";
import { lockBaseTables } from "../../../lib/table-lock";

const TABLE_LAYOUT = [
  { tableNo: "A1", column: 1, order: 1 },
  { tableNo: "A2", column: 1, order: 2 },
  { tableNo: "A3", column: 1, order: 3 },
  { tableNo: "B1", column: 2, order: 4 },
  { tableNo: "B2", column: 2, order: 5 },
  { tableNo: "B3", column: 2, order: 6 },
  { tableNo: "C1", column: 3, order: 7 },
  { tableNo: "C2", column: 3, order: 8 },
  { tableNo: "C3", column: 3, order: 9 },
  { tableNo: "C4", column: 3, order: 10 },
  { tableNo: "C5", column: 3, order: 11 }
] as const;

const TABLE_SET = new Set<string>(TABLE_LAYOUT.map((t) => t.tableNo));
const TABLE_ORDER = new Map<string, number>(TABLE_LAYOUT.map((t) => [t.tableNo, t.order]));
const TABLE_COLUMN = new Map<string, number>(TABLE_LAYOUT.map((t) => [t.tableNo, t.column]));

type OpenSessionRow = {
  session_id: string;
  session_table_no: string;
  guest_count: number;
  opened_at: string;
  table_no: string;
};

async function getOpenSessionRows() {
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
      .filter((t): t is string => Boolean(t) && TABLE_SET.has(t));

    const uniqueMapped = Array.from(new Set(mapped));
    const baseTables = uniqueMapped.length > 0
      ? uniqueMapped.sort((a, b) => (TABLE_ORDER.get(a) || 999) - (TABLE_ORDER.get(b) || 999))
      : [sessionRows[0].session_table_no];

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
  const { rows } = await client.query<{ table_no: string }>(
    `SELECT DISTINCT tst.table_no
     FROM table_sessions ts
     JOIN table_session_tables tst ON tst.session_id = ts.id
     WHERE ts.closed_at IS NULL`
  );
  return new Set(rows.map((r) => r.table_no));
}

export async function GET(req: Request) {
  try {
    await requireAuth(req, ["waiter", "manager"]);
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
    const auth = await requireAuth(req, ["waiter", "manager"]);
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

      await client.query(
        `INSERT INTO table_session_tables (session_id, table_no)
         VALUES ($1, $2)`,
        [created.rows[0].id, tableNo]
      );

      await client.query("COMMIT");
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
