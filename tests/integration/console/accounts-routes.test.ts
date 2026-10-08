import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

const { requireConsoleMember, findAccount, revealAccount, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  findAccount: vi.fn<(db: unknown, environment: string, email: string) => Promise<unknown>>(),
  revealAccount: vi.fn<(db: unknown, environment: string, id: string) => Promise<string>>(),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));
vi.mock("@/console/availability", () => ({ assertConsoleAvailable: () => {} }));
vi.mock("@/console/auth/db", () => ({ createConsoleDb: async () => ({ rpc: vi.fn() }), createConsoleServiceDb: () => ({ rpc: vi.fn() }) }));
vi.mock("@/console/accounts/accounts", async (original) => ({ ...(await original<typeof import("@/console/accounts/accounts")>()), findAccount, revealAccount }));

import { POST as find } from "@/app/console/api/accounts/find/route";
import { POST as reveal } from "@/app/console/api/accounts/reveal/route";

// ---------------------------------------------------------------------------
// Module 08's two routes. Both are POSTs, though neither changes an account:
// each writes an audit row every time, and an address must never sit in a URL
// or a cache. Both carry the Admin floor and the same-origin check.
// ---------------------------------------------------------------------------

const ADMIN: ConsoleMember = { userId: "a0000000-0000-4000-8000-000000000002", email: "rohan@trakline.in", name: "Rohan Iyer", role: "admin", status: "active" };
const ID = "c1111111-1111-4111-8111-111111111111";
const ROW = {
  id: ID, email: "a•••@example.com", createdAt: "2026-09-05T04:00:00+00:00", lastSignInAt: "2026-09-18T15:42:00+00:00",
  emailLink: true, google: false, passkeys: 1, savedPnrs: 3, news: "subscribed", disabled: false, leadId: "p:a1111111-1111-4111-8111-111111111111",
};
const m = consoleMessages.accounts;

function post(path: string, body: unknown, origin = "https://admin.trakline.in"): Request {
  return new Request(`https://admin.trakline.in${path}`, { method: "POST", headers: { "content-type": "application/json", host: "admin.trakline.in", origin }, body: JSON.stringify(body) });
}

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(ADMIN);
  findAccount.mockReset().mockResolvedValue(ROW);
  revealAccount.mockReset().mockResolvedValue("asha.verma@example.com");
});

describe("POST /api/accounts/find", () => {
  it("answers the masked row, under the server's environment, with the Admin floor", async () => {
    const response = await find(post("/api/accounts/find", { email: "  Asha.Verma@example.com " }));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ ok: true, account: ROW });
    expect(text, "the answer never echoes the address that was searched for").not.toMatch(/asha\.verma@example\.com/i);
    expect(findAccount).toHaveBeenCalledWith(expect.anything(), "production", "Asha.Verma@example.com");
    expect(requireConsoleMember).toHaveBeenCalledWith("admin");
    expect(response.headers.get("cache-control") ?? "").toMatch(/no-store/);
  });

  it("answers null when no account has that address", async () => {
    findAccount.mockResolvedValueOnce(null);
    expect(await (await find(post("/api/accounts/find", { email: "nobody@example.com" }))).json()).toEqual({ ok: true, account: null });
  });

  it("refuses something that is not a whole address, before asking the database", async () => {
    const response = await find(post("/api/accounts/find", { email: "asha" }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(m.errors.notAddress);
    expect(findAccount).not.toHaveBeenCalled();
  });

  it("refuses a field nobody asked for, and another origin", async () => {
    expect((await find(post("/api/accounts/find", { email: "a@example.com", environment: "preview" }))).status).toBe(400);
    expect((await find(post("/api/accounts/find", { email: "a@example.com" }, "https://evil.example"))).status).toBe(403);
    expect(findAccount).not.toHaveBeenCalled();
  });

  it("does nothing for a role below the floor", async () => {
    requireConsoleMember.mockRejectedValueOnce(new AppError("INVALID_INPUT", m.errors.noAccess, { status: 403 }));
    expect((await find(post("/api/accounts/find", { email: "a@example.com" }))).status).toBe(403);
    expect(findAccount).not.toHaveBeenCalled();
  });
});

describe("POST /api/accounts/reveal", () => {
  it("answers the address, uncached, with the Admin floor", async () => {
    const response = await reveal(post("/api/accounts/reveal", { id: ID }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, address: "asha.verma@example.com" });
    expect(revealAccount).toHaveBeenCalledWith(expect.anything(), "production", ID);
    expect(requireConsoleMember).toHaveBeenCalledWith("admin");
    expect(response.headers.get("cache-control") ?? "").toMatch(/no-store/);
  });

  it("refuses an id that is not an account's, and another origin", async () => {
    expect((await reveal(post("/api/accounts/reveal", { id: "42" }))).status).toBe(400);
    expect((await reveal(post("/api/accounts/reveal", { id: "p:a1111111-1111-4111-8111-111111111111" }))).status).toBe(400);
    expect((await reveal(post("/api/accounts/reveal", { id: ID }, "https://evil.example"))).status).toBe(403);
    expect(revealAccount).not.toHaveBeenCalled();
  });

  it("answers an account that is gone as not found", async () => {
    revealAccount.mockRejectedValueOnce(new AppError("NOT_FOUND", m.errors.gone));
    const response = await reveal(post("/api/accounts/reveal", { id: ID }));
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).toContain(m.errors.gone);
  });
});
