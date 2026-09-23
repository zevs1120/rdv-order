import { NextResponse } from "next/server";
import { queryPrimaryPrinterStatus, printerConfigured } from "../../../../lib/printing/service";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";

function xpyunConfig() {
  const aliasUser = process.env.USERKEY || process.env.XPYUN_USERKEY || process.env.SN ? process.env.USER : "";
  return {
    url: process.env.XPYUN_API_URL || "https://open.xpyun.net/api/openapi/xprinter/print",
    tokenSet: Boolean(
      (process.env.XPYUN_USER || aliasUser)
      && (process.env.XPYUN_USER_KEY || process.env.XPYUN_USERKEY || process.env.USERKEY)
      && (process.env.XPYUN_SN || process.env.SN)
    )
  };
}

function parseList(csv: string | undefined) {
  return String(csv || "").split(",").map((value) => value.trim()).filter(Boolean);
}

export async function GET(req: Request) {
  try {
    await requirePermission(req, "device.view");

    const primaryConfig = xpyunConfig();
    const primaryReady = printerConfigured();
    const workerKeySet = Boolean(process.env.PRINT_WORKER_KEY);
    const heartbeatKeySet = Boolean(process.env.DEVICE_HEARTBEAT_KEY);
    const routeBarCategories = parseList(process.env.PRINT_ROUTE_BAR_CATEGORIES);
    const routeBarKeywords = parseList(process.env.PRINT_ROUTE_BAR_KEYWORDS);

    const [livePrinter, queue] = await Promise.all([
      queryPrimaryPrinterStatus(),
      pool.query<{ pending: number; failed: number }>(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('queued', 'sending', 'accepted'))::int AS pending,
           COUNT(*) FILTER (WHERE status IN ('failed', 'unknown', 'expired'))::int AS failed
         FROM print_deliveries`
      )
    ]);

    const pending = Number(queue.rows[0]?.pending) || 0;
    const failed = Number(queue.rows[0]?.failed) || 0;
    const warnings: string[] = [];
    if (!primaryReady) warnings.push("芯烨云打印配置未完成");
    if (failed > 0) warnings.push(`有 ${failed} 条打印任务需要处理`);

    return NextResponse.json({
      livePrinter,
      provider: { primary: "xpyun", fallback: null },
      config: {
        primary: { ...primaryConfig, ready: primaryReady },
        fallback: null,
        workerKeySet,
        heartbeatKeySet
      },
      queue: { pending, failed },
      checks: { primaryReady, fallbackReady: null, workerKeySet, heartbeatKeySet },
      routes: { barCategories: routeBarCategories, barKeywords: routeBarKeywords },
      ready: primaryReady,
      warnings
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "打印健康检查失败" }, { status: 500 });
  }
}
