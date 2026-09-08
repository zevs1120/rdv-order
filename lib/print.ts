import { createHash } from "crypto";
import { pool } from "./db";
import { localizeMenuText } from "./menu-text";
import { formatItemQtyDisplay } from "./qty-display";

export type PrintProvider = "cloud" | "agent" | "xpyun";
type PrintTarget = "kitchen" | "bar";

type DispatchResult = {
  provider: PrintProvider;
  slot: "primary" | "backup";
  remoteJobId?: string;
};

type OrderPrintRow = {
  order_id: string;
  table_no: string;
  created_at: string;
  waiter_name: string | null;
  dish_name: string;
  unit_price: number;
  qty: number;
  category: string | null;
  note: string | null;
};

type PrintItem = {
  name: string;
  unitPrice?: number;
  qty: number;
  category: string | null;
  note: string | null;
  target: PrintTarget;
};

type PrintTicket = {
  target: PrintTarget;
  items: PrintItem[];
};

type OrderPrintPayload = {
  type: "order";
  printVersion: number;
  tableNo: string;
  createdAt: string;
  waiter: string | null;
  items: PrintItem[];
  tickets: PrintTicket[];
};

type SelfTestPrintPayload = {
  type: "self_test";
  printVersion: number;
  generatedAt: string;
  tableNo: string;
  tickets: PrintTicket[];
};

type TableBillPrintItem = {
  name: string;
  qty: number;
  unitPrice: number;
  amount: number;
  note: string | null;
};

type TableBillChargeLine = {
  label: string;
  amount: number;
};

type TableBillPrintPayload = {
  type: "table_bill";
  printVersion: number;
  tableNo: string;
  openedAt: string;
  printedAt: string;
  items: TableBillPrintItem[];
  totalQty: number;
  itemAmount: number;
  chargeAmount: number;
  totalAmount: number;
  charges: TableBillChargeLine[];
};

type PrintPayload = OrderPrintPayload | SelfTestPrintPayload | TableBillPrintPayload;

export class PrintDispatchError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

function getProvider(): PrintProvider {
  const raw = (process.env.PRINT_PROVIDER || "cloud").toLowerCase();
  if (raw === "agent") return "agent";
  if (raw === "xpyun") return "xpyun";
  return "cloud";
}

function getFallbackProvider(primary: PrintProvider): PrintProvider | null {
  const raw = (process.env.PRINT_FALLBACK_PROVIDER || "").toLowerCase();
  const parsed: PrintProvider | null = raw === "cloud" || raw === "agent" || raw === "xpyun"
    ? raw
    : null;
  if (!parsed || parsed === primary) return null;
  return parsed;
}

function getPrintTimeoutMs() {
  const raw = Number(process.env.PRINT_TIMEOUT_MS || 3000);
  if (!Number.isFinite(raw) || raw < 500) return 3000;
  return Math.min(Math.round(raw), 15000);
}

function forceSingleXpyunCopy() {
  const raw = String(process.env.PRINT_FORCE_SINGLE_COPY || "true").trim().toLowerCase();
  return raw !== "false";
}

function toLowerSet(csv: string | undefined) {
  return new Set(
    String(csv || "")
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

function toLowerList(csv: string | undefined) {
  return String(csv || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function shouldSplitByTarget() {
  return String(process.env.PRINT_SPLIT_BY_TARGET || "").trim().toLowerCase() === "true";
}

function resolveTarget(
  category: string | null,
  dishName: string,
  barCategories: Set<string>,
  barKeywords: string[]
): PrintTarget {
  const categoryKey = String(category || "").trim().toLowerCase();
  if (categoryKey && barCategories.has(categoryKey)) {
    return "bar";
  }

  const nameKey = dishName.toLowerCase();
  if (barKeywords.some((keyword) => keyword && nameKey.includes(keyword))) {
    return "bar";
  }

  return "kitchen";
}

async function buildOrderPayload(orderId: string): Promise<OrderPrintPayload> {
  const barCategories = toLowerSet(process.env.PRINT_ROUTE_BAR_CATEGORIES);
  const barKeywords = toLowerList(process.env.PRINT_ROUTE_BAR_KEYWORDS);
  const splitByTarget = shouldSplitByTarget();

  const { rows } = await pool.query<OrderPrintRow>(
    `SELECT o.id AS order_id,
            o.table_no,
            o.created_at,
            u.username AS waiter_name,
            mi.name AS dish_name,
            COALESCE(oi.unit_price, mi.price) AS unit_price,
            oi.qty,
            mi.category,
            oi.note
     FROM orders o
     LEFT JOIN users u ON u.id = o.waiter_id
     JOIN order_items oi ON oi.order_id = o.id
     JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE o.id = $1
     ORDER BY mi.category ASC NULLS FIRST, mi.name ASC`,
    [orderId]
  );

  if (rows.length === 0) {
    throw new PrintDispatchError("打印订单不存在或无菜品", false);
  }

  const base = rows[0];
  const items = rows.map((row) => {
    const target = splitByTarget ? resolveTarget(row.category, row.dish_name, barCategories, barKeywords) : "kitchen";
    return {
      name: row.dish_name,
      unitPrice: Number(row.unit_price) || 0,
      qty: row.qty,
      category: row.category,
      note: row.note,
      target
    };
  });

  const tickets: PrintTicket[] = splitByTarget
    ? (["kitchen", "bar"] as const)
        .map((target) => ({
          target,
          items: items.filter((item) => item.target === target)
        }))
        .filter((ticket) => ticket.items.length > 0)
    : [{ target: "kitchen", items }];

  return {
    type: "order",
    printVersion: 2,
    tableNo: base.table_no,
    createdAt: base.created_at,
    waiter: base.waiter_name || null,
    items,
    tickets
  };
}

function toKitchenOnlyOrderPayload(payload: OrderPrintPayload): OrderPrintPayload {
  const kitchenItems = payload.items.map((item) => ({
    ...item,
    unitPrice: undefined,
    target: "kitchen" as const
  }));

  return {
    ...payload,
    items: kitchenItems,
    tickets: [{
      target: "kitchen",
      items: kitchenItems
    }]
  };
}

function chargeTypeLabel(type: string) {
  if (type === "discount") return "DISCOUNT";
  if (type === "service_fee") return "SERVICE FEE";
  if (type === "tax") return "TAX";
  return "ADJUSTMENT";
}

async function buildTableBillPayload(tableNoRaw: string): Promise<TableBillPrintPayload> {
  const tableNo = String(tableNoRaw || "").trim();
  if (!tableNo) {
    throw new PrintDispatchError("缺少桌号", false);
  }

  const session = await pool.query<{ table_no: string; opened_at: string }>(
    `SELECT table_no, opened_at
     FROM table_sessions
     WHERE table_no = $1
       AND closed_at IS NULL
     LIMIT 1`,
    [tableNo]
  );
  if (session.rows.length === 0) {
    throw new PrintDispatchError("桌台未开台", false);
  }
  const openedAt = session.rows[0].opened_at;

  const itemsRes = await pool.query<{
    name: string;
    note: string | null;
    qty: number;
    unit_price: number;
    amount: number;
  }>(
    `SELECT mi.name,
            oi.note,
            SUM(oi.qty)::int AS qty,
            COALESCE(oi.unit_price, mi.price)::int AS unit_price,
            SUM(oi.qty * COALESCE(oi.unit_price, mi.price))::int AS amount
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE o.table_no = $1
       AND o.created_at >= $2
       AND o.status IN ('submitted', 'paid')
       AND o.cancelled_at IS NULL
       AND o.merged_into_order_id IS NULL
     GROUP BY mi.name, oi.note, COALESCE(oi.unit_price, mi.price)
     ORDER BY mi.name ASC, oi.note ASC NULLS FIRST`,
    [tableNo, openedAt]
  );
  if (itemsRes.rows.length === 0) {
    throw new PrintDispatchError("暂无可打印账单", false);
  }

  const chargesRes = await pool.query<{ charge_type: string; amount: number }>(
    `SELECT oc.charge_type, COALESCE(SUM(oc.amount), 0)::int AS amount
     FROM order_charges oc
     JOIN orders o ON o.id = oc.order_id
     WHERE o.table_no = $1
       AND o.created_at >= $2
       AND o.status IN ('submitted', 'paid')
       AND o.cancelled_at IS NULL
       AND o.merged_into_order_id IS NULL
     GROUP BY oc.charge_type
     ORDER BY oc.charge_type ASC`,
    [tableNo, openedAt]
  );

  const items = itemsRes.rows.map((row) => ({
    name: row.name,
    qty: Number(row.qty) || 0,
    unitPrice: Number(row.unit_price) || 0,
    amount: Number(row.amount) || 0,
    note: row.note || null
  }));
  const totalQty = items.reduce((sum, item) => sum + Math.max(0, item.qty), 0);
  const itemAmount = items.reduce((sum, item) => sum + Math.max(0, item.amount), 0);

  const charges = chargesRes.rows.map((row) => ({
    label: chargeTypeLabel(row.charge_type),
    amount: Number(row.amount) || 0
  }));
  const chargeAmount = charges.reduce((sum, charge) => sum + charge.amount, 0);
  const totalAmount = itemAmount + chargeAmount;

  return {
    type: "table_bill",
    printVersion: 2,
    tableNo,
    openedAt,
    printedAt: new Date().toISOString(),
    items,
    totalQty,
    itemAmount,
    chargeAmount,
    totalAmount,
    charges
  };
}

function buildSelfTestPayload(target: "kitchen" | "bar" | "both" = "both"): SelfTestPrintPayload {
  const splitByTarget = shouldSplitByTarget();
  const targets = splitByTarget
    ? (target === "both" ? (["kitchen", "bar"] as const) : ([target] as const))
    : (["kitchen"] as const);
  const items = target === "bar"
    ? [{
        name: "TEST DRINK",
        unitPrice: 0,
        qty: 1,
        category: "Test Bar",
        note: "printer self test",
        target: "bar" as const
      }]
      : target === "kitchen"
      ? [{
          name: "TEST DISH",
          unitPrice: 0,
          qty: 1,
          category: "Test Kitchen",
          note: "printer self test",
          target: "kitchen" as const
        }]
      : [{
          name: "TEST DISH",
          unitPrice: 0,
          qty: 1,
          category: "Test Kitchen",
          note: "printer self test",
          target: "kitchen" as const
        }, {
          name: "TEST DRINK",
          unitPrice: 0,
          qty: 1,
          category: "Test Bar",
          note: "printer self test",
          target: "bar" as const
        }];

  return {
    type: "self_test",
    printVersion: 2,
    generatedAt: new Date().toISOString(),
    tableNo: "TEST",
    tickets: targets.map((ticketTarget) => ({
      target: ticketTarget,
      items: splitByTarget ? items.filter((item) => item.target === ticketTarget) : items
    }))
  };
}

function sanitizeXpyunLine(value: string) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/</g, "＜")
    .replace(/>/g, "＞")
    .trim();
}

function getXpyunFontTag() {
  const raw = String(process.env.XPYUN_FONT_TAG || "N").trim().toUpperCase();
  if (!raw) return "";
  const allow = new Set(["N", "HB", "WB", "B", "HB2", "WB2", "B2", "BOLD"]);
  return allow.has(raw) ? raw : "N";
}

function xpyunLine(text = "", opts?: { center?: boolean; forceTag?: string }) {
  const safe = sanitizeXpyunLine(text);
  const tag = opts?.forceTag ?? getXpyunFontTag();
  const content = tag ? `<${tag}>${safe}</${tag}>` : safe;
  if (opts?.center) return `<C>${content}</C><BR>`;
  return `${content}<BR>`;
}

function formatPrintDateTime(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.valueOf())) return iso;
  const timezone = process.env.PRINT_TIMEZONE || "Asia/Manila";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function formatPhp(amount: number) {
  return `PHP ${Math.max(0, Math.round(amount)).toLocaleString("en-US")}`;
}

function formatCompactAmount(amount: number) {
  return Math.max(0, Math.round(amount)).toLocaleString("en-US");
}

function formatSignedCompactAmount(amount: number) {
  const rounded = Math.round(amount);
  if (rounded < 0) return `-${Math.abs(rounded).toLocaleString("en-US")}`;
  return rounded.toLocaleString("en-US");
}

function formatPrintQtyLabel(name: string, qtyRaw: number) {
  return formatItemQtyDisplay(name, qtyRaw, "en");
}

function getReceiptLineWidth() {
  const raw = Number(process.env.XPYUN_LINE_WIDTH || 32);
  if (!Number.isFinite(raw)) return 32;
  return Math.min(48, Math.max(24, Math.round(raw)));
}

function dividerLine(char = "-") {
  return char.repeat(getReceiptLineWidth());
}

function writeLinePlaceholder() {
  return "_".repeat(Math.max(14, getReceiptLineWidth() - 2));
}

function appendGuestFillFields(lines: string[]) {
  lines.push(xpyunLine("ROOM NO:", { forceTag: "N" }));
  lines.push(xpyunLine(writeLinePlaceholder(), { forceTag: "N" }));
  lines.push("<BR>");
  lines.push(xpyunLine("PRINT FULL NAME:", { forceTag: "N" }));
  lines.push(xpyunLine(writeLinePlaceholder(), { forceTag: "N" }));
  lines.push("<BR>");
  lines.push(xpyunLine("PAYMENT METHOD:", { forceTag: "N" }));
  lines.push(xpyunLine(writeLinePlaceholder(), { forceTag: "N" }));
}

function wrapReceiptText(text: string, width = getReceiptLineWidth()) {
  const value = sanitizeXpyunLine(text);
  if (!value) return [];
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const token of tokens) {
    const parts: string[] = [];
    if (token.length > width) {
      for (let i = 0; i < token.length; i += width) {
        parts.push(token.slice(i, i + width));
      }
    } else {
      parts.push(token);
    }

    for (const part of parts) {
      if (!current) {
        current = part;
        continue;
      }
      const merged = `${current} ${part}`;
      if (merged.length <= width) {
        current = merged;
      } else {
        lines.push(current);
        current = part;
      }
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function formatAmountRow(qty: number | string, unitPrice: number, amount: number, width = getReceiptLineWidth()) {
  const qtyLabel = typeof qty === "string" ? sanitizeXpyunLine(qty) : String(Math.max(0, Number(qty) || 0));
  const left = `${qtyLabel} x ${formatCompactAmount(unitPrice)}`;
  const right = formatCompactAmount(amount);
  if (left.length + right.length + 1 > width) {
    return `${left} = ${right}`;
  }
  const pad = " ".repeat(Math.max(1, width - left.length - right.length));
  return `${left}${pad}${right}`;
}

function finalizeXpyunContent(lines: string[]) {
  let content = lines.join("");
  const maxBytes = 11_500;
  while (Buffer.byteLength(content, "utf8") > maxBytes && lines.length > 8) {
    lines.splice(Math.max(8, lines.length - 4), 2);
    content = lines.join("");
  }
  return content;
}

function toXpyunKitchenContent(payload: OrderPrintPayload | SelfTestPrintPayload) {
  const items = payload.tickets.flatMap((ticket) => ticket.items);
  const totalQty = items.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0);
  const headerDate = payload.type === "order" ? payload.createdAt : payload.generatedAt;
  const separator = dividerLine("-");
  const majorSeparator = dividerLine("=");

  const lines: string[] = [
    "<CB><B>RDV KITCHEN COPY</B></CB><BR>",
    xpyunLine(`TABLE ${payload.tableNo}`, { center: true, forceTag: "B" }),
    xpyunLine(`Time: ${formatPrintDateTime(headerDate)}`)
  ];

  if (payload.type === "order" && payload.waiter) {
    lines.push(xpyunLine(`Server: ${payload.waiter}`));
  }

  lines.push(xpyunLine(majorSeparator, { forceTag: "" }));
  for (const item of items) {
    const itemName = localizeMenuText(item.name, "en").toUpperCase();
    const qtyLabel = formatPrintQtyLabel(item.name, item.qty);
    for (const row of wrapReceiptText(itemName)) {
      lines.push(xpyunLine(row, { forceTag: "B" }));
    }
    lines.push(xpyunLine(`QTY: ${qtyLabel}`));
    if (item.note) {
      for (const noteRow of wrapReceiptText(`NOTE: ${item.note}`)) {
        lines.push(xpyunLine(noteRow, { forceTag: "N" }));
      }
    }
    lines.push(xpyunLine(separator, { forceTag: "" }));
  }
  lines.push(xpyunLine(`ITEM LINES: ${items.length}`));
  lines.push(xpyunLine(`TOTAL QTY : ${totalQty}`));
  lines.push(xpyunLine("STATUS    : SENT"));
  lines.push(xpyunLine(majorSeparator, { forceTag: "" }));
  lines.push("<BR>");
  lines.push("<BR>");
  lines.push("<BR>");

  return finalizeXpyunContent(lines);
}

function toXpyunCustomerContent(payload: OrderPrintPayload) {
  const items = payload.items;
  const totalQty = items.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0);
  const totalAmount = items.reduce((sum, item) => {
    const qty = Math.max(0, Number(item.qty) || 0);
    const price = Math.max(0, Number(item.unitPrice) || 0);
    return sum + qty * price;
  }, 0);
  const separator = dividerLine("-");
  const majorSeparator = dividerLine("=");

  const lines: string[] = [
    "<CB><B>RDV GUEST COPY</B></CB><BR>",
    xpyunLine(`TABLE ${payload.tableNo}`, { center: true, forceTag: "B" }),
    xpyunLine(`Time: ${formatPrintDateTime(payload.createdAt)}`, { forceTag: "N" })
  ];

  if (payload.waiter) {
    lines.push(xpyunLine(`Server: ${payload.waiter}`, { forceTag: "N" }));
  }
  appendGuestFillFields(lines);

  lines.push(xpyunLine(majorSeparator, { forceTag: "" }));
  for (const item of items) {
    const name = localizeMenuText(item.name, "en").toUpperCase();
    const qty = Math.max(0, Number(item.qty) || 0);
    const qtyLabel = formatPrintQtyLabel(item.name, qty);
    const price = Math.max(0, Number(item.unitPrice) || 0);
    const lineAmount = qty * price;

    for (const row of wrapReceiptText(name)) {
      lines.push(xpyunLine(row, { forceTag: "N" }));
    }
    lines.push(xpyunLine(formatAmountRow(qtyLabel, price, lineAmount), { forceTag: "N" }));
    if (item.note) {
      for (const noteRow of wrapReceiptText(`NOTE: ${item.note}`)) {
        lines.push(xpyunLine(noteRow, { forceTag: "N" }));
      }
    }
    lines.push(xpyunLine(separator, { forceTag: "" }));
  }
  lines.push(xpyunLine(`ITEM LINES: ${items.length}`, { forceTag: "N" }));
  lines.push(xpyunLine(`TOTAL QTY : ${totalQty}`, { forceTag: "N" }));
  lines.push(xpyunLine(`TOTAL     : ${formatPhp(totalAmount)}`, { forceTag: "N" }));
  lines.push(xpyunLine(majorSeparator, { forceTag: "" }));
  lines.push("<C><N>THANK YOU</N></C><BR>");
  lines.push("<BR>");
  lines.push("<BR>");
  lines.push("<BR>");

  return finalizeXpyunContent(lines);
}

function toXpyunTableBillContent(payload: TableBillPrintPayload) {
  const separator = dividerLine("-");
  const majorSeparator = dividerLine("=");

  const lines: string[] = [
    "<CB><B>RDV GUEST COPY</B></CB><BR>",
    xpyunLine(`TABLE ${payload.tableNo}`, { center: true, forceTag: "B" }),
    xpyunLine(`Opened: ${formatPrintDateTime(payload.openedAt)}`, { forceTag: "N" }),
    xpyunLine(`Printed: ${formatPrintDateTime(payload.printedAt)}`, { forceTag: "N" })
  ];
  appendGuestFillFields(lines);

  lines.push(xpyunLine(majorSeparator, { forceTag: "" }));
  for (const item of payload.items) {
    const name = localizeMenuText(item.name, "en").toUpperCase();
    const qtyLabel = formatPrintQtyLabel(item.name, item.qty);
    for (const row of wrapReceiptText(name)) {
      lines.push(xpyunLine(row, { forceTag: "N" }));
    }
    lines.push(xpyunLine(formatAmountRow(qtyLabel, item.unitPrice, item.amount), { forceTag: "N" }));
    if (item.note) {
      for (const noteRow of wrapReceiptText(`NOTE: ${item.note}`)) {
        lines.push(xpyunLine(noteRow, { forceTag: "N" }));
      }
    }
    lines.push(xpyunLine(separator, { forceTag: "" }));
  }

  lines.push(xpyunLine(`ITEM LINES: ${payload.items.length}`, { forceTag: "N" }));
  lines.push(xpyunLine(`TOTAL QTY : ${payload.totalQty}`, { forceTag: "N" }));
  lines.push(xpyunLine(`SUBTOTAL  : PHP ${formatCompactAmount(payload.itemAmount)}`, { forceTag: "N" }));
  if (payload.charges.length > 0) {
    for (const charge of payload.charges) {
      lines.push(xpyunLine(`${charge.label}: PHP ${formatSignedCompactAmount(charge.amount)}`, { forceTag: "N" }));
    }
  }
  lines.push(xpyunLine(`TOTAL     : ${formatPhp(payload.totalAmount)}`, { forceTag: "N" }));
  lines.push(xpyunLine(majorSeparator, { forceTag: "" }));
  lines.push("<C><N>THANK YOU</N></C><BR>");
  lines.push("<BR>");
  lines.push("<BR>");
  lines.push("<BR>");

  return finalizeXpyunContent(lines);
}

function isRetryableXpyunError(code: number) {
  return code === 1003 || code === 1006 || code === 2001 || code === 5000;
}

type XpyunConfig = {
  url: string;
  user: string;
  userKey: string;
  sn: string;
  copies: number;
  voice: number | null;
  mode: number | null;
};

function resolveXpyunConfig(): XpyunConfig {
  const url = process.env.XPYUN_API_URL || "https://open.xpyun.net/api/openapi/xprinter/print";
  const aliasUser = process.env.USERKEY || process.env.XPYUN_USERKEY || process.env.SN ? process.env.USER : "";
  const user = (process.env.XPYUN_USER || aliasUser || "").trim();
  const userKey = (process.env.XPYUN_USER_KEY || process.env.XPYUN_USERKEY || process.env.USERKEY || "").trim();
  const sn = (process.env.XPYUN_SN || process.env.SN || "").trim();
  if (!url || !user || !userKey || !sn) {
    throw new PrintDispatchError("芯烨云打印配置缺失", false);
  }

  const copiesRaw = Number(process.env.XPYUN_COPIES || 1);
  const parsedCopies = Number.isFinite(copiesRaw) ? Math.min(65535, Math.max(1, Math.round(copiesRaw))) : 1;
  const copies = forceSingleXpyunCopy() ? 1 : parsedCopies;
  const voiceRaw = process.env.XPYUN_VOICE;
  const voiceNum = voiceRaw === undefined || voiceRaw === "" ? null : Number(voiceRaw);
  const voice = Number.isFinite(voiceNum) ? Math.min(4, Math.max(0, Math.round(voiceNum as number))) : null;
  const modeRaw = process.env.XPYUN_MODE;
  const modeNum = modeRaw === undefined || modeRaw === "" ? null : Number(modeRaw);
  const mode = Number.isFinite(modeNum) ? Math.max(0, Math.round(modeNum as number)) : null;

  return { url, user, userKey, sn, copies, voice, mode };
}

async function dispatchXpyunContent(config: XpyunConfig, content: string, copiesOverride?: number) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = createHash("sha1").update(`${config.user}${config.userKey}${timestamp}`).digest("hex");
  const safeCopies = Number.isFinite(copiesOverride)
    ? Math.min(65535, Math.max(1, Math.round(copiesOverride as number)))
    : config.copies;
  const body: Record<string, unknown> = {
    user: config.user,
    timestamp,
    sign,
    sn: config.sn,
    content,
    copies: safeCopies
  };
  if (config.voice !== null) body.voice = config.voice;
  if (config.mode !== null) body.mode = config.mode;

  const result = await postJsonWithTimeout(config.url, body, {}, getPrintTimeoutMs());
  if (!result.ok) {
    const retryable = result.status >= 500 || result.status === 429;
    throw new PrintDispatchError(`芯烨云打印失败(${result.status})`, retryable);
  }

  const code = Number(result.data?.code);
  const msg = typeof result.data?.msg === "string" ? result.data.msg : "xpyun provider error";
  if (!Number.isFinite(code) || code !== 0) {
    throw new PrintDispatchError(`芯烨云打印失败(${code}) ${msg}`, isRetryableXpyunError(code));
  }

  return typeof result.data?.data === "string" ? result.data.data : undefined;
}

async function dispatchToXpyun(payload: PrintPayload): Promise<DispatchResult> {
  const config = resolveXpyunConfig();
  if (payload.type === "order") {
    const kitchenJobId = await dispatchXpyunContent(config, toXpyunKitchenContent(payload));
    return {
      provider: "xpyun",
      slot: "primary",
      remoteJobId: kitchenJobId
    };
  }

  if (payload.type === "table_bill") {
    const jobId = await dispatchXpyunContent(config, toXpyunTableBillContent(payload), 1);
    return {
      provider: "xpyun",
      slot: "primary",
      remoteJobId: jobId
    };
  }

  const testJobId = await dispatchXpyunContent(config, toXpyunKitchenContent(payload));
  return {
    provider: "xpyun",
    slot: "primary",
    remoteJobId: testJobId
  };
}

async function postJsonWithTimeout(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new PrintDispatchError(`打印请求超时（>${timeoutMs}ms）`, true);
    }
    throw new PrintDispatchError("打印请求网络异常", true);
  } finally {
    clearTimeout(timer);
  }
}

async function dispatchToCloud(payload: Record<string, unknown>): Promise<DispatchResult> {
  const url = process.env.PRINT_CLOUD_URL;
  const token = process.env.PRINT_CLOUD_API_KEY;
  if (!url || !token) {
    throw new PrintDispatchError("云打印配置缺失", false);
  }

  const result = await postJsonWithTimeout(
    url,
    payload,
    { Authorization: `Bearer ${token}` },
    getPrintTimeoutMs()
  );

  if (!result.ok) {
    const retryable = result.status >= 500 || result.status === 429;
    const detail = typeof result.data?.error === "string" ? result.data.error : "cloud provider error";
    const message = `云打印失败(${result.status}) ${detail}`;
    throw new PrintDispatchError(message, retryable);
  }

  return {
    provider: "cloud",
    slot: "primary",
    remoteJobId: typeof result.data?.jobId === "string" ? result.data.jobId : undefined
  };
}

async function dispatchToAgent(payload: Record<string, unknown>): Promise<DispatchResult> {
  const url = process.env.PRINT_AGENT_URL;
  const token = process.env.PRINT_AGENT_TOKEN;
  if (!url || !token) {
    throw new PrintDispatchError("店内打印代理配置缺失", false);
  }

  const result = await postJsonWithTimeout(
    url,
    payload,
    { "X-Agent-Token": token },
    getPrintTimeoutMs()
  );

  if (!result.ok) {
    const retryable = result.status >= 500 || result.status === 429;
    const detail = typeof result.data?.error === "string" ? result.data.error : "agent provider error";
    const message = `打印代理失败(${result.status}) ${detail}`;
    throw new PrintDispatchError(message, retryable);
  }

  return {
    provider: "agent",
    slot: "primary",
    remoteJobId: typeof result.data?.jobId === "string" ? result.data.jobId : undefined
  };
}

async function markDeviceSuccess(slot: "primary" | "backup") {
  const deviceCode = slot === "primary" ? "printer-primary" : "printer-backup";
  try {
    await pool.query(
      `INSERT INTO device_status (device_code, device_type, label, status, is_backup, fail_count, last_seen_at, updated_at, last_error)
       VALUES ($1, 'printer', $2, 'online', $3, 0, now(), now(), NULL)
       ON CONFLICT (device_code) DO UPDATE
       SET status = 'online',
           fail_count = 0,
           last_seen_at = now(),
           updated_at = now(),
           last_error = NULL`,
      [deviceCode, slot === "primary" ? "Primary Printer" : "Backup Printer", slot === "backup"]
    );
  } catch {
    // Ignore device status write errors to avoid blocking print flow.
  }
}

async function markDeviceFailure(slot: "primary" | "backup", message: string) {
  const deviceCode = slot === "primary" ? "printer-primary" : "printer-backup";
  try {
    await pool.query(
      `INSERT INTO device_status (device_code, device_type, label, status, is_backup, fail_count, last_seen_at, updated_at, last_error)
       VALUES ($1, 'printer', $2, 'degraded', $3, 1, now(), now(), $4)
       ON CONFLICT (device_code) DO UPDATE
       SET fail_count = device_status.fail_count + 1,
           status = CASE WHEN device_status.fail_count + 1 >= 3 THEN 'offline' ELSE 'degraded' END,
           last_seen_at = now(),
           updated_at = now(),
           last_error = $4`,
      [deviceCode, slot === "primary" ? "Primary Printer" : "Backup Printer", slot === "backup", message.slice(0, 500)]
    );
  } catch {
    // Ignore device status write errors to keep print retries running.
  }
}

async function dispatchWithTracking(
  provider: PrintProvider,
  payload: PrintPayload,
  slot: "primary" | "backup"
): Promise<DispatchResult> {
  try {
    const result = provider === "agent"
      ? await dispatchToAgent(payload)
      : provider === "xpyun"
        ? await dispatchToXpyun(payload)
        : await dispatchToCloud(payload);
    await markDeviceSuccess(slot);
    return { ...result, slot };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : "打印失败";
    await markDeviceFailure(slot, msg);
    throw err;
  }
}

async function dispatchWithFallback(payload: PrintPayload) {
  const primary = getProvider();
  const fallback = getFallbackProvider(primary);

  try {
    return await dispatchWithTracking(primary, payload, "primary");
  } catch (err: any) {
    if (!fallback) {
      throw err;
    }
    return dispatchWithTracking(fallback, payload, "backup");
  }
}

export async function dispatchPrintJob(orderId: string): Promise<DispatchResult> {
  const payload = toKitchenOnlyOrderPayload(await buildOrderPayload(orderId));
  return dispatchWithFallback(payload);
}

export async function dispatchTableBillPrint(tableNo: string): Promise<DispatchResult> {
  const payload = await buildTableBillPayload(tableNo);
  return dispatchWithFallback(payload);
}

export async function dispatchPrintSelfTest(target: "kitchen" | "bar" | "both" = "both") {
  const payload = buildSelfTestPayload(target);
  return dispatchWithFallback(payload);
}

export const __printTestUtils = {
  getXpyunFontTag,
  getReceiptLineWidth,
  wrapReceiptText,
  formatPrintQtyLabel,
  formatAmountRow,
  toKitchenOnlyOrderPayload,
  toXpyunKitchenContent,
  toXpyunCustomerContent,
  toXpyunTableBillContent
};
