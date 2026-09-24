import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// THE FOUR LINES THAT CONNECT THE DAILY GATE TO THE RUNNER.
// ---------------------------------------------------------------------------
// `scripts/crawl-spend.mjs` decides whether a run may start, whether a call may be made, and
// whether the next ask still fits the day. Every one of those decisions is unit-tested against its
// own seam. **None of that is worth anything if the runner does not use the answers**, and the
// runner is the one file here a unit test cannot drive: it needs a real environment, real files and
// a real database client.
//
// That gap is not hypothetical. Review deleted the charge, the fail-closed refusal and the daily
// ceiling from the runner, one at a time, and each deletion left all 2262 unit tests and all 746
// pgTAP assertions green. The gate was computed and enforced nowhere a test could see.
//
// So this file reads the runner as TEXT and asserts the connections are present. That is a blunt
// instrument -- it pins spelling, not behaviour, and a sufficiently creative rewrite passes it
// while breaking everything. It is here because the alternative measured itself at zero.
//
// The worst of the four is `fetch: counter.fetch`. Unwire that one and the adapter goes back to a
// plain `fetch`: nothing is charged, AND the per-ask gate reads a ledger nobody writes to any more.
// One line, both gates, silently. Defence in depth does not reach it, because the depth depends on
// the same line.
// ---------------------------------------------------------------------------

const RUNNER = join(process.cwd(), "scripts/crawl-availability.mjs");
const text = readFileSync(RUNNER, "utf8");

describe("the runner uses what crawl-spend.mjs decides", () => {
  it("hands the counting fetch to the adapter, which is the line that feeds BOTH gates", () => {
    // The adapter must receive `counter.fetch`, not the global one. Nothing else charges the
    // ledger, and the per-ask gate counts what this writes.
    expect(text).toMatch(/fetch:\s*counter\.fetch/);
    expect(text).toMatch(/createCountingFetch\(\s*\{/);
  });

  it("refuses the run when the day says no, rather than reading the verdict and continuing", () => {
    // `mayRun` returns a verdict; the runner has to act on it. The refusal must appear, or the
    // verdict is decoration.
    expect(text).toMatch(/mayRun\(\s*\{/);
    expect(text).toMatch(/if\s*\(\s*!\s*verdict\.ok\s*\)\s*refuse\(/);
  });

  it("takes its ceiling from the day, not from the per-run figure alone", () => {
    expect(text).toMatch(/const\s+ceiling\s*=\s*verdict\.ceiling/);
  });

  it("gives runCrawl the per-ask day gate, so a long run cannot outspend the day it started in", () => {
    expect(text).toMatch(/dayGate:\s*createDayGate\(/);
  });
});
