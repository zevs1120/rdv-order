import { afterEach, expect, it, vi } from "vitest";
import { LatestReportRead } from "../../lib/latest-report-read";
afterEach(() => vi.useRealTimers());
it("coalesces burst selections and never overlaps running server reads", async () => {
  vi.useFakeTimers();
  const queue = new LatestReportRead();
  let finish!: (value: string) => void;
  const first = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  const a = queue.read(first);
  await vi.advanceTimersByTimeAsync(180);
  const obsolete = vi.fn(async () => "quarter");
  const b = queue.read(obsolete).catch(error => error.name);
  const latest = vi.fn(async () => "month");
  const c = queue.read(latest);
  await vi.advanceTimersByTimeAsync(500);
  expect(first).toHaveBeenCalledTimes(1);
  expect(latest).not.toHaveBeenCalled();
  finish("year");
  expect(await a).toBe("year");
  expect(await b).toBe("AbortError");
  expect(await c).toBe("month");
  expect(obsolete).not.toHaveBeenCalled();
});
it("settles errors and permits a fresh read without retaining financial results", async () => {
  vi.useFakeTimers();
  const queue = new LatestReportRead();
  const bad = queue.read(async () => { throw new Error("slow"); }).catch(e => e.message);
  await vi.advanceTimersByTimeAsync(180);
  expect(await bad).toBe("slow");
  const load = vi.fn(async () => 10);
  for (let i = 0; i < 2; i++) {
    const value = queue.read(load);
    await vi.advanceTimersByTimeAsync(180);
    expect(await value).toBe(10);
  }
  expect(load).toHaveBeenCalledTimes(2);
  const pending = queue.read(load).catch(e => e.name);
  queue.cancelPending();
  await vi.advanceTimersByTimeAsync(200);
  expect(await pending).toBe("AbortError");
  expect(load).toHaveBeenCalledTimes(2);
});
