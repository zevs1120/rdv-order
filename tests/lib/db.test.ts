import { afterEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
const mocks = vi.hoisted(() => ({ instances: [] as Array<{ emit: (event: string, error: Error) => boolean }> }));
vi.mock("pg", () => ({ Pool: class extends EventEmitter {
  constructor() { super(); mocks.instances.push(this); }
  query() { return Promise.resolve({ rows: [] }); }
} }));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("handles idle pool errors without terminating or exposing connection details", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://fixture.invalid/test");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const { pool } = await import("../../lib/db");
  await pool.query("SELECT 1");
  expect(() => mocks.instances[0].emit("error", new Error("private connection detail"))).not.toThrow();
  expect(log).toHaveBeenCalledWith("Database idle connection lost; pool will replace it.");
  expect(log.mock.calls.flat().join(" ")).not.toContain("private connection detail");
});
