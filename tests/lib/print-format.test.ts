import { afterEach, describe, expect, it } from "vitest";
import { __printTestUtils } from "../../lib/print";

describe("print content formatting", () => {
  const originalLineWidth = process.env.XPYUN_LINE_WIDTH;
  const originalFontTag = process.env.XPYUN_FONT_TAG;

  afterEach(() => {
    process.env.XPYUN_LINE_WIDTH = originalLineWidth;
    process.env.XPYUN_FONT_TAG = originalFontTag;
  });

  it("wrapReceiptText should keep each wrapped row within configured width", () => {
    process.env.XPYUN_LINE_WIDTH = "24";
    const rows = __printTestUtils.wrapReceiptText(
      "SIGNATURE CHICKEN GARLIC MUSHROOM WITH EXTRA SAUCE",
      24
    );
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(row.length).toBeLessThanOrEqual(24);
    }
  });

  it("kitchen print header should use smaller title tag after resize", () => {
    process.env.XPYUN_FONT_TAG = "N";

    const payload = {
      type: "order",
      printVersion: 2,
      tableNo: "01",
      createdAt: "2026-03-04T12:00:00.000Z",
      waiter: "Mercy",
      items: [
        {
          name: "Chicken Curry",
          unitPrice: 450,
          qty: 1,
          category: "Filipino Food",
          note: "no onion",
          target: "kitchen"
        }
      ],
      tickets: [
        {
          target: "kitchen",
          items: [
            {
              name: "Chicken Curry",
              unitPrice: 450,
              qty: 1,
              category: "Filipino Food",
              note: "no onion",
              target: "kitchen"
            }
          ]
        }
      ]
    } as const;

    const content = __printTestUtils.toXpyunKitchenContent(payload as any);
    expect(content).toContain("<CB><B>RDV KITCHEN COPY</B></CB>");
    expect(content).not.toContain("<CB><B2>RDV KITCHEN COPY</B2></CB>");
    expect(content).toContain("<B>CHICKEN CURRY</B>");
  });

  it("customer content should include room and guest name lines", () => {
    const payload = {
      type: "order",
      printVersion: 2,
      tableNo: "05",
      createdAt: "2026-03-04T12:00:00.000Z",
      waiter: "Mercy",
      items: [
        {
          name: "Chicken Curry",
          unitPrice: 450,
          qty: 1,
          category: "Filipino Food",
          note: "no onion",
          target: "kitchen"
        }
      ],
      tickets: [
        {
          target: "kitchen",
          items: [
            {
              name: "Chicken Curry",
              unitPrice: 450,
              qty: 1,
              category: "Filipino Food",
              note: "no onion",
              target: "kitchen"
            }
          ]
        }
      ]
    } as const;

    const content = __printTestUtils.toXpyunCustomerContent(payload as any);
    expect(content).toContain("ROOM NO");
    expect(content).toContain("PRINT FULL NAME");
    expect(content).toContain("<B>CHICKEN CURRY</B>");
  });

  it("formatAmountRow should keep amount right aligned when possible", () => {
    const line = __printTestUtils.formatAmountRow(2, 450, 900, 24);
    expect(line).toContain("2 x 450");
    expect(line).toContain("900");
    expect(line.length).toBeLessThanOrEqual(24);
  });
});
