import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { requirePermission } from "../../../../lib/permissions";

type Provider = "cloud" | "agent";

function parseProvider(raw: string | undefined, fallback: Provider): Provider {
  const value = String(raw || "").toLowerCase();
  if (value === "agent") return "agent";
  if (value === "cloud") return "cloud";
  return fallback;
}

function configFor(provider: Provider) {
  if (provider === "cloud") {
    return {
      url: process.env.PRINT_CLOUD_URL || "",
      tokenSet: Boolean(process.env.PRINT_CLOUD_API_KEY)
    };
  }
  return {
    url: process.env.PRINT_AGENT_URL || "",
    tokenSet: Boolean(process.env.PRINT_AGENT_TOKEN)
  };
}

export async function GET(req: Request) {
  try {
    await requirePermission(req, "device.view");

    const primary = parseProvider(process.env.PRINT_PROVIDER, "cloud");
    const fallback = parseProvider(process.env.PRINT_FALLBACK_PROVIDER, primary);
    const hasFallback = fallback !== primary && Boolean(process.env.PRINT_FALLBACK_PROVIDER);

    const primaryConfig = configFor(primary);
    const fallbackConfig = hasFallback ? configFor(fallback) : null;

    const queue = await pool.query<{ pending: number; failed: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('pending', 'printing'))::int AS pending,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
       FROM print_jobs`
    );

    return NextResponse.json({
      provider: {
        primary,
        fallback: hasFallback ? fallback : null
      },
      config: {
        primary: {
          ...primaryConfig,
          ready: Boolean(primaryConfig.url && primaryConfig.tokenSet)
        },
        fallback: fallbackConfig
          ? {
              ...fallbackConfig,
              ready: Boolean(fallbackConfig.url && fallbackConfig.tokenSet)
            }
          : null,
        workerKeySet: Boolean(process.env.PRINT_WORKER_KEY),
        heartbeatKeySet: Boolean(process.env.DEVICE_HEARTBEAT_KEY)
      },
      queue: {
        pending: queue.rows[0]?.pending || 0,
        failed: queue.rows[0]?.failed || 0
      }
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") return NextResponse.json({ error: "未登录" }, { status: 401 });
    if (err.message === "FORBIDDEN") return NextResponse.json({ error: "无权限" }, { status: 403 });
    return NextResponse.json({ error: "打印健康检查失败" }, { status: 500 });
  }
}

