import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

const { requireConsoleMember, revealSuppression, liftSuppression, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  revealSuppression: vi.fn<(db: unknown, environment: string, id: string) => Promise<string>>(),
  liftSuppression: vi.fn<(db: unknown, environment: string, id: string, address: string) => Promise<void>>(async () => {}),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));
vi.mock("@/console/availability", () => ({ assertConsoleAvailable: () => {} }));
vi.mock("@/console/auth/db", () => ({ createConsoleDb: async () => ({ rpc: vi.fn() }), createConsoleServiceDb: () => ({ rpc: vi.fn() }) }));
vi.mock("@/console/announcements/suppressions", async (original) => ({ ...(await original<typeof import("@/console/announcements/suppressions")>()), revealSuppression, liftSuppression }));

import { POST as lift } from "@/app/console/api/announcements/suppressions/lift/route";
import { POST as reveal } from "@/app/console/api/announcements/suppressions/reveal/route";

// ---------------------------------------------------------------------------
// The two suppression routes. Reveal answers one address and nothing else; Lift
// must be told the address, which only a reveal (or an operator's own row) gives.
// Both carry the Admin floor and the same-origin check, and decide the
// environment themselves.
// ---------------------------------------------------------------------------

const OWNER: ConsoleMember = { userId: "a0000000-0000-4000-8000-000000000001", email: "asha@trakline.in", name: "Asha Rao", role: "owner", status: "active" };
const ID = "b0000000-0000-4000-8000-000000000002";
const m = consoleMessages.announcements.suppressions;

function post(path: string, body: unknown, origin = "https://admin.trakline.in"): Request {
  return new Request(`https://admin.trakline.in${path}`, { method: "POST", headers: { "content-type": "application/json", host: "admin.trakline.in", origin }, body: JSON.stringify(body) });
}

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(OWNER);
  revealSuppression.mockReset().mockResolvedValue("reader@example.in");
  liftSuppression.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/announcements/suppressions/reveal", () => {
  it("answers the address, under the server's environment, with the Admin floor", async () => {
    const response = await reveal(post("/api/announcements/suppressions/reveal", { id: ID }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, address: "reader@example.in" });
    expect(revealSuppression).toHaveBeenCalledWith(expect.anything(), "production", ID);
    expect(requireConsoleMember).toHaveBeenCalledWith("admin");
  });

  it("must not be cached: an address answered once must not sit in a shared cache", async () => {
    const response = await reveal(post("/api/announcements/suppressions/reveal", { id: ID }));
    expect(response.headers.get("cache-control") ?? "").toMatch(/no-store/);
  });

  it("refuses an id that is not one, and another origin", async () => {
    expect((await reveal(post("/api/announcements/suppressions/reveal", { id: "42" }))).status).toBe(400);
    expect((await reveal(post("/api/announcements/suppressions/reveal", { id: ID }, "https://evil.example"))).status).toBe(403);
    expect(revealSuppression).not.toHaveBeenCalled();
  });

  it("answers a row that is gone as not found", async () => {
    revealSuppression.mockRejectedValueOnce(new AppError("NOT_FOUND", m.errors.gone));
    const response = await reveal(post("/api/announcements/suppressions/reveal", { id: ID }));
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).toContain(m.errors.gone);
  });
});

describe("POST /api/announcements/suppressions/lift", () => {
  it("lifts by id and address, under the server's environment", async () => {
    const response = await lift(post("/api/announcements/suppressions/lift", { id: ID, address: "reader@example.in" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(liftSuppression).toHaveBeenCalledWith(expect.anything(), "production", ID, "reader@example.in");
  });

  it("refuses a lift that names no address: the id alone, which the list gives everyone, is not enough", async () => {
    expect((await lift(post("/api/announcements/suppressions/lift", { id: ID }))).status).toBe(400);
    expect(liftSuppression).not.toHaveBeenCalled();
  });

  it("answers the database's refusal of the wrong address in the console's words", async () => {
    liftSuppression.mockRejectedValueOnce(new AppError("INVALID_INPUT", m.errors.mismatch));
    const response = await lift(post("/api/announcements/suppressions/lift", { id: ID, address: "guess@example.in" }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(m.errors.mismatch);
  });

  it("refuses a field nobody asked for, and another origin", async () => {
    expect((await lift(post("/api/announcements/suppressions/lift", { id: ID, address: "reader@example.in", environment: "preview" }))).status).toBe(400);
    expect((await lift(post("/api/announcements/suppressions/lift", { id: ID, address: "reader@example.in" }, "https://evil.example"))).status).toBe(403);
    expect(liftSuppression).not.toHaveBeenCalled();
  });
});
