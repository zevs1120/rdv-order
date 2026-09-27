import { writePrintAuditLogSafe } from "../audit";
import type { XpyunDiagnostic } from "./transport";

// Failures only, using the existing bounded metadata lane. This never changes
// an order or print task and must not prevent its normal recovery.
export async function recordConnectionFailure(method: string, diagnostic: XpyunDiagnostic, jobId?: string) {
  await writePrintAuditLogSafe({
    action: "print.connection_failure", entityType: "print_connection", entityId: jobId || "primary",
    detail: { method, ...diagnostic, region: process.env.VERCEL_REGION || "local",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12), node: process.versions.node }
  });
}
