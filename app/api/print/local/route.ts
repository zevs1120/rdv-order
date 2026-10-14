import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requireOrderCreate } from "../../../../lib/permissions";
import { escpos, LAN_IMPLEMENTATION, LAN_PRINTER, LAN_SN, localTicket } from "../../../../lib/printing/lan";
import type { Delivery } from "../../../../lib/printing/records";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Only the original waiter or a manager may handle a local ticket.
const access = `(snapshot->>'localActor' = $2 OR $3 = 'manager')`;
const active = `(kind = 'self_test' OR EXISTS (SELECT 1 FROM table_sessions s
  WHERE s.table_no = print_deliveries.snapshot->>'tableNo' AND s.closed_at IS NULL
  AND s.opened_at <= print_deliveries.created_at))`;
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return NextResponse.json({ error: "暂时无法读取本地打印记录" },
    { status: message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 503, headers });
}
export async function GET(req: Request) {
  try {
    const auth = await requireOrderCreate(req);
    const tableNo = new URL(req.url).searchParams.get("tableNo")?.trim() || null;
    const { rows } = await pool.query<Delivery>(`SELECT * FROM print_deliveries
      WHERE snapshot->>'implementation' = $1 AND ${access} AND ${active}
      AND ($4::text IS NULL OR snapshot->>'tableNo' = $4)
      AND status IN ('queued','sending','unknown') AND created_at > now() - INTERVAL '1 day'
      ORDER BY created_at LIMIT 50`, [LAN_IMPLEMENTATION, auth.userId, auth.role, tableNo]);
    return NextResponse.json({ printer: LAN_PRINTER, jobs: rows.map(job => ({ ...localTicket(job),
      tableNo: (job.snapshot as { tableNo?: string }).tableNo, kind: job.kind })) }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try {
    const auth = await requireOrderCreate(req);
    const body = await req.json().catch(() => null);
    if (!uuid.test(body?.id || "")) return NextResponse.json({ error: "打印编号无效" }, { status: 400 });
    if (body.action === "claim" && body.claimToken != null && !uuid.test(body.claimToken))
      return NextResponse.json({ error: "打印请求编号无效" }, { status: 400 });
    const tx = await pool.connect();
    try {
      await tx.query("BEGIN");
      // Short transaction lock only coordinates two phones claiming different
      // tickets. It is never held while a phone connects or prints.
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [LAN_SN]);
      await tx.query(`UPDATE print_deliveries SET status = 'unknown', updated_at = now(),
        last_error = '本地打印结果未确认，请核对纸张'
        WHERE snapshot->>'implementation' = $1 AND status = 'sending'
        AND sending_started_at < now() - INTERVAL '30 seconds'`, [LAN_IMPLEMENTATION]);
      const { rows: [job] } = await tx.query<Delivery & { lease_token: string | null }>(`SELECT * FROM print_deliveries
        WHERE id = $1 AND ${access} AND snapshot->>'implementation' = $4 FOR UPDATE`,
        [body.id, auth.userId, auth.role, LAN_IMPLEMENTATION]);
      if (!job) { await tx.query("COMMIT"); return NextResponse.json({ error: "打印记录不存在" }, { status: 404 }); }
      if (body.action === "report") {
        if (!uuid.test(body.token || "") || !["accepted", "unknown"].includes(body.status)) throw new Error("Invalid report");
        await tx.query(`UPDATE print_deliveries SET status = $2, updated_at = now(),
          last_error = CASE WHEN $2 = 'unknown' THEN '本地打印结果未确认，请核对纸张' ELSE NULL END
          WHERE id = $1 AND lease_token = $3 AND status IN ('sending','unknown')`, [job.id, body.status, body.token]);
        await tx.query("COMMIT");
        return NextResponse.json({ ok: true }, { headers });
      }
      if (body.action !== "claim") throw new Error("Invalid action");
      // A lost HTTP response may be fetched again only by the same, still-running
      // phone invocation. A later tap/process/phone creates a different token.
      if (job.status === "sending" && body.claimToken && job.lease_token === body.claimToken) {
        await tx.query("COMMIT");
        return NextResponse.json({ granted: true, token: job.lease_token, content: escpos(job.content).toString("base64") }, { headers });
      }
      if (job.status !== "queued") {
        await tx.query("COMMIT");
        return NextResponse.json({ granted: false, status: job.status }, { headers });
      }
      const { rows: busy } = await tx.query(`SELECT id FROM print_deliveries
        WHERE printer_sn = $1 AND status = 'sending' LIMIT 1`, [LAN_SN]);
      if (busy.length) {
        await tx.query("COMMIT");
        return NextResponse.json({ granted: false, status: "busy" }, { headers });
      }
      const content = escpos(job.content).toString("base64");
      const token = body.claimToken || randomUUID();
      const { rows } = await tx.query(`UPDATE print_deliveries SET status = 'sending', attempt_count = 1,
        first_attempt_at = now(), sending_started_at = now(), lease_token = $2, updated_at = now()
        WHERE id = $1 AND status = 'queued' AND attempt_count = 0 AND ${active} RETURNING id`, [job.id, token]);
      await tx.query("COMMIT");
      return NextResponse.json(rows.length ? { granted: true, token, content } : { granted: false, status: "cancelled" }, { headers });
    } catch (error) { await tx.query("ROLLBACK").catch(() => {}); throw error; }
    finally { tx.release(); }
  } catch (error) { return failure(error); }
}
