import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";

function isValidDeviceKey(req: Request) {
  const expected = process.env.DEVICE_HEARTBEAT_KEY;
  if (!expected) return false;
  const incoming = req.headers.get("x-device-key") || "";
  return incoming.length > 0 && incoming === expected;
}

export async function POST(req: Request) {
  try {
    if (!isValidDeviceKey(req)) {
      return NextResponse.json({ error: "未授权设备" }, { status: 401 });
    }

    const body = await req.json().catch(() => null) as {
      deviceCode?: unknown;
      deviceType?: unknown;
      label?: unknown;
      status?: unknown;
      lastError?: unknown;
      isBackup?: unknown;
    } | null;

    const deviceCode = String(body?.deviceCode || "").trim();
    const deviceType = String(body?.deviceType || "printer").trim();
    const label = String(body?.label || deviceCode || "Device").trim();
    const status = String(body?.status || "online").trim();
    const lastError = String(body?.lastError || "").trim();
    const isBackup = Boolean(body?.isBackup);

    if (!deviceCode) {
      return NextResponse.json({ error: "缺少设备编码" }, { status: 400 });
    }
    if (!["printer", "kds"].includes(deviceType) || !["online", "offline", "degraded"].includes(status)) {
      return NextResponse.json({ error: "设备类型或状态无效" }, { status: 400 });
    }

    await pool.query(
      `INSERT INTO device_status (device_code, device_type, label, status, is_backup, fail_count, last_seen_at, last_error, updated_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $4 = 'online' THEN 0 ELSE 1 END, now(), NULLIF($6, ''), now())
       ON CONFLICT (device_code) DO UPDATE
       SET device_type = EXCLUDED.device_type,
           label = EXCLUDED.label,
           status = EXCLUDED.status,
           is_backup = EXCLUDED.is_backup,
           fail_count = CASE WHEN EXCLUDED.status = 'online' THEN 0 ELSE device_status.fail_count + 1 END,
           last_seen_at = now(),
           last_error = NULLIF(EXCLUDED.last_error, ''),
           updated_at = now()`,
      [deviceCode, deviceType, label, status, isBackup, lastError]
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "设备心跳写入失败" }, { status: 500 });
  }
}
