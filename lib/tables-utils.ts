export const TABLE_LAYOUT = [
  { tableNo: "01", column: 1, order: 1 },
  { tableNo: "02", column: 1, order: 2 },
  { tableNo: "03", column: 1, order: 3 },
  { tableNo: "04", column: 2, order: 4 },
  { tableNo: "05", column: 2, order: 5 },
  { tableNo: "06", column: 2, order: 6 },
  { tableNo: "07", column: 3, order: 7 },
  { tableNo: "08", column: 3, order: 8 },
  { tableNo: "09", column: 3, order: 9 },
  { tableNo: "10", column: 3, order: 10 },
  { tableNo: "11", column: 3, order: 11 }
] as const;

const TABLE_SET = new Set<string>(TABLE_LAYOUT.map((t) => t.tableNo));
const TABLE_ORDER = new Map<string, number>(TABLE_LAYOUT.map((t) => [t.tableNo, t.order]));
const TABLE_COLUMN = new Map<string, number>(TABLE_LAYOUT.map((t) => [t.tableNo, t.column]));

export type OpenSessionRow = {
  session_id: string;
  session_table_no: string;
  guest_count: number;
  opened_at: string;
  table_no: string | null;
};

export function splitTableNo(raw: string) {
  return raw
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function buildTables(rows: OpenSessionRow[]) {
  const group = new Map<string, OpenSessionRow[]>();
  for (const row of rows) {
    if (!group.has(row.session_id)) group.set(row.session_id, []);
    group.get(row.session_id)!.push(row);
  }

  const hiddenTables = new Set<string>();
  const openDisplays: Array<{
    tableNo: string;
    baseTables: string[];
    column: number;
    status: "open";
    guestCount: number;
    openedAt: string;
  }> = [];

  for (const sessionRows of group.values()) {
    const mapped = sessionRows
      .map((r) => r.table_no)
      .filter((t): t is string => Boolean(t))
      .flatMap((t) => splitTableNo(t))
      .filter((t) => TABLE_SET.has(t));

    const fallbackFromSessionName = splitTableNo(sessionRows[0].session_table_no)
      .filter((t) => TABLE_SET.has(t));

    const uniqueMapped = Array.from(new Set(mapped));
    const baseTables = uniqueMapped.length > 0
      ? uniqueMapped.sort((a, b) => (TABLE_ORDER.get(a) || 999) - (TABLE_ORDER.get(b) || 999))
      : fallbackFromSessionName;

    if (baseTables.length === 0) {
      continue;
    }

    const displayName = baseTables.join("+");
    const primary = baseTables[0];

    for (let i = 1; i < baseTables.length; i += 1) {
      hiddenTables.add(baseTables[i]);
    }

    openDisplays.push({
      tableNo: displayName,
      baseTables,
      column: TABLE_COLUMN.get(primary) || 1,
      status: "open",
      guestCount: sessionRows[0].guest_count,
      openedAt: sessionRows[0].opened_at
    });
  }

  const openByPrimary = new Map<string, (typeof openDisplays)[number]>();
  for (const item of openDisplays) {
    openByPrimary.set(item.baseTables[0], item);
  }

  return TABLE_LAYOUT
    .filter((base) => !hiddenTables.has(base.tableNo))
    .map((base) => {
      const open = openByPrimary.get(base.tableNo);
      if (open) {
        return {
          tableNo: open.tableNo,
          baseTables: open.baseTables,
          column: open.column,
          status: "open" as const,
          guestCount: open.guestCount,
          openedAt: open.openedAt
        };
      }
      return {
        tableNo: base.tableNo,
        baseTables: [base.tableNo],
        column: base.column,
        status: "idle" as const,
        guestCount: null,
        openedAt: null
      };
    });
}
