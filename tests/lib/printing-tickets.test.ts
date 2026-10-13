import { expect, it } from "vitest";
import { renderOrderTicket, renderBillTicket } from "../../lib/printing/tickets";
it("prints only one kitchen copy on order submission", () => {
  const content = renderOrderTicket({ tableNo: "06", createdAt: "2026-10-13T06:00:00Z", waiter: "Staff",
    items: [{ name: "Rice Platter", qty: 2, unitPrice: 150, note: "no salt" }] });
  expect(content.match(/RDV KITCHEN COPY/g)).toHaveLength(1);
  expect(content).toContain("RICE PLATTER");
  expect(content).toContain("no salt");
  expect(content).not.toContain("RDV GUEST COPY");
  expect(content).not.toContain("150");
});
it("keeps the separate bill format with quantities, prices and guest fields", () => {
  const content = renderBillTicket({ tableNo: "06", openedAt: "2026-10-13T06:00:00Z", printedAt: "2026-10-13T07:00:00Z",
    items: [{ name: "Rice Platter", qty: 2, unitPrice: 150, amount: 300, note: null }],
    totalQty: 2, itemAmount: 300, chargeAmount: 0, totalAmount: 300, charges: [] });
  expect(content).toContain("RDV GUEST COPY");
  expect(content).toContain("2 x 150");
  expect(content).toContain("TOTAL     : PHP 300");
  expect(content).toContain("ROOM NO:");
  expect(content).not.toContain("RDV KITCHEN COPY");
});
