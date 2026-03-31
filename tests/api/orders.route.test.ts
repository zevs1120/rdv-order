import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  connect: vi.fn(),
  requirePermission: vi.fn(),
  runPrintWorker: vi.fn(),
  writeAuditLogSafe: vi.fn()
}));

vi.mock("../../lib/db", () => ({
  pool: {
    query: mocks.poolQuery,
    connect: mocks.connect
  }
}));

vi.mock("../../lib/permissions", () => ({
  requirePermission: mocks.requirePermission
}));

vi.mock("../../lib/print-worker", () => ({
  runPrintWorker: mocks.runPrintWorker
}));

vi.mock("../../lib/audit", () => ({
  writeAuditLogSafe: mocks.writeAuditLogSafe
}));

import { POST } from "../../app/api/orders/route";
import { buildItemSignature, parseItems } from "../../lib/orders-utils";

const dishIdA = "11111111-1111-4111-8111-111111111111";
const dishIdB = "22222222-2222-4222-8222-222222222222";

function makeRequest(idempotencyKey?: string) {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (idempotencyKey) headers["x-idempotency-key"] = idempotencyKey;
  return new Request("http://localhost/api/orders", {
    method: "POST",
    headers,
    body: JSON.stringify({
      tableNo: "01",
      items: [
        { menuItemId: dishIdA, qty: 1, note: "no onion" },
        { menuItemId: dishIdB, qty: 2, note: null }
      ]
    })
  });
}

function makeClientForNewOrder() {
  const release = vi.fn();
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) {
      return { rows: [] };
    }
    if (sql.includes("FROM table_sessions") && sql.includes("FOR UPDATE")) {
      return { rows: [{ id: "session-1" }] };
    }
    if (sql.includes("string_agg") && sql.includes("FROM orders o")) {
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO orders") && sql.includes("client_request_id") && sql.includes("NULL")) {
      return { rows: [{ id: "order-new-1" }] };
    }
    if (sql.includes("DELETE FROM order_charges") && sql.includes("source = 'rule_auto'")) {
      return { rows: [] };
    }
    if (sql.includes("SUM(oi.qty * mi.price)")) {
      return { rows: [{ item_amount: 450 }] };
    }
    if (sql.includes("FROM pricing_rules") && sql.includes("charge_type") && sql.includes("mode")) {
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO order_items")) {
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO order_events")) {
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO print_jobs")) {
      return { rows: [] };
    }
    throw new Error(`Unhandled SQL in test(new-order): ${sql.slice(0, 120)}`);
  });
  return { query, release };
}

function makeClientForIdempotencyHit() {
  const release = vi.fn();
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("BEGIN") || sql.includes("COMMIT") || sql.includes("ROLLBACK")) {
      return { rows: [] };
    }
    if (sql.includes("FROM table_sessions") && sql.includes("FOR UPDATE")) {
      return { rows: [{ id: "session-1" }] };
    }
    if (sql.includes("WHERE waiter_id = $1") && sql.includes("client_request_id = $2")) {
      return { rows: [{ id: "order-existing-1" }] };
    }
    if (sql.includes("INSERT INTO print_jobs") && sql.includes("DO NOTHING")) {
      return { rows: [] };
    }
    throw new Error(`Unhandled SQL in test(idempotency-hit): ${sql.slice(0, 120)}`);
  });
  return { query, release };
}

describe("orders api route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ userId: "u-1", role: "waiter" });
    mocks.poolQuery.mockResolvedValue({ rows: [{ id: dishIdA }, { id: dishIdB }] });
    mocks.runPrintWorker.mockResolvedValue({ picked: 1, printed: 1, failed: 0 });
    mocks.writeAuditLogSafe.mockResolvedValue(undefined);
  });

  it("parseItems should merge duplicate line items by dish+note", () => {
    const parsed = parseItems([
      { menuItemId: dishIdA, qty: 1, note: "no onion" },
      { menuItemId: dishIdA, qty: 2, note: "no onion" },
      { menuItemId: dishIdA, qty: 1, note: "extra spicy" }
    ]);

    expect(parsed).toHaveLength(2);
    expect(parsed.find((row) => row.note === "no onion")?.qty).toBe(3);
    expect(parsed.find((row) => row.note === "extra spicy")?.qty).toBe(1);
  });

  it("buildItemSignature should be stable regardless of item order", () => {
    const a = buildItemSignature([
      { menuItemId: dishIdA, qty: 1, note: "N" },
      { menuItemId: dishIdB, qty: 2, note: null }
    ]);
    const b = buildItemSignature([
      { menuItemId: dishIdB, qty: 2, note: null },
      { menuItemId: dishIdA, qty: 1, note: "n" }
    ]);
    expect(a).toBe(b);
  });

  it("POST should create new order and kick print worker once", async () => {
    const client = makeClientForNewOrder();
    mocks.connect.mockResolvedValue(client);

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.orderId).toBe("order-new-1");
    expect(body.deduped).toBe(false);
    expect(mocks.runPrintWorker).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("POST idempotency hit should not trigger duplicate print worker", async () => {
    const client = makeClientForIdempotencyHit();
    mocks.connect.mockResolvedValue(client);

    const res = await POST(makeRequest("idem_12345678"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.orderId).toBe("order-existing-1");
    expect(body.deduped).toBe(true);
    expect(body.dedupeReason).toBe("idempotency");
    expect(mocks.runPrintWorker).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledTimes(1);

    const printInsertCalls = client.query.mock.calls.filter(
      (args: unknown[]) => typeof args[0] === "string" && (args[0] as string).includes("INSERT INTO print_jobs")
    );
    expect(printInsertCalls).toHaveLength(1);
    expect(String(printInsertCalls[0][0])).toContain("DO NOTHING");
  });
});
