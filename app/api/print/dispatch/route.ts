import { NextResponse } from "next/server";
import { runPrintWorker } from "../../../../lib/print-worker";
import { requireAuth } from "../../../../lib/api-auth";

function isWorkerAuthorized(req: Request) {
  const expected = process.env.PRINT_WORKER_KEY;
  if (!expected) return false;
  const incoming = req.headers.get("x-print-worker-key") || "";
  return incoming.length > 0 && incoming === expected;
}

export async function POST(req: Request) {
  try {
    if (!isWorkerAuthorized(req)) {
      await requireAuth(req, ["manager"]);
    }

    const body = await req.json().catch(() => ({}));
    const requestedLimit = Number((body as { limit?: unknown })?.limit);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 20)
      : 6;

    const result = await runPrintWorker(limit);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "打印任务执行失败" }, { status: 500 });
  }
}

