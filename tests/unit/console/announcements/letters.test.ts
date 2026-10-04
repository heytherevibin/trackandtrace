import { describe, expect, it, vi } from "vitest";
import type { ConsoleDb } from "@/console/auth/db";
import { queueLetter, readLetter, readLetters, readLists, recordTest, saveLetter, stopLetter } from "@/console/announcements/letters";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

// ---------------------------------------------------------------------------
// The console's seven calls. A database error must never read as an empty
// answer: "no letters" and "the database is down" are different pages. And a
// row of the wrong shape fails closed rather than drawing `undefined`.
// ---------------------------------------------------------------------------

const m = consoleMessages.announcements.errors;
const ID = "a0000000-0000-4000-8000-000000000001";
const ROW = {
  id: ID, list: "news", subject: "What is coming", state: "sending", total: 431,
  sent: 262, skipped: 4, unknown: 0, waiting: 165,
  createdAt: "2026-09-10T03:00:00+00:00", queuedAt: "2026-09-11T03:35:00+00:00", stoppedAt: null, finishedAt: null,
};
const DETAIL = { ...ROW, body: "Hello", testSentAt: "2026-09-11T03:28:00+00:00", testSentTo: "asha@example.com", queuedBy: "Asha Rao", stoppedBy: null, sentToday: 31 };

function db(answer: { data?: unknown; error?: { message: string } | null }): { db: ConsoleDb; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(async () => ({ data: answer.data ?? null, error: answer.error ?? null }));
  return { db: { rpc } as unknown as ConsoleDb, rpc };
}

async function message(run: Promise<unknown>): Promise<string> {
  const err = await run.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return (err as AppError).message;
}

describe("reading", () => {
  it("returns the letters as the database lists them", async () => {
    const { db: client, rpc } = db({ data: [ROW] });
    expect(await readLetters(client)).toEqual([ROW]);
    expect(rpc).toHaveBeenCalledWith("console_letters");
  });

  it("throws on a database error rather than answering no letters", async () => {
    expect(await message(readLetters(db({ error: { message: "connection refused" } }).db))).toBe(m.database);
  });

  it("throws on a row of the wrong shape", async () => {
    expect(await message(readLetters(db({ data: [{ ...ROW, state: "paused" }] }).db))).toBe(m.database);
  });

  it("returns one letter, and null when there is none", async () => {
    const one = db({ data: DETAIL });
    expect(await readLetter(one.db, ID)).toEqual(DETAIL);
    expect(one.rpc).toHaveBeenCalledWith("console_letter", { p_letter: ID });
    expect(await readLetter(db({ data: null }).db, ID)).toBeNull();
  });

  it("returns the list counts", async () => {
    const counts = { news: 431, availability: 0, availabilitySpent: true, availabilitySpentAt: "2026-09-06T08:40:00+00:00" };
    expect(await readLists(db({ data: counts }).db)).toEqual(counts);
  });

  it("says no access in the role's own words", async () => {
    expect(await message(readLetters(db({ error: { message: "no access" } }).db))).toBe(m.noAccess);
  });
});

describe("writing", () => {
  it("saves a new draft without naming a letter, and an old one by its id", async () => {
    const created = db({ data: ID });
    expect(await saveLetter(created.db, { list: "news", subject: "S", body: "B" })).toBe(ID);
    expect(created.rpc).toHaveBeenCalledWith("console_save_letter", { p_list: "news", p_subject: "S", p_body: "B" });

    const updated = db({ data: ID });
    await saveLetter(updated.db, { id: ID, list: "news", subject: "S", body: "B" });
    expect(updated.rpc).toHaveBeenCalledWith("console_save_letter", { p_list: "news", p_subject: "S", p_body: "B", p_letter: ID });
  });

  it("queues under the environment the server names, and answers how many", async () => {
    const { db: client, rpc } = db({ data: 431 });
    expect(await queueLetter(client, "production", ID)).toBe(431);
    expect(rpc).toHaveBeenCalledWith("console_queue_letter", { p_environment: "production", p_letter: ID });
  });

  it("records a test and stops a letter by id", async () => {
    const tested = db({});
    await recordTest(tested.db, "production", ID);
    expect(tested.rpc).toHaveBeenCalledWith("console_letter_tested", { p_environment: "production", p_letter: ID });
    const stopped = db({});
    await stopLetter(stopped.db, "production", ID);
    expect(stopped.rpc).toHaveBeenCalledWith("console_stop_letter", { p_environment: "production", p_letter: ID });
  });

  it.each([
    ["this letter has not been test sent, so nobody has seen it as a reader will", m.notTested],
    ["only a draft may be queued, and this letter is sending", m.notDraft],
    ["not a draft", m.notDraft],
    ["the availability list is spent: it promised exactly one email", m.spent],
    ["nobody to send to", m.nobody],
    ["not open", m.notOpen],
    ["no such letter", m.gone],
    ["there is no such letter", m.gone],
    ["subject length", m.invalid],
    ["body length", m.invalid],
    ["unknown list", m.invalid],
    ["something nobody planned for", m.database],
  ])("turns the database's %j into the console's words", async (raised, shown) => {
    expect(await message(queueLetter(db({ error: { message: raised } }).db, "production", ID))).toBe(shown);
  });

  it("refuses a queue that answers with something other than a count", async () => {
    expect(await message(queueLetter(db({ data: "many" }).db, "production", ID))).toBe(m.database);
  });
});
