import { XpyunClient } from "./xpyun-client";
import { writePrintAuditLogSafe } from "./audit";

// Run inside Next after()/the order worker, never in the phone's response path.
// Only query the submitted cloud order; this function can never send a print.
export async function recordPrintConfirmation(
  result: { provider: string; remoteJobId?: string },
  entityType: string,
  entityId: string
) {
  if (result.provider !== "xpyun") return;
  let state: "completed" | "pending" | "unknown" = "unknown";
  if (result.remoteJobId) {
    try {
      const client = XpyunClient.fromEnvironment();
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) await new Promise(resolve => setTimeout(resolve, 5000));
        state = await client.orderState(result.remoteJobId);
        if (state === "completed") break;
      }
    } catch { /* Unavailable confirmation does not invalidate cloud acceptance. */ }
  }
  await writePrintAuditLogSafe({ action: "print.delivery", entityType, entityId,
    detail: { provider: "xpyun", remoteJobId: result.remoteJobId || null, state,
      source: "queryOrderState", physicalPaperVerified: false } });
}
