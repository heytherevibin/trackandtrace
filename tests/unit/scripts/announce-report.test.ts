import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "../../../scripts/announce-report.mjs";

// The runner's assembly is driven with stand-in reads, as `drain` is in announce-plan: what is tested
// is what it ASSEMBLES and the exit code it ANSWERS, which is the whole reason this script exists.
// A letter silent for a week that printed "stuck" and exited 0 would leave CI green for ever.

const AT = new Date("2026-10-02T09:00:00.000Z");
const hoursAgo = (n: number) => new Date(AT.getTime() - n * 3_600_000).toISOString();

const SUBJECT = "A subject nobody may read in a log";
const BODY = "A body nobody may read in a log";

const open = (id: string, over = {}) => ({ id, list: "news", subject: SUBJECT, body: BODY, state: "sending", queuedAt: hoursAgo(200), ...over });

type Remaining = { pending: number; sending: number; lastSentAt?: string | null };
type World = {
  letters: readonly object[];
  remaining?: Record<string, Remaining | Error>;
  claims?: Record<string, readonly object[]>;
};

function stand({ letters, remaining = {}, claims = {} }: World) {
  const reads = {
    openLetters: async () => letters,
    remainingFor: async (id: string) => {
      const r = remaining[id] ?? { pending: 0, sending: 0, lastSentAt: hoursAgo(1) };
      if (r instanceof Error) throw r;
      return r;
    },
    openClaims: async (id: string) => claims[id] ?? [],
  };
  return async (path: string) => (path.endsWith("env.ts") ? { parseEnv: () => ({ ok: true }) } : reads);
}

function run(world: World, over = {}) {
  const said: string[] = [];
  const complained: string[] = [];
  const result = main({ load: stand(world), now: () => AT, say: (line: string) => said.push(line), complain: (line: string) => complained.push(line), ...over });
  return { result, said, complained };
}

afterEach(() => vi.restoreAllMocks());

describe("the exit code the runner answers", () => {
  it("is 0, and says so, when every letter is advancing", async () => {
    const out = run({ letters: [open("L1")], remaining: { L1: { pending: 10, sending: 0, lastSentAt: hoursAgo(2) } } });
    expect(await out.result).toBe(0);
    expect(out.said.join("\n")).toMatch(/nothing is stuck/i);
  });

  it("is 1 when a letter has been silent for days with rows still pending, and says which", async () => {
    const out = run({ letters: [open("L1")], remaining: { L1: { pending: 10, sending: 0, lastSentAt: hoursAgo(168) } } });
    expect(await out.result).toBe(1);
    expect(out.said.join("\n")).toContain("L1");
    expect(out.said.join("\n")).toContain("no delivery in 48 hours, 10 still pending");
  });

  it("reads `pending` as the pending count and not the in-flight one", async () => {
    // 5 in flight, none pending, last delivery a week ago: that is NOT the no-delivery fault.
    const out = run({ letters: [open("L1")], remaining: { L1: { pending: 0, sending: 5, lastSentAt: hoursAgo(168) } } });
    expect(await out.result).toBe(0);
  });

  it("is 1 for a letter with no work left that was never marked done, though nothing is pending", async () => {
    const out = run({ letters: [open("L1")], remaining: { L1: { pending: 0, sending: 0, lastSentAt: hoursAgo(120) } } });
    expect(await out.result).toBe(1);
    expect(out.said.join("\n")).toContain("no work left, but it was never marked done");
  });

  it("is 1 for a delivery claimed over 24 hours ago, using what the claim read returns", async () => {
    const out = run({
      letters: [open("L1")],
      remaining: { L1: { pending: 10, sending: 1, lastSentAt: hoursAgo(1) } },
      claims: { L1: [{ personId: "p1", claimedAt: hoursAgo(1), firstAttemptedAt: hoursAgo(30) }] },
    });
    expect(await out.result).toBe(1);
    expect(out.said.join("\n")).toContain("1 delivery claimed over 24 hours ago and never marked");
  });

  it("reads an absent lastSentAt as never sent, and says the store gave none", async () => {
    const out = run({ letters: [open("L1", { queuedAt: hoursAgo(1) })], remaining: { L1: { pending: 10, sending: 0 } } });
    expect(await out.result).toBe(0);
    expect(out.said.join("\n")).toMatch(/no last-delivery time for 1 of 1 letters/);
  });

  it("skips a letter it cannot read, says so, reports the rest, and does not call the run clean", async () => {
    const out = run({
      letters: [open("BAD"), open("L2")],
      remaining: { BAD: new Error("The announcements store could not complete announce_remaining."), L2: { pending: 10, sending: 0, lastSentAt: hoursAgo(1) } },
    });
    expect(await out.result).toBe(2);
    const text = out.said.join("\n");
    expect(text).toContain("BAD");
    expect(text).toMatch(/could not be read/);
    expect(text).not.toMatch(/nothing is stuck/i);
  });

  it("exits 2, not 1, when it skipped one letter and found another stuck, and still names the stuck one", async () => {
    // Exit 2 says the report is incomplete and outranks a finding elsewhere; stdout loses nothing.
    const out = run({
      letters: [open("BAD"), open("L2")],
      remaining: { BAD: new Error("x"), L2: { pending: 10, sending: 0, lastSentAt: hoursAgo(100) } },
    });
    expect(await out.result).toBe(2);
    const text = out.said.join("\n");
    expect(text).toContain("L2");
    expect(text).toContain("no delivery in 48 hours, 10 still pending");
    expect(text).toContain("BAD");
    expect(text).toMatch(/could not be read/);
  });
});

describe("a run that cannot start or cannot read is never an exit 1", () => {
  // Exit 1 means "the store was read and something is stuck", and nothing else. An uncaught throw
  // exits 1 in Node, so a crash would read as a finding, and the finding would be false.
  it("exits 2 when an import throws, as a TypeScript parameter property does before anything runs", async () => {
    const complained: string[] = [];
    const said: string[] = [];
    const code = await main({
      load: async () => {
        throw new SyntaxError("TypeScript parameter property is not supported in strip-only mode");
      },
      say: (line: string) => said.push(line),
      complain: (line: string) => complained.push(line),
    });
    expect(code).toBe(2);
    expect(complained.join("\n")).toMatch(/could not start/);
    expect(said).toEqual([]);
  });

  it("exits 2 when the environment is not valid", async () => {
    const complained: string[] = [];
    const code = await main({
      load: async () => ({ parseEnv: () => ({ ok: false, issues: ["DATA_KEY is required"] }) }),
      say: () => undefined,
      complain: (line: string) => complained.push(line),
    });
    expect(code).toBe(2);
    expect(complained.join("\n")).toContain("DATA_KEY is required");
  });

  it("exits 2 when the list of letters cannot be read at all", async () => {
    const complained: string[] = [];
    const reads = {
      openLetters: async () => {
        throw new Error("The announcements store could not complete announce_open_letters.");
      },
    };
    const code = await main({
      load: async (path: string) => (path.endsWith("env.ts") ? { parseEnv: () => ({ ok: true }) } : reads),
      say: () => undefined,
      complain: (line: string) => complained.push(line),
    });
    expect(code).toBe(2);
    expect(complained.join("\n")).toMatch(/could not be read/);
  });
});

describe("what the runner prints", () => {
  const world: World = {
    letters: [open("L1")],
    remaining: { L1: { pending: 10, sending: 1, lastSentAt: hoursAgo(100) } },
    claims: { L1: [{ personId: "p1", email: "someone@example.com", claimedAt: hoursAgo(30), firstAttemptedAt: hoursAgo(30) }] },
  };

  it("is a letter's id and a reason, never its subject, its body, an address or a person", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const out = run(world);
    expect(await out.result).toBe(1);

    const text = [...out.said, ...out.complained].join("\n");
    expect(text).toContain("L1");
    for (const secret of [SUBJECT, BODY, "@", "example.com", "p1"]) expect(text).not.toContain(secret);
    // Nothing is written except through the one door the runner was handed.
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("goes to the console when no door is handed, which is how a test would see a stray write at all", async () => {
    // The control: without it the silence asserted above could be a spy that sees nothing.
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await main({ load: stand(world), now: () => AT });
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls.flat().join("\n")).toContain("L1");
    expect(log.mock.calls.flat().join("\n")).not.toContain(SUBJECT);
  });
});
