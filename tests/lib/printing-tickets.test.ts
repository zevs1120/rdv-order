import { expect, it } from "vitest";
import { renderOrderTicket } from "../../lib/printing/tickets";

it("renders one kitchen copy without prices followed by one priced guest copy", () => {
  const content = renderOrderTicket({ tableNo: "06", createdAt: "2026-09-23T06:00:00Z", waiter: "Staff",
    items: [{ name: "Rice Platter", qty: 2, unitPrice: 150, note: "no salt" }] });
  const parts = content.split("<CB>RDV GUEST COPY<BR></CB>");
  expect(parts).toHaveLength(2);
  expect(parts[0].match(/RDV KITCHEN COPY/g)).toHaveLength(1);
  expect(parts[0]).toContain("RICE PLATTER");
  expect(parts[0]).not.toContain("150");
  expect(parts[1]).toContain("2 x 150");
  expect(parts[1]).toContain("TOTAL     : PHP 300");
});
