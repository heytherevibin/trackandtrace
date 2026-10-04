import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LetterDetail } from "@/console/announcements/letters";
import type { ConsoleDb } from "@/console/auth/db";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

const { readLetter, recordTest } = vi.hoisted(() => ({
  readLetter: vi.fn<(db: unknown, id: string) => Promise<LetterDetail | null>>(),
  recordTest: vi.fn<(db: unknown, environment: string, id: string) => Promise<void>>(async () => {}),
}));
vi.mock("@/console/announcements/letters", () => ({ readLetter, recordTest }));

import { sendTest, type TestSendDeps } from "@/console/announcements/test-send";

// ---------------------------------------------------------------------------
// The test send: one real email to the member's own address, reading as a
// subscriber's will, and recorded only once it has actually gone. The order is
// the point — a test recorded but never sent would unlock Queue for a letter
// nobody has seen.
// ---------------------------------------------------------------------------

const m = consoleMessages.announcements.errors;
const ID = "a0000000-0000-4000-8000-000000000001";
const DRAFT: LetterDetail = {
  id: ID, list: "news", subject: "What is coming", body: "Hello,\n\nTwo things.\n", state: "draft", total: 0,
  sent: 0, skipped: 0, unknown: 0, waiting: 0, sentToday: 0,
  createdAt: "2026-09-18T04:00:00+00:00", queuedAt: null, stoppedAt: null, finishedAt: null,
  testSentAt: null, testSentTo: null, queuedBy: null, stoppedBy: null,
};
const ASK = { id: ID, to: "asha@trakline.in", from: "Trakline <updates@trakline.in>", origin: "https://trakline.in", environment: "production" };

function deps(outcome: "sent" | "captured" | "failed" | "suppressed" = "sent"): TestSendDeps & { send: ReturnType<typeof vi.fn>; counted: ReturnType<typeof vi.fn> } {
  return {
    db: {} as ConsoleDb,
    send: vi.fn(async () => (outcome === "sent" ? { outcome, id: "re_1" } : { outcome })),
    counted: vi.fn(async () => {}),
  } as TestSendDeps & { send: ReturnType<typeof vi.fn>; counted: ReturnType<typeof vi.fn> };
}

async function message(run: Promise<unknown>): Promise<string> {
  const err = await run.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return (err as AppError).message;
}

beforeEach(() => {
  readLetter.mockReset().mockResolvedValue(DRAFT);
  recordTest.mockReset().mockResolvedValue(undefined);
});

describe("sendTest", () => {
  it("sends the letter as a reader would get it, to the member's own address, as transactional mail", async () => {
    const d = deps();
    await sendTest(ASK, d);
    const [letter, kind] = d.send.mock.calls[0]!;
    expect(kind).toBe("transactional");
    expect(letter).toMatchObject({ to: "asha@trakline.in", from: ASK.from, subject: "What is coming" });
    expect(letter.text.startsWith("Hello,\n\nTwo things.\n\n")).toBe(true);
    expect(letter.text.trimEnd().endsWith("https://trakline.in/unsubscribe")).toBe(true);
  });

  it("carries no one-click headers and no signed link: a test must not be able to unsubscribe a real person", async () => {
    const d = deps();
    await sendTest(ASK, d);
    const [letter] = d.send.mock.calls[0]!;
    expect(letter.headers).toBeUndefined();
    expect(letter.text).not.toMatch(/unsubscribe\?/);
  });

  it("counts the email and records the test, in that order, after the send", async () => {
    const d = deps();
    await sendTest(ASK, d);
    expect(d.counted).toHaveBeenCalledTimes(1);
    expect(recordTest).toHaveBeenCalledWith(d.db, "production", ID);
    expect(d.send.mock.invocationCallOrder[0]!).toBeLessThan(recordTest.mock.invocationCallOrder[0]!);
  });

  it("counts a captured send too: under E2E the outbox stands in for the mail service", async () => {
    const d = deps("captured");
    await sendTest(ASK, d);
    expect(recordTest).toHaveBeenCalled();
  });

  it("records nothing when the send failed", async () => {
    const d = deps("failed");
    expect(await message(sendTest(ASK, d))).toBe(m.testFailed);
    expect(recordTest).not.toHaveBeenCalled();
    expect(d.counted).not.toHaveBeenCalled();
  });

  it("says so when the member's own address is suppressed", async () => {
    expect(await message(sendTest(ASK, deps("suppressed")))).toBe(m.testSuppressed);
    expect(recordTest).not.toHaveBeenCalled();
  });

  it("refuses a letter that is not a draft, or not there, before sending anything", async () => {
    const d = deps();
    readLetter.mockResolvedValueOnce({ ...DRAFT, state: "sending" });
    expect(await message(sendTest(ASK, d))).toBe(m.notDraft);
    readLetter.mockResolvedValueOnce(null);
    expect(await message(sendTest(ASK, d))).toBe(m.gone);
    expect(d.send).not.toHaveBeenCalled();
  });

  it("says the test went but was not recorded, when only the record failed", async () => {
    recordTest.mockRejectedValueOnce(new AppError("SOURCE_UNAVAILABLE", m.database));
    expect(await message(sendTest(ASK, deps()))).toBe(m.testUnrecorded);
  });
});
