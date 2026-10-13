import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), connect: vi.fn(), prepare: vi.fn(), start: vi.fn(), after: vi.fn(), drain: vi.fn() }));
vi.mock("../../lib/permissions", () => ({ requireOrderCreate: mocks.auth }));
vi.mock("../../lib/db", () => ({ pool: { connect: mocks.connect } }));
vi.mock("../../lib/printing/service", () => ({ prepareReceiptDelivery: mocks.prepare }));
vi.mock("../../lib/printing/records", () => ({ sendPrint: mocks.start }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: mocks.after }));
import { POST } from "../../app/api/tables/print-bill/route";

const request = () => new Request("http://fixture/api/tables/print-bill", {
  method: "POST", headers: { "x-idempotency-key": "receipt-intent-1" },
  body: JSON.stringify({ tableNo: "06", sessionId: "session-06" })
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "actor" });
  mocks.connect.mockResolvedValue({ query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() });
  mocks.prepare.mockResolvedValue({ id: "job-1", status: "queued" });
  mocks.start.mockResolvedValue("accepted");
});

it("commits the bill snapshot before awaiting direct provider delivery", async () => {
  const response = await POST(request());
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({ ok: true, queued: true, jobId: "job-1", requestId: "receipt-intent-1" });
  expect(mocks.prepare).toHaveBeenCalledWith(expect.anything(), "actor", "receipt-intent-1", "06", "session-06");
  expect(mocks.start).toHaveBeenCalledWith("job-1");
  const tx = await mocks.connect.mock.results[0].value;
  expect(tx.query.mock.invocationCallOrder[1]).toBeLessThan(mocks.start.mock.invocationCallOrder[0]);
  expect(mocks.drain).not.toHaveBeenCalled();
  expect(mocks.after).not.toHaveBeenCalled();
});

it("returns the existing unknown intent without starting a second print", async () => {
  mocks.prepare.mockResolvedValue({ id: "job-1", status: "unknown" });
  expect(await (await POST(request())).json()).toMatchObject({ status: "unknown", requestId: "receipt-intent-1" });
  expect(mocks.start).not.toHaveBeenCalled();
});

it("does not create a print intent on authorization failure", async () => {
  mocks.auth.mockRejectedValue(new Error("UNAUTHORIZED"));
  expect((await POST(request())).status).toBe(401);
  expect(mocks.connect).not.toHaveBeenCalled();
});
