import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember } from "@/console/auth/member";
import { AppError } from "@/services/errors";

const { requireConsoleMember, blockAddress, unblockAddress, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  blockAddress: vi.fn<(ask: unknown, deps: unknown) => Promise<void>>(async () => {}),
  unblockAddress: vi.fn<(ask: unknown, deps: unknown) => Promise<void>>(async () => {}),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));
vi.mock("@/console/availability", () => ({ assertConsoleAvailable: () => {} }));
vi.mock("@/console/abuse/blocks", () => ({ blockAddress, unblockAddress }));
vi.mock("@/console/auth/db", () => ({ createConsoleDb: async () => ({ rpc: vi.fn() }), createConsoleServiceDb: () => ({ rpc: vi.fn() }) }));

import { POST as block } from "@/app/console/api/abuse/block/route";
import { POST as hash } from "@/app/console/api/abuse/hash/route";
import { POST as unblock } from "@/app/console/api/abuse/unblock/route";

// ---------------------------------------------------------------------------
// Module 04's three routes. Each carries the Admin floor itself (a route has no
// frame to draw a no-access state in), the same-origin check every mutating
// console route has, and decides the environment itself — never the caller.
// ---------------------------------------------------------------------------

const OWNER: ConsoleMember = { userId: "a0000000-0000-4000-8000-000000000001", email: "asha@trakline.in", name: "Asha Rao", role: "owner", status: "active" };
const MEMBER = `4.${"a".repeat(43)}`;
const REASON = "Scripted checks from one address all morning";

function post(path: string, body: unknown, origin = "https://admin.trakline.in"): Request {
  return new Request(`https://admin.trakline.in${path}`, { method: "POST", headers: { "content-type": "application/json", host: "admin.trakline.in", origin }, body: JSON.stringify(body) });
}

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(OWNER);
  blockAddress.mockClear();
  unblockAddress.mockClear();
});

describe("POST /api/abuse/hash", () => {
  it("answers with the hash an address is stored under, and never the address", async () => {
    const response = await hash(post("/api/abuse/hash", { address: "203.0.113.9" }));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ ok: true, member: expect.stringMatching(/^4\.[A-Za-z0-9_-]{43}$/) });
    expect(text).not.toContain("203.0.113.9");
  });

  it("gives an IPv6 address its /64's hash", async () => {
    const one = await (await hash(post("/api/abuse/hash", { address: "2001:db8:0:1::5" }))).json();
    const two = await (await hash(post("/api/abuse/hash", { address: "2001:db8:0:1::9" }))).json();
    expect(one.member).toMatch(/^6\./);
    expect(one.member).toBe(two.member);
  });

  it("refuses something that is not one address, in the sheet's words", async () => {
    const response = await hash(post("/api/abuse/hash", { address: "not an address" }));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe("Enter one IPv4 or IPv6 address.");
  });

  it("carries the Admin floor and the same-origin check", async () => {
    await hash(post("/api/abuse/hash", { address: "203.0.113.9" }));
    expect(requireConsoleMember).toHaveBeenCalledWith("admin");
    expect((await hash(post("/api/abuse/hash", { address: "203.0.113.9" }, "https://evil.example"))).status).toBe(403);
  });
});

describe("POST /api/abuse/block", () => {
  const GOOD = { member: MEMBER, duration: "24h", note: "Scripted checks", reason: REASON };

  it("blocks under this deployment's environment, as the signed-in member", async () => {
    const response = await block(post("/api/abuse/block", GOOD));
    expect(response.status).toBe(200);
    expect(blockAddress).toHaveBeenCalledWith(
      expect.objectContaining({ member: MEMBER, duration: "24h", note: "Scripted checks", reason: REASON, environment: "production", actor: { userId: OWNER.userId, name: OWNER.name, role: OWNER.role } }),
      expect.anything(),
    );
  });

  it("refuses a raw address, an unknown duration, a long note and a caller-chosen environment", async () => {
    for (const bad of [
      { ...GOOD, member: "203.0.113.9" },
      { ...GOOD, duration: "forever" },
      { ...GOOD, note: "x".repeat(201) },
      { ...GOOD, environment: "preview" },
    ]) {
      expect((await block(post("/api/abuse/block", bad))).status, JSON.stringify(bad).slice(0, 60)).toBe(400);
    }
    expect(blockAddress).not.toHaveBeenCalled();
  });

  it("passes the console's own refusal through", async () => {
    blockAddress.mockRejectedValueOnce(new AppError("SOURCE_UNAVAILABLE", "Not blocked: the shared store didn't answer. Nothing changed."));
    const response = await block(post("/api/abuse/block", GOOD));
    expect(response.status).toBe(503);
    expect((await response.json()).message).toMatch(/Not blocked/);
  });

  it("carries the Admin floor", async () => {
    requireConsoleMember.mockRejectedValue(new AppError("INVALID_INPUT", "You don't have access to this.", { status: 403 }));
    expect((await block(post("/api/abuse/block", GOOD))).status).toBe(403);
    expect(blockAddress).not.toHaveBeenCalled();
  });
});

describe("POST /api/abuse/unblock", () => {
  it("lifts a block under this deployment's environment", async () => {
    const response = await unblock(post("/api/abuse/unblock", { member: MEMBER, reason: REASON }));
    expect(response.status).toBe(200);
    expect(unblockAddress).toHaveBeenCalledWith(expect.objectContaining({ member: MEMBER, reason: REASON, environment: "production" }), expect.anything());
  });

  it("refuses anything but a hash", async () => {
    expect((await unblock(post("/api/abuse/unblock", { member: "203.0.113.9", reason: REASON }))).status).toBe(400);
  });
});
