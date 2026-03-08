import { describe, expect, it } from "vitest";
import { formatItemQtyDisplay } from "../../lib/qty-display";

describe("formatItemQtyDisplay", () => {
  it("should format weight-based seafood qty as grams", () => {
    expect(formatItemQtyDisplay("Grouper", 4, "en")).toBe("400g");
    expect(formatItemQtyDisplay("石斑鱼", 4, "zh")).toBe("400g");
  });

  it("should format piece-based seafood qty with pcs", () => {
    expect(formatItemQtyDisplay("Tiger Prawn", 3, "en")).toBe("3 pcs");
    expect(formatItemQtyDisplay("老虎虾", 3, "zh")).toBe("3只");
  });

  it("should keep non-seafood qty as plain integer", () => {
    expect(formatItemQtyDisplay("Chicken Curry", 2, "en")).toBe("2");
  });
});
