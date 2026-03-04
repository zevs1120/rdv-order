import { afterEach, describe, expect, it } from "vitest";
import { getOrderDedupeWindowSeconds, parseItems } from "../../lib/orders-utils";

const dishId = "11111111-1111-4111-8111-111111111111";

describe("orders utils", () => {
  const originalDedupe = process.env.ORDER_DEDUPE_WINDOW_SECONDS;

  afterEach(() => {
    process.env.ORDER_DEDUPE_WINDOW_SECONDS = originalDedupe;
  });

  it("parseItems should merge same dish notes regardless of note letter case", () => {
    const parsed = parseItems([
      { menuItemId: dishId, qty: 1, note: "No Onion" },
      { menuItemId: dishId, qty: 2, note: " no onion " }
    ]);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].qty).toBe(3);
    expect(parsed[0].note).toBe("No Onion");
  });

  it("parseItems should reject invalid qty values", () => {
    expect(() => parseItems([{ menuItemId: dishId, qty: 0, note: "" }])).toThrow("INVALID_ITEMS");
    expect(() => parseItems([{ menuItemId: dishId, qty: 31, note: "" }])).toThrow("INVALID_ITEMS");
  });

  it("getOrderDedupeWindowSeconds should clamp configured value", () => {
    process.env.ORDER_DEDUPE_WINDOW_SECONDS = "1";
    expect(getOrderDedupeWindowSeconds()).toBe(3);

    process.env.ORDER_DEDUPE_WINDOW_SECONDS = "50";
    expect(getOrderDedupeWindowSeconds()).toBe(20);

    process.env.ORDER_DEDUPE_WINDOW_SECONDS = "8";
    expect(getOrderDedupeWindowSeconds()).toBe(8);
  });
});
