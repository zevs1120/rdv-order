import { afterEach, describe, expect, it, vi } from "vitest";
import { endOfDay, rangeByPreset, startOfDay, toDateInput } from "../../lib/date-range";

describe("date-range helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("startOfDay and endOfDay should clamp time boundaries", () => {
    const source = new Date("2026-03-04T17:23:45.678Z");
    const start = startOfDay(source);
    const end = endOfDay(source);

    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);

    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it("rangeByPreset(today/yesterday) should return same-day ranges", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T10:11:12.000Z"));

    const today = rangeByPreset("today");
    const yesterday = rangeByPreset("yesterday");

    expect(toDateInput(today.from)).toBe("2026-03-04");
    expect(toDateInput(today.to)).toBe("2026-03-04");
    expect(today.from.getTime()).toBeLessThan(today.to.getTime());

    expect(toDateInput(yesterday.from)).toBe("2026-03-03");
    expect(toDateInput(yesterday.to)).toBe("2026-03-03");
  });

  it("rangeByPreset(week/month/3months/year) should include current day as upper bound", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T08:00:00.000Z"));

    const week = rangeByPreset("week");
    const month = rangeByPreset("month");
    const threeMonths = rangeByPreset("3months");
    const year = rangeByPreset("year");

    expect(toDateInput(week.to)).toBe("2026-03-04");
    expect(toDateInput(month.to)).toBe("2026-03-04");
    expect(toDateInput(threeMonths.to)).toBe("2026-03-04");
    expect(toDateInput(year.to)).toBe("2026-03-04");

    expect(toDateInput(week.from)).toBe("2026-02-26");
    expect(month.from.getTime()).toBeLessThan(month.to.getTime());
    expect(threeMonths.from.getTime()).toBeLessThan(threeMonths.to.getTime());
    expect(year.from.getTime()).toBeLessThan(year.to.getTime());
  });

  it("toDateInput should output yyyy-mm-dd", () => {
    expect(toDateInput(new Date("2026-01-09T00:00:00.000Z"))).toBe("2026-01-09");
  });
});
