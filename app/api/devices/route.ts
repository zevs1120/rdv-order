import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { requirePermission } from "../../../lib/permissions";
import { writeAuditLogSafe } from "../../../lib/audit";

export async function GET(req: Request) {
  try {
    await requirePermission(req, "device.view");

    const [devices, jobs] = await Promise.all([
      pool.query(
        `SELECT id, device_code, device_type, label, status, is_backup, fail_count, last_seen_at, last_error, updated_at
         FROM device_status
         ORDER BY device_type ASC, is_backup ASC, device_code ASC`
      ),
      pool.query<{ pending: number; failed: number }>(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('pending', 'printing'))::int AS pending,
           COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
         FROM print_jobs`
      )
    ]);

    const failThreshold = Math.max(1, Number(process.env.PRINT_ALERT_FAIL_COUNT || 3) || 3);
    const queueFailedThreshold = Math.max(1, Number(process.env.PRINT_ALERT_QUEUE_FAILED || 3) || 3);

    const alerts: Array<{
      level: "warning" | "critical";
      code: string;
      message: string;
    }> = [];
    for (const device of devices.rows as Array<{ device_code: string; fail_count: number; status: string; is_backup: boolean }>) {
      if ((device.fail_count || 0) >= failThreshold) {
        alerts.push({
          level: device.status === "offline" ? "critical" : "warning",
          code: "device_fail_count_high",
          message: `${device.device_code} 连续失败 ${device.fail_count} 次`
        });
      }
    }
    const queueFailed = jobs.rows[0]?.failed || 0;
    if (queueFailed >= queueFailedThreshold) {
      alerts.push({
        level: "critical",
        code: "print_queue_failed_high",
        message: `打印失败队列 ${queueFailed}，建议切换备用打印通道`
      });
    }

    return NextResponse.json({
      devices: devices.rows,
      printQueue: {
        pending: jobs.rows[0]?.pending || 0,
        failed: jobs.rows[0]?.failed || 0
      },
      alerts
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "设备状态查询失败" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requirePermission(req, "device.manage");
    const body = await req.json().catch(() => null) as {
      deviceCode?: unknown;
      status?: unknown;
      label?: unknown;
      lastError?: unknown;
    } | null;

    const deviceCode = String(body?.deviceCode || "").trim();
    const status = String(body?.status || "").trim();
    const label = String(body?.label || "").trim();
    const lastError = String(body?.lastError || "").trim();

    if (!deviceCode || !["online", "offline", "degraded"].includes(status)) {
      return NextResponse.json({ error: "参数无效" }, { status: 400 });
    }

    const { rows } = await pool.query<{ id: string; device_code: string; status: string }>(
      `UPDATE device_status
       SET status = $2,
           label = COALESCE(NULLIF($3, ''), label),
           last_error = NULLIF($4, ''),
           updated_at = now(),
           last_seen_at = CASE WHEN $2 = 'online' THEN now() ELSE last_seen_at END
       WHERE device_code = $1
       RETURNING id, device_code, status`,
      [deviceCode, status, label, lastError]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "设备不存在" }, { status: 404 });
    }

    await writeAuditLogSafe({
      actorUserId: auth.userId,
      action: "device.update",
      entityType: "device",
      entityId: rows[0].id,
      detail: { deviceCode, status, label, lastError },
      req
    });

    return NextResponse.json({ ok: true, deviceCode: rows[0].device_code, status: rows[0].status });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "设备状态更新失败" }, { status: 500 });
  }
}
