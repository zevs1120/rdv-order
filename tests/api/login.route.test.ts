import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  hashPin: vi.fn(),
  signToken: vi.fn()
}));

vi.mock("../../lib/db", () => ({
  pool: {
    query: mocks.poolQuery
  }
}));

vi.mock("../../lib/security", () => ({
  hashPin: mocks.hashPin
}));

vi.mock("../../lib/auth", () => ({
  signToken: mocks.signToken
}));

import { POST } from "../../app/api/login/route";

function makeRequest(username: string, pin: string) {
  return new Request("http://localhost/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, pin })
  });
}

describe("login api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signToken.mockResolvedValue("token-123");
  });

  it("accepts username case-insensitively and trims whitespace", async () => {
    mocks.poolQuery.mockResolvedValue({
      rows: [{ id: "u-1", role: "waiter", pin_salt: "salt-1", pin_hash: "hash-1" }]
    });
    mocks.hashPin.mockReturnValue("hash-1");

    const res = await POST(makeRequest("  joy  ", "12345"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ token: "token-123", role: "waiter" });
    expect(String(mocks.poolQuery.mock.calls[0]?.[0] || "")).toContain("lower(username) = lower($1)");
    expect(mocks.poolQuery.mock.calls[0]?.[1]).toEqual(["joy"]);
    expect(mocks.hashPin).toHaveBeenCalledWith("12345", "salt-1");
  });

  it("rejects invalid pin", async () => {
    mocks.poolQuery.mockResolvedValue({
      rows: [{ id: "u-1", role: "waiter", pin_salt: "salt-1", pin_hash: "hash-1" }]
    });
    mocks.hashPin.mockReturnValue("wrong-hash");

    const res = await POST(makeRequest("Joy", "bad"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("账号或 PIN 错误");
  });
});
