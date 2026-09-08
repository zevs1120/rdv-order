import { describe, expect, it } from "vitest";
import { localizeMenuText, shortCategoryLabel } from "../../lib/menu-text";

describe("menu text localization", () => {
  it("localizeMenuText should map known zh/en pairs bidirectionally", () => {
    expect(localizeMenuText("菲律宾菜", "en")).toBe("Filipino Food");
    expect(localizeMenuText("Filipino Food", "zh")).toBe("菲律宾菜");
    expect(localizeMenuText("早餐加点", "en")).toBe("Add-ons");
    expect(localizeMenuText("Add-ons", "zh")).toBe("早餐加点");
  });

  it("localizeMenuText should keep unknown text unchanged", () => {
    expect(localizeMenuText("Custom House Special", "en")).toBe("Custom House Special");
    expect(localizeMenuText("Custom House Special", "zh")).toBe("Custom House Special");
  });

  it("shortCategoryLabel should compact english labels", () => {
    expect(shortCategoryLabel("Filipino Food", "en")).toBe("Filipino");
    expect(shortCategoryLabel("Special Drinks", "en")).toBe("Special");
  });

  it("shortCategoryLabel should keep chinese labels unchanged", () => {
    expect(shortCategoryLabel("菲律宾菜", "zh")).toBe("菲律宾菜");
  });
});
