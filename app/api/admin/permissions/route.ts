import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission, clearPermissionCache } from "../../../../lib/permissions";
import { writeAuditLogSafe } from "../../../../lib/audit";

export async function GET(req: Request) {
  try {
    await requirePermission(req, "rbac.manage");
    const { rows } = await pool.query(
      `SELECT role, permission, allowed
       FROM role_permissions
       ORDER BY role ASC, permission ASC`
    );
    return NextResponse.json({ rows });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "权限列表查询失败" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requirePermission(req, "rbac.manage");
    const body = await req.json().catch(() => null) as {
      role?: unknown;
      permission?: unknown;
      allowed?: unknown;
    } | null;

    const role = String(body?.role || "").trim();
    const permission = String(body?.permission || "").trim();
    const allowed = Boolean(body?.allowed);

    if (!["waiter", "manager"].includes(role) || !permission) {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    await pool.query(
      `INSERT INTO role_permissions (role, permission, allowed, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (role, permission)
       DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = now()`,
      [role, permission, allowed]
    );
    clearPermissionCache();

    await writeAuditLogSafe({
      actorUserId: auth.userId,
      action: "rbac.update",
      entityType: "role_permission",
      entityId: `${role}:${permission}`,
      detail: { role, permission, allowed },
      req
    });

    return NextResponse.json({ ok: true, role, permission, allowed });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "权限更新失败" }, { status: 500 });
  }
}
