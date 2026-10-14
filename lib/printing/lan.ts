import iconv from "iconv-lite";
import type { Delivery, PrintDb } from "./records";

export const LAN_IMPLEMENTATION = "local-escpos-20261014";
export const LAN_PRINTER = { mac: "00:21:40:ff:2b:95", ip: "192.168.0.108", name: "RDV N260L" };
export const LAN_SN = `lan:${LAN_PRINTER.mac}`;
export const isLocal = (job: Delivery | null | undefined) =>
  (job?.snapshot as { implementation?: string } | undefined)?.implementation === LAN_IMPLEMENTATION;
export function localTicket(job: Delivery | null | undefined) {
  return job && isLocal(job) ? { id: job.id, status: job.status, mac: LAN_PRINTER.mac } : undefined;
}
export async function orderLocalTicket(db: PrintDb, orderId: string) {
  const { rows } = await db.query<Delivery>("SELECT * FROM print_deliveries WHERE kind = 'order' AND order_id = $1", [orderId]);
  return localTicket(rows[0]);
}

// Translate the existing ticket template, so names, totals, spacing and notes
// have one source. Only our generated markup is accepted as printer commands.
export function escpos(content: string): Buffer {
  const bytes: Buffer[] = [Buffer.from([0x1b, 0x40, 0x1b, 0x4d, 0, 0x1c, 0x26])];
  const stack: string[] = [];
  const style = () => {
    const tag = [...stack].reverse().find(t => ["CB", "B", "N", "HB", "WB", "B2", "HB2", "WB2"].includes(t)) || "N";
    const size: Record<string, number> = { N: 0, B: 0x11, CB: 0x11, HB: 1, WB: 0x10, B2: 0x22, HB2: 2, WB2: 0x20 };
    bytes.push(Buffer.from([0x1b, 0x61, stack.some(t => t === "C" || t === "CB") ? 1 : 0,
      0x1d, 0x21, size[tag], 0x1b, 0x45, stack.includes("BOLD") ? 1 : 0]));
  };
  for (const token of content.split(/(<\/?[A-Z0-9]+>)/).filter(Boolean)) {
    if (token === "<BR>") { bytes.push(Buffer.from([10])); continue; }
    if (token.startsWith("<")) {
      const tag = token.replace(/[<>/]/g, "");
      if (!["C", "CB", "B", "N", "HB", "WB", "B2", "HB2", "WB2", "BOLD"].includes(tag)) throw new Error("Unsupported ticket format");
      if (token.startsWith("</")) {
        if (stack.pop() !== tag) throw new Error("Invalid ticket format");
      } else stack.push(tag);
      style();
    } else bytes.push(iconv.encode(token.replace(/[\x00-\x1f\x7f]/g, " "), "gb18030"));
  }
  if (stack.length) throw new Error("Invalid ticket format");
  bytes.push(Buffer.from([0x1d, 0x56, 0x42, 0])); // Feed to cutter, partial cut.
  return Buffer.concat(bytes);
}
