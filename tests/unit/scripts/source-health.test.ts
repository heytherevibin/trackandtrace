import { describe, expect, it } from "vitest";
import { PROVIDERS, closingLine, configurationLine, exitCodeFor, mask, plannedProbes, readRest, verdict } from "../../../scripts/source-health.mjs";

// ---------------------------------------------------------------------------
// `npm run source:health` answers "is each configured source alive, and how much is left".
// Its verdicts, its closing line and its exit code are the load-bearing parts — a check wired
// to this script is only worth having if a dead source makes it fail — so they are pure and
// pinned here. The live call is not exercised: no key and no PNR belong in a test run.
//
// One provider is configured today, so the second-source path is exercised through a stand-in
// entry in the provider table. The mechanism is kept for the day a real second provider lands
// (see PNR_FALLBACK in src/services/env.ts), and a kept mechanism has to stay tested.
// ---------------------------------------------------------------------------

/** A placeholder, never a key: plannedProbes asks only whether one is set, never what it is. */
const SOME_KEY = "placeholder";

/** Stands in for a second provider, which does not exist yet. Never asked: no test makes a request. */
const SECOND = {
  key: (env: Record<string, string>) => env.SECOND_API_KEY,
  request: (pnr: string) => ({ url: `https://second.invalid/pnr/${pnr}`, headers: {} }),
};
const WITH_SECOND = { ...PROVIDERS, second: SECOND };

const bothEnv = { PNR_SOURCE: "railkit", PNR_FALLBACK: "second", RAILKIT_API_KEY: SOME_KEY, SECOND_API_KEY: SOME_KEY };

const aloneEnv = { PNR_SOURCE: "railkit", PNR_FALLBACK: "none", RAILKIT_API_KEY: SOME_KEY };

describe("plannedProbes", () => {
  it("plans the primary and the fallback, primary first — what a two-source deployment asks", () => {
    expect(plannedProbes(bothEnv, WITH_SECOND)).toEqual([
      { provider: "railkit", role: "primary", keyed: true },
      { provider: "second", role: "fallback", keyed: true },
    ]);
  });

  it("plans only the primary when there is no fallback — what production asks today", () => {
    expect(plannedProbes(aloneEnv)).toEqual([{ provider: "railkit", role: "primary", keyed: true }]);
  });

  it.each([["live"], ["fixture"]])("plans nothing when the source is %s — there is no third party to ask", (source) => {
    expect(plannedProbes({ PNR_SOURCE: source, PNR_FALLBACK: "none" })).toEqual([]);
  });

  it("plans nothing when the environment says nothing: live is the default", () => {
    expect(plannedProbes({})).toEqual([]);
  });

  it("plans nothing for a name the provider table does not hold, inherited or invented", () => {
    expect(plannedProbes({ PNR_SOURCE: "constructor", PNR_FALLBACK: "__proto__" })).toEqual([]);
    expect(plannedProbes({ PNR_SOURCE: "rapidapi", PNR_FALLBACK: "none" })).toEqual([]);
  });

  it("still plans a source whose key is missing, and says the key is missing", () => {
    expect(plannedProbes({ PNR_SOURCE: "railkit", PNR_FALLBACK: "none" })).toEqual([{ provider: "railkit", role: "primary", keyed: false }]);
  });
});

describe("configurationLine", () => {
  it("says plainly that one source has nothing behind it", () => {
    const line = configurationLine(plannedProbes(aloneEnv));
    expect(line).toMatch(/one source/i);
    expect(line).toMatch(/no fallback/i);
    expect(line).toContain("railkit");
  });

  it("names both, and which one only covers the other", () => {
    const line = configurationLine(plannedProbes(bothEnv, WITH_SECOND), WITH_SECOND);
    expect(line).toContain("railkit");
    expect(line).toContain("second");
    expect(line).toMatch(/fallback|only while/i);
    expect(line).not.toMatch(/no fallback/i);
  });

  it("says nothing is configured when nothing is, and names what it looked for", () => {
    const line = configurationLine([]);
    expect(line).toMatch(/no third-party source/i);
    expect(line).toContain("railkit");
  });
});

describe("verdict", () => {
  it("calls a source alive when it answers with a record, and reports the allowance it sends", () => {
    const out = verdict({ status: 200, headers: { "ratelimit-policy": "10000;w=2592000", "ratelimit-remaining": "9412" }, body: { success: true } });
    expect(out.alive).toBe(true);
    expect(out.notes.join(" ")).toContain("9412");
    expect(out.notes.join(" ")).toContain("10000;w=2592000");
  });

  it("says so when a provider sends no allowance headers at all", () => {
    expect(verdict({ status: 200, headers: {}, body: { success: true } }).notes.join(" ")).toMatch(/not sent/i);
  });

  it("calls a source alive when it answers 'no such PNR' — that is an answer", () => {
    expect(verdict({ status: 400, headers: {}, body: { success: false, error: "No PNR data found or invalid PNR number" } }).alive).toBe(true);
  });

  it.each([
    [401, /refus/i],
    [403, /refus/i],
    [429, /limit|quota|allowance/i],
    [500, /error/i],
    [503, /error/i],
  ])("calls a source unable to answer on HTTP %i", (status, summary) => {
    const out = verdict({ status, headers: {}, body: { success: false, error: "nope" } });
    expect(out.alive).toBe(false);
    expect(out.summary).toMatch(summary);
  });

  it("calls a source unable to answer when the request never completed", () => {
    expect(verdict({ failure: "TimeoutError" }).alive).toBe(false);
    expect(verdict({ failure: "TypeError" }).alive).toBe(false);
    expect(verdict({ failure: "TimeoutError" }).summary).toMatch(/time/i);
  });

  it("reads a spent plan out of a 429 that will not refill today, and says it needs a person", () => {
    const out = verdict({ status: 429, headers: { "ratelimit-policy": "10000;w=2592000", "ratelimit-remaining": "0", "ratelimit-reset": String(18 * 24 * 60 * 60) }, body: { error: "Quota exceeded" } });
    expect(out.alive).toBe(false);
    expect(out.summary).toMatch(/spent/i);
    expect(out.summary).toMatch(/18 days/);
    expect(out.summary).toMatch(/will not come back/i);
  });

  it("keeps a transient 429 apart from a spent plan", () => {
    const out = verdict({ status: 429, headers: { "retry-after": "12" }, body: { message: "Too many requests" } });
    expect(out.alive).toBe(false);
    expect(out.summary).not.toMatch(/spent/i);
    expect(out.notes.join(" ")).toContain("12");
  });

  it("masks any ten-digit run before it reaches the operator's terminal", () => {
    const out = verdict({ status: 409, headers: {}, body: { success: false, error: "No data for 4949608635" } });
    expect(`${out.summary} ${out.notes.join(" ")}`).not.toContain("4949608635");
  });

  it("says a source with no key cannot be asked at all", () => {
    const out = verdict({ unkeyed: true });
    expect(out.alive).toBe(false);
    expect(out.summary).toMatch(/key/i);
  });
});

describe("readRest", () => {
  it("reads a plan-sized rest as spent: it will not refill within the shift", () => {
    expect(readRest({ "ratelimit-reset": String(30 * 24 * 60 * 60) })).toEqual({ kind: "exhausted", seconds: 30 * 24 * 60 * 60 });
    expect(readRest({ "retry-after": String(25 * 60 * 60) })).toEqual({ kind: "exhausted", seconds: 25 * 60 * 60 });
  });

  it("prefers Retry-After over RateLimit-Reset when the provider sends both", () => {
    expect(readRest({ "retry-after": "30", "ratelimit-reset": String(30 * 24 * 60 * 60) })).toEqual({ kind: "busy", seconds: 30 });
  });

  it.each([
    ["a per-minute cap, which comes back on its own", { "retry-after": "45" }, { kind: "busy", seconds: 45 }],
    ["a rest of exactly a day, which is a plan and not a moment", { "retry-after": String(24 * 60 * 60) }, { kind: "exhausted", seconds: 24 * 60 * 60 }],
    ["no rest headers at all", {}, { kind: "busy" }],
    ["a header that is not a number", { "retry-after": "Wed, 24 Sep 2026 12:00:00 GMT" }, { kind: "busy" }],
    ["a zero or negative rest", { "retry-after": "0", "ratelimit-reset": "-5" }, { kind: "busy" }],
  ])("reads %s", (_label, headers, expected) => {
    expect(readRest(headers)).toEqual(expected);
  });
});

describe("exitCodeFor", () => {
  it("is zero when every configured source answered", () => {
    expect(exitCodeFor([{ alive: true }, { alive: true }])).toBe(0);
  });

  it("is non-zero the moment one source cannot answer, so a check fails on it", () => {
    expect(exitCodeFor([{ alive: true }, { alive: false }])).toBe(1);
    expect(exitCodeFor([{ alive: false }])).toBe(1);
  });

  it("is zero when no third-party source is configured: nothing is dead", () => {
    expect(exitCodeFor([])).toBe(0);
  });
});

describe("closingLine", () => {
  it("says checks are down when the only source cannot answer — today's shape", () => {
    const line = closingLine([{ provider: "railkit", role: "primary", alive: false }]);
    expect(line).toMatch(/down/i);
    expect(line).toMatch(/no fallback|nothing behind/i);
  });

  it("says the fallback is covering when the primary is the one that is dead", () => {
    const line = closingLine([
      { provider: "railkit", role: "primary", alive: false },
      { provider: "second", role: "fallback", alive: true },
    ]);
    expect(line).toContain("second");
    expect(line).not.toMatch(/down/i);
  });

  it("says checks are down when neither source can answer", () => {
    const line = closingLine([
      { provider: "railkit", role: "primary", alive: false },
      { provider: "second", role: "fallback", alive: false },
    ]);
    expect(line).toMatch(/down/i);
  });

  it("warns that the cover is gone when only the fallback is dead", () => {
    const line = closingLine([
      { provider: "railkit", role: "primary", alive: true },
      { provider: "second", role: "fallback", alive: false },
    ]);
    expect(line).toMatch(/cover|uncovered|no fallback/i);
    expect(line).not.toMatch(/down/i);
  });

  it("is quiet and plain when everything answered", () => {
    expect(closingLine([{ provider: "railkit", role: "primary", alive: true }])).toMatch(/answered/i);
  });
});

describe("mask", () => {
  it("hides ten-digit runs and leaves the rest of the sentence readable", () => {
    expect(mask("No data for PNR 4949608635 today")).toBe("No data for PNR •••••••••• today");
  });

  it("hides every run, not just the first", () => {
    expect(mask("4949608635 and 1234567890")).toBe("•••••••••• and ••••••••••");
  });
});
