import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

const { requireConsoleMember, actOnAccount, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  actOnAccount: vi.fn<(db: unknown, act: string, environment: string, id: string, value: string, reason: string) => Promise<void>>(),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));
vi.mock("@/console/availability", () => ({ assertConsoleAvailable: () => {} }));
vi.mock("@/console/auth/db", () => ({ createConsoleDb: async () => ({ rpc: vi.fn() }), createConsoleServiceDb: () => ({ rpc: vi.fn() }) }));
vi.mock("@/console/accounts/accounts", async (original) => ({ ...(await original<typeof import("@/console/accounts/accounts")>()), actOnAccount }));

import { POST as disable } from "@/app/console/api/accounts/disable/route";
import { POST as enable } from "@/app/console/api/accounts/enable/route";
import { POST as signOut } from "@/app/console/api/accounts/sign-out/route";

// ---------------------------------------------------------------------------
// Module 08's three routes behind a reason and a key. None spends the tap: the
// database does, re-digesting the very strings these routes pass through. So
// the one thing a route must never do is reshape them.
// ---------------------------------------------------------------------------

const ADMIN: ConsoleMember = { userId: "a0000000-0000-4000-8000-000000000002", email: "rohan@trakline.in", name: "Rohan Iyer", role: "admin", status: "active" };
const ID = "c1111111-1111-4111-8111-111111111111";
const REASON = "Reported a lost phone and asked us to sign it out.";
const VALUE = '{"environment":"production"}';
const m = consoleMessages;

function post(path: string, body: unknown, origin = "https://admin.trakline.in"): Request {
  return new Request(`https://admin.trakline.in${path}`, { method: "POST", headers: { "content-type": "application/json", host: "admin.trakline.in", origin }, body: JSON.stringify(body) });
}

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(ADMIN);
  actOnAccount.mockReset().mockResolvedValue(undefined);
});

describe.each([
  ["sign-out", "signOut", signOut],
  ["disable", "disable", disable],
  ["enable", "enable", enable],
] as const)("POST /api/accounts/%s", (path, act, route) => {
  const url = `/api/accounts/${path}`;

  it("passes the id, the value and the reason through as the tap was minted over them, with the Admin floor", async () => {
    const response = await route(post(url, { id: ID, value: VALUE, reason: REASON }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(actOnAccount).toHaveBeenCalledWith(expect.anything(), act, "production", ID, VALUE, REASON);
    expect(requireConsoleMember).toHaveBeenCalledWith("admin");
    expect(response.headers.get("cache-control") ?? "").toMatch(/no-store/);
  });

  it("trims the reason exactly as the tap's own schema does, and nothing else", async () => {
    await route(post(url, { id: ID, value: VALUE, reason: `  ${REASON}  ` }));
    expect(actOnAccount).toHaveBeenCalledWith(expect.anything(), act, "production", ID, VALUE, REASON);
  });

  it("refuses a reason too short to be one, in the dialog's own words, before asking the database", async () => {
    const response = await route(post(url, { id: ID, value: VALUE, reason: "no" }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(m.tap.reasonShort);
    expect(actOnAccount).not.toHaveBeenCalled();
  });

  it("refuses an id that is not an account's, a value that is not an object, an extra field, and another origin", async () => {
    expect((await route(post(url, { id: "p:a1111111-1111-4111-8111-111111111111", value: VALUE, reason: REASON }))).status).toBe(400);
    expect((await route(post(url, { id: ID, value: "production", reason: REASON }))).status).toBe(400);
    expect((await route(post(url, { id: ID, value: VALUE, reason: REASON, environment: "preview" }))).status).toBe(400);
    expect((await route(post(url, { id: ID, value: VALUE, reason: REASON }, "https://evil.example"))).status).toBe(403);
    expect(actOnAccount).not.toHaveBeenCalled();
  });

  it("does nothing for a role below the floor", async () => {
    requireConsoleMember.mockRejectedValueOnce(new AppError("INVALID_INPUT", m.accounts.errors.noAccess, { status: 403 }));
    expect((await route(post(url, { id: ID, value: VALUE, reason: REASON }))).status).toBe(403);
    expect(actOnAccount).not.toHaveBeenCalled();
  });

  it("answers the database's refusal in the console's words", async () => {
    actOnAccount.mockRejectedValueOnce(new AppError("INVALID_INPUT", m.accounts.confirm.tapMismatch, { status: 403 }));
    const response = await route(post(url, { id: ID, value: VALUE, reason: REASON }));
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).toContain(m.accounts.confirm.tapMismatch);
  });
});
