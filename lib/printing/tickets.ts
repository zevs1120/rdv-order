import { localizeMenuText } from "../menu-text";
import { formatItemQtyDisplay } from "../qty-display";

export type TicketItem = {
  name: string;
  unitPrice?: number;
  qty: number;
  category?: string | null;
  note?: string | null;
  target?: "kitchen" | "bar";
};

export type OrderTicketPayload = {
  tableNo: string;
  createdAt: string;
  waiter: string | null;
  items: TicketItem[];
  tickets?: Array<{ target: "kitchen" | "bar"; items: TicketItem[] }>;
};

export type BillTicketPayload = {
  tableNo: string;
  openedAt: string;
  printedAt: string;
  items: Array<{
    name: string;
    qty: number;
    unitPrice: number;
    amount: number;
    note: string | null;
  }>;
  totalQty: number;
  itemAmount: number;
  chargeAmount: number;
  totalAmount: number;
  charges: Array<{ label: string; amount: number }>;
};

export type TestTicketPayload = {
  tableNo: string;
  generatedAt: string;
  tickets: Array<{ target: "kitchen" | "bar"; items: TicketItem[] }>;
};

function sanitizeLine(value: string) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/</g, "＜")
    .replace(/>/g, "＞")
    .trim();
}

function fontTag() {
  const raw = String(process.env.XPYUN_FONT_TAG || "N").trim().toUpperCase();
  if (!raw) return "";
  return new Set(["N", "HB", "WB", "B", "HB2", "WB2", "B2", "BOLD"]).has(raw) ? raw : "N";
}

function line(text = "", opts?: { center?: boolean; forceTag?: string }) {
  const safe = sanitizeLine(text);
  if (!safe) return "<BR>";
  const tag = opts?.forceTag ?? fontTag();
  const body = tag ? `<${tag}>${safe}</${tag}>` : safe;
  return opts?.center ? `<C>${body}<BR></C>` : `${body}<BR>`;
}

function dateTime(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.valueOf())) return iso;
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: process.env.PRINT_TIMEZONE || "Asia/Manila",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function lineWidth() {
  const raw = Number(process.env.XPYUN_LINE_WIDTH || 32);
  if (!Number.isFinite(raw)) return 32;
  return Math.min(48, Math.max(24, Math.round(raw)));
}

function divider(char = "-") {
  return char.repeat(lineWidth());
}

function wrapped(text: string, width = lineWidth()) {
  const value = sanitizeLine(text);
  if (!value) return [];
  const rows: string[] = [];
  let current = "";
  for (const token of value.split(/\s+/).filter(Boolean)) {
    const parts = token.length > width
      ? Array.from({ length: Math.ceil(token.length / width) }, (_, index) => token.slice(index * width, (index + 1) * width))
      : [token];
    for (const part of parts) {
      if (!current) current = part;
      else if (`${current} ${part}`.length <= width) current += ` ${part}`;
      else { rows.push(current); current = part; }
    }
  }
  if (current) rows.push(current);
  return rows;
}

function compactAmount(amount: number) {
  return Math.max(0, Math.round(amount)).toLocaleString("en-US");
}

function php(amount: number) {
  return `PHP ${compactAmount(amount)}`;
}

function signedAmount(amount: number) {
  const rounded = Math.round(amount);
  return rounded < 0 ? `-${Math.abs(rounded).toLocaleString("en-US")}` : rounded.toLocaleString("en-US");
}

function amountRow(qty: number | string, unitPrice: number, amount: number, width = lineWidth()) {
  const quantity = typeof qty === "string" ? sanitizeLine(qty) : String(Math.max(0, Number(qty) || 0));
  const left = `${quantity} x ${compactAmount(unitPrice)}`;
  const right = compactAmount(amount);
  if (left.length + right.length + 1 > width) return `${left} = ${right}`;
  return `${left}${" ".repeat(Math.max(1, width - left.length - right.length))}${right}`;
}

function quantityLabel(item: Pick<TicketItem, "name" | "qty">) {
  return formatItemQtyDisplay(item.name, item.qty, "en");
}

function guestFields() {
  const placeholder = "_".repeat(Math.max(14, lineWidth() - 2));
  return [
    line("ROOM NO:", { forceTag: "N" }), line(placeholder, { forceTag: "N" }), "<BR>",
    line("PRINT FULL NAME:", { forceTag: "N" }), line(placeholder, { forceTag: "N" }), "<BR>",
    line("PAYMENT METHOD:", { forceTag: "N" }), line(placeholder, { forceTag: "N" })
  ];
}

function renderKitchen(payload: {
  tableNo: string;
  createdAt?: string;
  generatedAt?: string;
  waiter?: string | null;
  items?: TicketItem[];
  tickets?: Array<{ target: "kitchen" | "bar"; items: TicketItem[] }>;
}) {
  const isTest = payload.generatedAt !== undefined;
  const items = payload.tickets?.flatMap((ticket) => ticket.items) ?? payload.items ?? [];
  const createdAt = payload.generatedAt ?? payload.createdAt ?? "";
  const totalQty = items.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0);
  const rows = [
    "<CB>RDV KITCHEN COPY<BR></CB>",
    line(`TABLE ${payload.tableNo}`, { center: true, forceTag: "B" }),
    line(`Time: ${dateTime(createdAt)}`)
  ];
  if (!isTest && payload.waiter) rows.push(line(`Server: ${payload.waiter}`));
  rows.push(line(divider("="), { forceTag: "" }));
  for (const item of items) {
    for (const row of wrapped(localizeMenuText(item.name, "en").toUpperCase())) rows.push(line(row, { forceTag: "B" }));
    rows.push(line(`QTY: ${quantityLabel(item)}`));
    if (item.note) for (const row of wrapped(`NOTE: ${item.note}`)) rows.push(line(row, { forceTag: "N" }));
    rows.push(line(divider(), { forceTag: "" }));
  }
  rows.push(line(`ITEM LINES: ${items.length}`), line(`TOTAL QTY : ${totalQty}`), line("STATUS    : SENT"));
  rows.push(line(divider("="), { forceTag: "" }), "<BR>", "<BR>", "<BR>");
  return rows.join("");
}

function renderGuestOrder(payload: OrderTicketPayload) {
  const items = payload.items;
  const totalQty = items.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0);
  const total = items.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0) * Math.max(0, Number(item.unitPrice) || 0), 0);
  const rows = ["<CB>RDV GUEST COPY<BR></CB>", line(`TABLE ${payload.tableNo}`, { center: true, forceTag: "B" }), line(`Time: ${dateTime(payload.createdAt)}`, { forceTag: "N" })];
  if (payload.waiter) rows.push(line(`Server: ${payload.waiter}`, { forceTag: "N" }));
  rows.push(...guestFields(), line(divider("="), { forceTag: "" }));
  for (const item of items) {
    const qty = Math.max(0, Number(item.qty) || 0);
    const price = Math.max(0, Number(item.unitPrice) || 0);
    for (const row of wrapped(localizeMenuText(item.name, "en").toUpperCase())) rows.push(line(row, { forceTag: "N" }));
    rows.push(line(amountRow(quantityLabel(item), price, qty * price), { forceTag: "N" }));
    if (item.note) for (const row of wrapped(`NOTE: ${item.note}`)) rows.push(line(row, { forceTag: "N" }));
    rows.push(line(divider(), { forceTag: "" }));
  }
  rows.push(line(`ITEM LINES: ${items.length}`, { forceTag: "N" }), line(`TOTAL QTY : ${totalQty}`, { forceTag: "N" }), line(`TOTAL     : ${php(total)}`, { forceTag: "N" }));
  rows.push(line(divider("="), { forceTag: "" }), "<C><N>THANK YOU</N><BR></C>", "<BR>", "<BR>", "<BR>");
  return rows.join("");
}

/** Render the kitchen and priced guest copies as one immutable cloud job body. */
export function renderOrderTicket(payload: OrderTicketPayload): string {
  return renderKitchen(payload) + renderGuestOrder(payload);
}

export function renderBillTicket(payload: BillTicketPayload): string {
  const rows = ["<CB>RDV GUEST COPY<BR></CB>", line(`TABLE ${payload.tableNo}`, { center: true, forceTag: "B" }), line(`Opened: ${dateTime(payload.openedAt)}`, { forceTag: "N" }), line(`Printed: ${dateTime(payload.printedAt)}`, { forceTag: "N" }), ...guestFields(), line(divider("="), { forceTag: "" })];
  for (const item of payload.items) {
    for (const row of wrapped(localizeMenuText(item.name, "en").toUpperCase())) rows.push(line(row, { forceTag: "N" }));
    rows.push(line(amountRow(quantityLabel(item), item.unitPrice, item.amount), { forceTag: "N" }));
    if (item.note) for (const row of wrapped(`NOTE: ${item.note}`)) rows.push(line(row, { forceTag: "N" }));
    rows.push(line(divider(), { forceTag: "" }));
  }
  rows.push(line(`ITEM LINES: ${payload.items.length}`, { forceTag: "N" }), line(`TOTAL QTY : ${payload.totalQty}`, { forceTag: "N" }), line(`SUBTOTAL  : PHP ${compactAmount(payload.itemAmount)}`, { forceTag: "N" }));
  for (const charge of payload.charges) rows.push(line(`${charge.label}: PHP ${signedAmount(charge.amount)}`, { forceTag: "N" }));
  rows.push(line(`TOTAL     : ${php(payload.totalAmount)}`, { forceTag: "N" }), line(divider("="), { forceTag: "" }), "<C><N>THANK YOU</N><BR></C>", "<BR>", "<BR>", "<BR>");
  return rows.join("");
}

export function renderTestTicket(payload: TestTicketPayload): string {
  return renderKitchen(payload);
}
