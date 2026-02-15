import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

export async function GET() {
  const { rows } = await pool.query(
    "SELECT id, name, price, category FROM menu_items WHERE is_active = true ORDER BY sort_order ASC, name ASC"
  );
  return NextResponse.json({ items: rows });
}
