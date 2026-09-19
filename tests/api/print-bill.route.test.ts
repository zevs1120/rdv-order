import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ dispatch: vi.fn(), auth: vi.fn(), audit: vi.fn(), after: vi.fn() }));
vi.mock("../../lib/permissions", () => ({ requireOrderCreate: mocks.auth }));
vi.mock("../../lib/audit", () => ({ writeAuditLogSafe: mocks.audit }));
vi.mock("../../lib/print", async original => ({ ...await original<typeof import("../../lib/print")>(), dispatchTableBillPrint: mocks.dispatch }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: mocks.after }));
import { POST } from "../../app/api/tables/print-bill/route";
import { PrintDispatchError } from "../../lib/print";
const req = (waitForResult = true) => new Request("http://fixture/api/tables/print-bill", { method: "POST", body: JSON.stringify({ tableNo: "06", waitForResult }) });
describe("bill delivery response", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ userId: "fixture" }); mocks.dispatch.mockReset(); });
  it("waits for actual provider acceptance before returning success", async () => {
    let resolve!: (value: unknown) => void;
    mocks.dispatch.mockReturnValue(new Promise(r => { resolve = r; }));
    let completed = false; const pending = POST(req()).then(r => { completed = true; return r; });
    await vi.waitFor(() => expect(mocks.dispatch).toHaveBeenCalled()); expect(completed).toBe(false);
    resolve({ provider: "xpyun", slot: "primary", remoteJobId: "cloud-1" });
    expect(await (await pending).json()).toMatchObject({ accepted: true, remoteJobId: "cloud-1" }); expect(mocks.after).not.toHaveBeenCalled();
  });
  it("returns unknown result to the app and records the failure", async () => {
    mocks.dispatch.mockRejectedValue(new PrintDispatchError("timeout", false, "unknown"));
    expect((await POST(req())).status).toBe(504);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "table.print_receipt_failed" }));
  });
  it("preserves older APK short-request behavior during rollout", async () => {
    mocks.dispatch.mockResolvedValue({ provider: "xpyun", slot: "primary" });
    expect((await POST(req(false))).status).toBe(202); expect(mocks.dispatch).not.toHaveBeenCalled();
    await mocks.after.mock.calls[0][0](); expect(mocks.dispatch).toHaveBeenCalledTimes(1);
  });
  it("does not print on authorization failure", async () => {
    mocks.auth.mockRejectedValue(new Error("UNAUTHORIZED")); expect((await POST(req())).status).toBe(401); expect(mocks.dispatch).not.toHaveBeenCalled();
  });
});
