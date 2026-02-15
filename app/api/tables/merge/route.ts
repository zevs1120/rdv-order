import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";
import { lockBaseTables } from "../../../../lib/table-lock";

const TABLES = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3", "C4", "C5"];
const TABLE_SET = new Set(TABLES);

async function getUsedTables(client: Awaited<ReturnType<typeof pool.connect>>) {
  const { rows } = await client.query<{ table_no: string }>(
    `SELECT DISTINCT tst.table_no
     FROM table_sessions ts
     JOIN table_session_tables tst ON tst.session_id = ts.id
     WHERE ts.closed_at IS NULL`
  );
  return new Set(rows.map((r) => r.table_no));
}

export async function POST(req: Request) {
  try {
    const auth = await requirePermission(req, "order.create");
    const body = await req.json().catch(() => null);

    const primaryTable = String(body?.primaryTable || "").trim();
    const secondaryTable = String(body?.secondaryTable || "").trim();
    const guestCount = Number(body?.guestCount);

    if (!TABLE_SET.has(primaryTable) || !TABLE_SET.has(secondaryTable) || primaryTable === secondaryTable) {
      return NextResponse.json({ error: "拼桌桌号无效" }, { status: 400 });
    }
    if (!Number.isInteger(guestCount) || guestCount <= 0) {
      return NextResponse.json({ error: "人数无效" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await lockBaseTables(client, [primaryTable, secondaryTable]);
      const used = await getUsedTables(client);
      if (used.has(primaryTable) || used.has(secondaryTable)) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "有桌台已开台，无法拼桌" }, { status: 409 });
      }

      const mergedName = `${primaryTable}+${secondaryTable}`;
      const created = await client.query(
        `INSERT INTO table_sessions (table_no, guest_count, opened_by)
         VALUES ($1, $2, $3)
         RETURNING id, table_no, guest_count, opened_at`,
        [mergedName, guestCount, auth.userId]
      );

      await client.query(
        `INSERT INTO table_session_tables (session_id, table_no)
         VALUES ($1, $2), ($1, $3)`,
        [created.rows[0].id, primaryTable, secondaryTable]
      );

      await client.query("COMMIT");
      await writeAuditLogSafe({
        actorUserId: auth.userId,
        action: "table.merge",
        entityType: "table_session",
        entityId: created.rows[0].id,
        detail: { primaryTable, secondaryTable, mergedName, guestCount },
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
    return NextResponse.json({ error: "拼桌失败" }, { status: 500 });
  }
}
