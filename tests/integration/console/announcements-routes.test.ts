import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleMember } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

const { requireConsoleMember, saveLetter, queueLetter, stopLetter, sendTest, consoleEnvironment } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  saveLetter: vi.fn<(db: unknown, letter: unknown) => Promise<string>>(),
  queueLetter: vi.fn<(db: unknown, environment: string, id: string) => Promise<number>>(),
  stopLetter: vi.fn<(db: unknown, environment: string, id: string) => Promise<void>>(async () => {}),
  sendTest: vi.fn<(ask: unknown, deps: unknown) => Promise<void>>(async () => {}),
  consoleEnvironment: vi.fn<() => string>(() => "production"),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/auth/session", () => ({ consoleEnvironment }));
vi.mock("@/console/availability", () => ({ assertConsoleAvailable: () => {} }));
vi.mock("@/console/auth/db", () => ({ createConsoleDb: async () => ({ rpc: vi.fn() }), createConsoleServiceDb: () => ({ rpc: vi.fn() }) }));
vi.mock("@/console/announcements/letters", async (original) => ({ ...(await original<typeof import("@/console/announcements/letters")>()), saveLetter, queueLetter, stopLetter }));
vi.mock("@/console/announcements/test-send", () => ({ sendTest }));
vi.mock("@/services/email/suppression", () => ({ sendToAddress: vi.fn() }));

import { POST as queue } from "@/app/console/api/announcements/queue/route";
import { POST as save } from "@/app/console/api/announcements/save/route";
import { POST as stop } from "@/app/console/api/announcements/stop/route";
import { POST as test } from "@/app/console/api/announcements/test/route";

// ---------------------------------------------------------------------------
// Module 07's four routes. Each carries the Admin floor itself (a route has no
// frame to draw a no-access state in), the same-origin check every mutating
// console route has, and decides the environment and the recipient itself —
// never the caller.
// ---------------------------------------------------------------------------

const OWNER: ConsoleMember = { userId: "a0000000-0000-4000-8000-000000000001", email: "asha@trakline.in", name: "Asha Rao", role: "owner", status: "active" };
const ID = "b0000000-0000-4000-8000-000000000002";
const m = consoleMessages.announcements;

function post(path: string, body: unknown, origin = "https://admin.trakline.in"): Request {
  return new Request(`https://admin.trakline.in${path}`, { method: "POST", headers: { "content-type": "application/json", host: "admin.trakline.in", origin }, body: JSON.stringify(body) });
}

/**
 * The same request on the local console host. The test route works out the traveller site's origin
 * from its own host, and outside production the only host that has one is localhost.
 */
function local(path: string, body: unknown): Request {
  return new Request(`http://admin.localhost:4211${path}`, { method: "POST", headers: { "content-type": "application/json", host: "admin.localhost:4211", origin: "http://admin.localhost:4211" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(OWNER);
  saveLetter.mockReset().mockResolvedValue(ID);
  queueLetter.mockReset().mockResolvedValue(431);
  stopLetter.mockClear();
  sendTest.mockClear();
});

describe("POST /api/announcements/save", () => {
  it("saves a new draft and answers its id", async () => {
    const response = await save(post("/api/announcements/save", { list: "news", subject: "  What is coming ", body: "Hello" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: ID });
    expect(saveLetter).toHaveBeenCalledWith(expect.anything(), { list: "news", subject: "What is coming", body: "Hello" });
    expect(requireConsoleMember).toHaveBeenCalledWith("admin");
  });

  it("passes an existing draft's id through", async () => {
    await save(post("/api/announcements/save", { id: ID, list: "news", subject: "S", body: "B" }));
    expect(saveLetter).toHaveBeenCalledWith(expect.anything(), { id: ID, list: "news", subject: "S", body: "B" });
  });

  it.each([
    [{ list: "news", subject: "", body: "B" }, m.compose.subjectNeeded],
    [{ list: "news", subject: "x".repeat(201), body: "B" }, m.compose.subjectTooLong],
    [{ list: "news", subject: "S", body: "   " }, m.compose.bodyNeeded],
    [{ list: "news", subject: "S", body: "x".repeat(20001) }, m.compose.bodyTooLong],
  ])("refuses %j in the form's own words", async (body, shown) => {
    const response = await save(post("/api/announcements/save", body));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(shown);
    expect(saveLetter).not.toHaveBeenCalled();
  });

  it("refuses a field nobody asked for: the caller never names a member or an environment", async () => {
    const response = await save(post("/api/announcements/save", { list: "news", subject: "S", body: "B", environment: "preview" }));
    expect(response.status).toBe(400);
  });

  it("refuses another origin", async () => {
    const response = await save(post("/api/announcements/save", { list: "news", subject: "S", body: "B" }, "https://evil.example"));
    expect(response.status).toBe(403);
    expect(saveLetter).not.toHaveBeenCalled();
  });

  it("refuses a role below Admin", async () => {
    requireConsoleMember.mockRejectedValueOnce(new AppError("INVALID_INPUT", "no access", { status: 403 }));
    expect((await save(post("/api/announcements/save", { list: "news", subject: "S", body: "B" }))).status).toBe(403);
  });
});

describe("POST /api/announcements/test", () => {
  it("sends to the signed-in member's own address, from the traveller side's sender, under this environment", async () => {
    const response = await test(local("/api/announcements/test", { id: ID }));
    expect(response.status).toBe(200);
    const [ask] = sendTest.mock.calls[0]!;
    expect(ask).toMatchObject({ id: ID, to: "asha@trakline.in", environment: "production", origin: "http://localhost:4211" });
  });

  it("sends nothing from a host with no traveller site behind it: the unsubscribe line would link nowhere", async () => {
    const response = await test(post("/api/announcements/test", { id: ID }));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).toContain(m.errors.testFailed);
    expect(sendTest).not.toHaveBeenCalled();
  });

  it("refuses a body that names a recipient", async () => {
    const response = await test(post("/api/announcements/test", { id: ID, to: "someone@example.com" }));
    expect(response.status).toBe(400);
    expect(sendTest).not.toHaveBeenCalled();
  });

  it("answers the test's own failure", async () => {
    sendTest.mockRejectedValueOnce(new AppError("INVALID_INPUT", m.errors.testFailed, { status: 502 }));
    const response = await test(local("/api/announcements/test", { id: ID }));
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(await response.json())).toContain(m.errors.testFailed);
  });
});

describe("POST /api/announcements/queue and /stop", () => {
  it("queues under the server's environment and answers how many people", async () => {
    const response = await queue(post("/api/announcements/queue", { id: ID }));
    expect(await response.json()).toEqual({ ok: true, people: 431 });
    expect(queueLetter).toHaveBeenCalledWith(expect.anything(), "production", ID);
  });

  it("answers the database's refusal in the console's words", async () => {
    queueLetter.mockRejectedValueOnce(new AppError("INVALID_INPUT", m.errors.notTested));
    const response = await queue(post("/api/announcements/queue", { id: ID }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(m.errors.notTested);
  });

  it("stops by id", async () => {
    const response = await stop(post("/api/announcements/stop", { id: ID }));
    expect(response.status).toBe(200);
    expect(stopLetter).toHaveBeenCalledWith(expect.anything(), "production", ID);
  });

  it("refuses an id that is not one, on both", async () => {
    expect((await queue(post("/api/announcements/queue", { id: "42" }))).status).toBe(400);
    expect((await stop(post("/api/announcements/stop", { id: "42" }))).status).toBe(400);
  });

  it("refuses another origin, on both", async () => {
    expect((await queue(post("/api/announcements/queue", { id: ID }, "https://evil.example"))).status).toBe(403);
    expect((await stop(post("/api/announcements/stop", { id: ID }, "https://evil.example"))).status).toBe(403);
    expect(queueLetter).not.toHaveBeenCalled();
    expect(stopLetter).not.toHaveBeenCalled();
  });
});
