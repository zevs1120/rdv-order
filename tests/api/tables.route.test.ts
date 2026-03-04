import { describe, expect, it } from "vitest";
import { buildTables, splitTableNo, type OpenSessionRow } from "../../lib/tables-utils";

describe("tables route helpers", () => {
  it("splitTableNo should split merged table numbers safely", () => {
    expect(splitTableNo("01+02")).toEqual(["01", "02"]);
    expect(splitTableNo(" 01 + 02 + 03 ")).toEqual(["01", "02", "03"]);
    expect(splitTableNo("")).toEqual([]);
  });

  it("buildTables should hide secondary base table for merged sessions", () => {
    const rows: OpenSessionRow[] = [
      {
        session_id: "s1",
        session_table_no: "01+02",
        guest_count: 4,
        opened_at: "2026-03-04T10:00:00.000Z",
        table_no: "01"
      },
      {
        session_id: "s1",
        session_table_no: "01+02",
        guest_count: 4,
        opened_at: "2026-03-04T10:00:00.000Z",
        table_no: "02"
      },
      {
        session_id: "s2",
        session_table_no: "04",
        guest_count: 2,
        opened_at: "2026-03-04T10:15:00.000Z",
        table_no: "04"
      }
    ];

    const tables = buildTables(rows);
    const merged = tables.find((t) => t.tableNo === "01+02");

    expect(merged).toBeTruthy();
    expect(merged?.status).toBe("open");
    expect(merged?.guestCount).toBe(4);

    // 11 base tables total, table 02 hidden due to merge display.
    expect(tables).toHaveLength(10);
    expect(tables.some((t) => t.tableNo === "02")).toBe(false);
    expect(tables.some((t) => t.tableNo === "03")).toBe(true);
  });

  it("buildTables should fallback to session name split when mapping table rows are missing", () => {
    const rows: OpenSessionRow[] = [
      {
        session_id: "s3",
        session_table_no: "07+08",
        guest_count: 3,
        opened_at: "2026-03-04T11:00:00.000Z",
        table_no: null
      }
    ];

    const tables = buildTables(rows);
    const merged = tables.find((t) => t.tableNo === "07+08");
    expect(merged).toBeTruthy();
    expect(merged?.status).toBe("open");
    expect(merged?.baseTables).toEqual(["07", "08"]);
  });
});
