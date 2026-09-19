import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
const mocks = vi.hoisted(() => ({ instances: [] as Array<{ emit: (event: string, error: Error) => boolean; options: Record<string, unknown> }> }));
vi.mock("pg", () => ({ Pool: class extends EventEmitter {
  constructor(readonly options: Record<string, unknown>) { super(); mocks.instances.push(this); }
  query() { return Promise.resolve({ rows: [] }); }
} }));
beforeEach(() => { vi.resetModules(); mocks.instances.length = 0; });
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

it("isolates bounded print metadata from the unchanged business connection pool", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://fixture.invalid/test");
  vi.stubEnv("DB_POOL_MAX", "6");
  vi.stubEnv("DB_CONNECT_TIMEOUT_MS", "4000");
  vi.stubEnv("DB_STATEMENT_TIMEOUT_MS", "12000");
  vi.stubEnv("DB_IDLE_TIMEOUT_MS", "");
  const { pool, printMetadataPool } = await import("../../lib/db");
  await printMetadataPool.query("SELECT 1");
  await pool.query("SELECT 1");
  await printMetadataPool.query("SELECT 1");
  expect(mocks.instances).toHaveLength(2);
  expect(mocks.instances[0].options).toMatchObject({ max: 1, connectionTimeoutMillis: 1000, statement_timeout: 1500, query_timeout: 2000 });
  expect(mocks.instances[1].options).toMatchObject({ max: 6, connectionTimeoutMillis: 4000, statement_timeout: 12000, idleTimeoutMillis: 30000 });
  expect(mocks.instances[1].options).not.toHaveProperty("query_timeout");
});

it("honors an explicitly configured idle lifetime", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://fixture.invalid/test");
  vi.stubEnv("DB_IDLE_TIMEOUT_MS", "10000");
  const { pool } = await import("../../lib/db");
  await pool.query("SELECT 1");
  expect(mocks.instances[0].options.idleTimeoutMillis).toBe(10000);
});
