import { describe, expect, it, vi } from "vitest";
import { liftSuppression, operatorsCutOff, readSuppressions, reasonOf, revealSuppression, sourceOf, type Suppression } from "@/console/announcements/suppressions";
import type { ConsoleDb } from "@/console/auth/db";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

// ---------------------------------------------------------------------------
// The console's three calls over suppressions, and the words the stored reasons
// are shown in. The store names the mail provider in one reason and one source;
// the console never does.
// ---------------------------------------------------------------------------

const m = consoleMessages.announcements.suppressions;
const ID = "a0000000-0000-4000-8000-000000000001";
const ROW = { id: ID, address: "r•••@example.in", masked: true, operator: false, scope: "all", reason: "hard bounce", at: "2026-09-16T04:11:00+00:00" };

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
  it("returns the suppressions as the database lists them", async () => {
    const { db: client, rpc } = db({ data: [ROW] });
    expect(await readSuppressions(client)).toEqual([ROW]);
    expect(rpc).toHaveBeenCalledWith("console_suppressions");
  });

  it("throws on a database error rather than answering that nobody is suppressed", async () => {
    expect(await message(readSuppressions(db({ error: { message: "connection refused" } }).db))).toBe(m.errors.database);
  });

  it("throws on a row of the wrong shape", async () => {
    expect(await message(readSuppressions(db({ data: [{ ...ROW, scope: "some" }] }).db))).toBe(m.errors.database);
  });
});

describe("reveal and lift", () => {
  it("reveals by id under the server's environment, and answers the address", async () => {
    const { db: client, rpc } = db({ data: "reader@example.in" });
    expect(await revealSuppression(client, "production", ID)).toBe("reader@example.in");
    expect(rpc).toHaveBeenCalledWith("console_reveal_suppression", { p_environment: "production", p_id: ID });
  });

  it("lifts by id and by the address the caller has seen", async () => {
    const { db: client, rpc } = db({});
    await liftSuppression(client, "production", ID, "reader@example.in");
    expect(rpc).toHaveBeenCalledWith("console_lift_suppression", { p_environment: "production", p_id: ID, p_address: "reader@example.in" });
  });

  it.each([
    ["address mismatch", m.errors.mismatch],
    ["no such suppression", m.errors.gone],
    ["no access", m.errors.noAccess],
    ["something nobody planned for", m.errors.database],
  ])("turns the database's %j into the console's words", async (raised, shown) => {
    expect(await message(liftSuppression(db({ error: { message: raised } }).db, "production", ID, "x@example.in"))).toBe(shown);
  });

  it("refuses a reveal that answers with something other than an address", async () => {
    expect(await message(revealSuppression(db({ data: null }).db, "production", ID))).toBe(m.errors.database);
  });
});

describe("the words a stored reason is shown in", () => {
  it.each([
    ["hard bounce", m.reasons.hardBounce, m.sources.delivery],
    ["complaint", m.reasons.complaint, m.sources.complaint],
    ["repeatedly delayed", m.reasons.delayed, m.sources.deliveries],
    ["suppressed by Resend", m.reasons.provider, m.sources.provider],
    ["a reason written by hand", m.reasons.other, m.sources.other],
  ])("%j", (stored, reason, source) => {
    expect(reasonOf(stored)).toBe(reason);
    expect(sourceOf(stored)).toBe(source);
  });

  it("never names the mail provider, whatever is stored", () => {
    for (const stored of ["hard bounce", "complaint", "repeatedly delayed", "suppressed by Resend", "anything else"]) {
      expect(`${reasonOf(stored)} ${sourceOf(stored)}`).not.toMatch(/resend/i);
    }
  });
});

describe("operatorsCutOff", () => {
  const row = (over: Partial<Suppression>): Suppression => ({ ...ROW, scope: "all", ...over }) as Suppression;

  it("is the operators whose mail is stopped entirely: their sign-in links will not arrive", () => {
    const rows = [
      row({ address: "kiran@trakline.in", operator: true, masked: false }),
      row({ id: "a0000000-0000-4000-8000-000000000002", address: "asha@trakline.in", operator: true, masked: false, scope: "list" }),
      row({ id: "a0000000-0000-4000-8000-000000000003" }),
    ];
    expect(operatorsCutOff(rows)).toEqual(["kiran@trakline.in"]);
  });
});
