import { describe, expect, it } from "vitest";
import { closingLine, configurationLine, exitCodeFor, mask, plannedProbes, readQuotaMessage, verdict } from "../../../scripts/source-health.mjs";

// ---------------------------------------------------------------------------
// `npm run source:health` answers "is each configured source alive, and how much is left".
// Its verdicts, its closing line and its exit code are the load-bearing parts — a check wired
// to this script is only worth having if a dead source makes it fail — so they are pure and
// pinned here. The live call is not exercised: no key and no PNR belong in a test run.
// ---------------------------------------------------------------------------

/** Verbatim, from the probe on 2026-09-23. Every RapidAPI endpoint answered with this. */
const MONTHLY_GONE = {
  message: "You have exceeded the MONTHLY quota for Basic on your current plan, BASIC. Upgrade your plan at https://rapidapi.com/IRCTCAPI/api/irctc1",
};

/** A placeholder, never a key: plannedProbes asks only whether one is set, never what it is. */
const SOME_KEY = "placeholder";

const bothEnv = {
  PNR_SOURCE: "railkit",
  PNR_FALLBACK: "rapidapi",
  RAILKIT_API_KEY: SOME_KEY,
  RAPIDAPI_KEY: SOME_KEY,
};

const aloneEnv = { PNR_SOURCE: "railkit", PNR_FALLBACK: "none", RAILKIT_API_KEY: SOME_KEY };

describe("plannedProbes", () => {
  it("plans the primary and the fallback, primary first — what production actually asks", () => {
    expect(plannedProbes(bothEnv)).toEqual([
      { provider: "railkit", role: "primary", keyed: true },
      { provider: "rapidapi", role: "fallback", keyed: true },
    ]);
  });

  it("plans only the primary when there is no fallback", () => {
    expect(plannedProbes(aloneEnv)).toEqual([{ provider: "railkit", role: "primary", keyed: true }]);
  });

  it.each([["live"], ["fixture"]])("plans nothing when the source is %s — there is no third party to ask", (source) => {
    expect(plannedProbes({ PNR_SOURCE: source, PNR_FALLBACK: "none" })).toEqual([]);
  });

  it("plans nothing when the environment says nothing: live is the default", () => {
    expect(plannedProbes({})).toEqual([]);
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
    const line = configurationLine(plannedProbes(bothEnv));
    expect(line).toContain("railkit");
    expect(line).toContain("rapidapi");
    expect(line).toMatch(/fallback|only while/i);
    expect(line).not.toMatch(/no fallback/i);
  });

  it("says nothing is configured when nothing is", () => {
    expect(configurationLine([])).toMatch(/no third-party source/i);
  });
});

describe("verdict", () => {
  it("calls RailKit alive when it answers with a record, and reports the allowance it sends", () => {
    const out = verdict("railkit", { status: 200, headers: { "ratelimit-policy": "10000;w=2592000", "ratelimit-remaining": "9412" }, body: { success: true } });
    expect(out.alive).toBe(true);
    expect(out.notes.join(" ")).toContain("9412");
    expect(out.notes.join(" ")).toContain("10000;w=2592000");
  });

  it("says so when a provider sends no allowance headers at all", () => {
    expect(verdict("railkit", { status: 200, headers: {}, body: { success: true } }).notes.join(" ")).toMatch(/not sent/i);
  });

  it("calls RailKit alive when it answers 'no such PNR' — that is an answer", () => {
    expect(verdict("railkit", { status: 400, headers: {}, body: { success: false, error: "No PNR data found or invalid PNR number" } }).alive).toBe(true);
  });

  it.each([
    [401, /refus/i],
    [403, /refus/i],
    [429, /limit|quota/i],
    [500, /error/i],
    [503, /error/i],
  ])("calls RailKit unable to answer on HTTP %i", (status, summary) => {
    const out = verdict("railkit", { status, headers: {}, body: { success: false, error: "nope" } });
    expect(out.alive).toBe(false);
    expect(out.summary).toMatch(summary);
  });

  it("calls a source unable to answer when the request never completed", () => {
    expect(verdict("railkit", { failure: "TimeoutError" }).alive).toBe(false);
    expect(verdict("rapidapi", { failure: "TypeError" }).alive).toBe(false);
    expect(verdict("railkit", { failure: "TimeoutError" }).summary).toMatch(/time/i);
  });

  it("calls RapidAPI alive when it answers, and reports what is left on the plan", () => {
    const out = verdict("rapidapi", { status: 200, headers: { "x-ratelimit-requests-remaining": "412", "x-ratelimit-requests-limit": "500" }, body: { status: true } });
    expect(out.alive).toBe(true);
    expect(out.notes.join(" ")).toContain("412");
    expect(out.notes.join(" ")).toContain("500");
  });

  it("reads a spent monthly allowance out of RapidAPI's 429 body, and names the plan", () => {
    const out = verdict("rapidapi", { status: 429, headers: {}, body: MONTHLY_GONE });
    expect(out.alive).toBe(false);
    expect(out.summary).toMatch(/monthly/i);
    const said = `${out.summary} ${out.notes.join(" ")}`;
    expect(said).toContain("BASIC");
    expect(said).toMatch(/will not|until|upgrade/i);
  });

  it("keeps a transient 429 apart from a spent plan", () => {
    const out = verdict("rapidapi", { status: 429, headers: { "retry-after": "12" }, body: { message: "Too many requests" } });
    expect(out.alive).toBe(false);
    expect(out.summary).not.toMatch(/monthly/i);
    expect(out.notes.join(" ")).toContain("12");
  });

  it("masks any ten-digit run before it reaches the operator's terminal", () => {
    const out = verdict("railkit", { status: 409, headers: {}, body: { success: false, error: "No data for 4949608635" } });
    expect(`${out.summary} ${out.notes.join(" ")}`).not.toContain("4949608635");
  });

  it("says a source with no key cannot be asked at all", () => {
    const out = verdict("rapidapi", { unkeyed: true });
    expect(out.alive).toBe(false);
    expect(out.summary).toMatch(/key/i);
  });
});

describe("readQuotaMessage", () => {
  it("reads a spent monthly allowance, with the period and the plan", () => {
    expect(readQuotaMessage(MONTHLY_GONE)).toEqual({ kind: "exhausted", period: "MONTHLY", plan: "BASIC" });
  });

  it.each([
    ["a daily cap, which comes back on its own", { message: "You have exceeded the DAILY quota for Requests on your current plan, BASIC." }, { kind: "busy", period: "DAILY" }],
    ["a per-second limit", { message: "Too many requests" }, { kind: "busy" }],
    ["a body with no message", { status: false }, { kind: "busy" }],
    ["a body that is not an object", "429 Too Many Requests", { kind: "busy" }],
    ["nothing at all", null, { kind: "busy" }],
  ])("reads %s as busy", (_label, body, expected) => {
    expect(readQuotaMessage(body)).toEqual(expected);
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
  it("says checks are down when the only source cannot answer", () => {
    const line = closingLine([{ provider: "railkit", role: "primary", alive: false }]);
    expect(line).toMatch(/down/i);
    expect(line).toMatch(/no fallback|nothing behind/i);
  });

  it("says the fallback is covering when the primary is the one that is dead", () => {
    const line = closingLine([
      { provider: "railkit", role: "primary", alive: false },
      { provider: "rapidapi", role: "fallback", alive: true },
    ]);
    expect(line).toContain("rapidapi");
    expect(line).not.toMatch(/down/i);
  });

  it("says checks are down when neither source can answer", () => {
    const line = closingLine([
      { provider: "railkit", role: "primary", alive: false },
      { provider: "rapidapi", role: "fallback", alive: false },
    ]);
    expect(line).toMatch(/down/i);
  });

  it("warns that the cover is gone when only the fallback is dead", () => {
    const line = closingLine([
      { provider: "railkit", role: "primary", alive: true },
      { provider: "rapidapi", role: "fallback", alive: false },
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
