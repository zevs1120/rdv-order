import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("../../lib/db", () => ({ pool: {} }));
import { savePrint, sendPrint, type PrintDb } from "../../lib/printing/records";
import { PrintError } from "../../lib/printing/xpyun";
let db: PGlite;
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(readFileSync(new URL("../../db/schema.sql", import.meta.url), "utf8").replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", ""));
  for (const file of ["026_print_deliveries.sql", "027_direct_printing.sql"]) await db.exec(readFileSync(new URL("../../db/migrations/" + file, import.meta.url), "utf8"));
}, 20000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("TRUNCATE print_deliveries"); });
const save = (key: string) => savePrint(db, { kind: "self_test", intentKey: key, printerSn: "fixture", content: "TEST", snapshot: {} });
it("claims each intent once under concurrent direct calls", async () => {
  const job = await save("one");
  const print = vi.fn().mockResolvedValue("remote-1");
  await Promise.all([sendPrint(job.id, db, () => ({ print })), sendPrint(job.id, db, () => ({ print }))]);
  expect(print).toHaveBeenCalledTimes(1);
  expect((await db.query("SELECT status, remote_id FROM print_deliveries")).rows[0]).toMatchObject({ status: "accepted", remote_id: "remote-1" });
});
it("independent orders do not block one another behind the deleted printer-wide worker lock", async () => {
  const a = await save("one"), b = await save("two");
  let unblock!: () => void;
  const barrier = new Promise<void>(r => { unblock = r; });
  const print = vi.fn(async () => { if (print.mock.calls.length === 2) unblock(); await barrier; return "remote-1"; });
  await Promise.all([sendPrint(a.id, db, () => ({ print })), sendPrint(b.id, db, () => ({ print }))]);
  expect(print).toHaveBeenCalledTimes(2);
});
it("unknown outcomes stop rather than scheduling a resend", async () => {
  const job = await save("one"); const print = vi.fn().mockRejectedValue(new PrintError(false));
  expect(await sendPrint(job.id, db, () => ({ print }))).toBe("unknown");
  await sendPrint(job.id, db, () => ({ print }));
  expect(print).toHaveBeenCalledTimes(1);
});
it("a failed persistence after cloud acceptance cannot call the provider again", async () => {
  const job = await save("one"); const print = vi.fn().mockResolvedValue("remote-1");
  const faulty: PrintDb = { query: (sql, params) => sql.includes("status = 'accepted'") ? Promise.reject(new Error("DB down")) : db.query(sql, params) };
  expect(await sendPrint(job.id, faulty, () => ({ print }))).toBe("unknown");
  await sendPrint(job.id, db, () => ({ print })); expect(print).toHaveBeenCalledTimes(1);
});
it("preserves immutable snapshots and refuses historical queue records", async () => {
  const first = await save("same"); expect((await save("same")).id).toBe(first.id);
  await expect(db.query("UPDATE print_deliveries SET content = 'changed' WHERE id = $1", [first.id])).rejects.toThrow("immutable");
  await db.query("INSERT INTO print_deliveries (kind,intent_key,printer_sn,content,snapshot,content_sha256,provider_key) VALUES ('self_test','old','fixture','old','{}',repeat('a',64),repeat('b',48))");
  const old = (await db.query<{id: string}>("SELECT id FROM print_deliveries WHERE intent_key = 'old'")).rows[0];
  const print = vi.fn(); await sendPrint(old.id, db, () => ({ print })); expect(print).not.toHaveBeenCalled();
});
