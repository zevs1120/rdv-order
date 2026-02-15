import { pool } from "./db";

type AuditInput = {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  detail?: Record<string, unknown>;
  req?: Request;
};

export async function writeAuditLog(input: AuditInput) {
  const ip =
    input.req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    input.req?.headers.get("x-real-ip") ||
    null;
  const userAgent = input.req?.headers.get("user-agent") || null;

  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, detail, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.actorUserId || null,
      input.action,
      input.entityType,
      input.entityId,
      JSON.stringify(input.detail || {}),
      ip,
      userAgent
    ]
  );
}

export async function writeAuditLogSafe(input: AuditInput) {
  try {
    await writeAuditLog(input);
  } catch {
    // Audit logging should not block critical order flow.
  }
}
