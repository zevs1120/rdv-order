import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch("https://download.resortdejavu.cn/release.json", {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error("Release unavailable");
    const release = await response.json();
    if (!/^\d+\.\d+\.\d+$/.test(release.version) ||
        !Number.isSafeInteger(release.versionCode) || release.versionCode < 1 ||
        release.file !== `/releases/rdv-order-${release.version}.apk` ||
        typeof release.notes?.zh !== "string" || typeof release.notes?.en !== "string") {
      throw new Error("Invalid release");
    }
    return NextResponse.json({
      version: release.version, versionCode: release.versionCode, notes: release.notes,
      url: `https://download.resortdejavu.cn${release.file}`
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Version check unavailable" }, { status: 503 });
  }
}
