import { NextResponse } from "next/server";
import { dispatchPrintSelfTest } from "../../../../lib/print";
import { requirePermission } from "../../../../lib/permissions";

type SelfTestTarget = "kitchen" | "bar" | "both";

function parseTarget(value: unknown): SelfTestTarget {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "kitchen" || raw === "bar") return raw;
  return "both";
}

export async function POST(req: Request) {
  try {
    await requirePermission(req, "device.manage");
    const body = await req.json().catch(() => null) as { target?: unknown } | null;
    const target = parseTarget(body?.target);
    const result = await dispatchPrintSelfTest(target);
    return NextResponse.json({ ok: true, target, ...result });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "打印自检失败" }, { status: 500 });
  }
}

