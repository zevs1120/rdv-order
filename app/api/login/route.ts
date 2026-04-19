import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { hashPin } from "../../../lib/security";
import { signToken } from "../../../lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = String(body?.username || "").trim();
  const pin = String(body?.pin || "");

  if (!username || !pin) {
    return NextResponse.json({ error: "缺少账号或 PIN" }, { status: 400 });
  }

  const { rows } = await pool.query(
    `SELECT id, role, pin_salt, pin_hash
     FROM users
     WHERE lower(username) = lower($1)
     ORDER BY username ASC
     LIMIT 1`,
    [username]
  );

  if (rows.length === 0) {
    return NextResponse.json({ error: "账号或 PIN 错误" }, { status: 401 });
  }

  const user = rows[0];
  const hashed = hashPin(pin, user.pin_salt);
  if (hashed !== user.pin_hash) {
    return NextResponse.json({ error: "账号或 PIN 错误" }, { status: 401 });
  }

  const token = await signToken({ userId: user.id, role: user.role });
  return NextResponse.json({ token, role: user.role });
}
