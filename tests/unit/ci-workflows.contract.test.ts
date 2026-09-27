import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// CI policy from the Phase 0 spec, part A: no secrets, a read-only token,
// Vercel's Node version, and actions pinned to a commit.

const DIR = join(process.cwd(), ".github/workflows");
const FILES = ["ci.yml", "audit.yml"] as const;

function read(name: string): string {
  const path = join(DIR, name);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const all = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((m) => m[1] ?? "");

describe.each(FILES)("%s", (name) => {
  const text = read(name);

  it("exists", () => {
    expect(text).not.toBe("");
  });

  it("never reads a secret: every test runs on the sample-data fixture", () => {
    expect(text).not.toMatch(/secrets\./);
  });

  it("gives the token read access only", () => {
    expect(text).toMatch(/^permissions:\n {2}contents: read$/m);
  });

  it("runs the Node version Vercel runs (24.x)", () => {
    const versions = all(text, /node-version:\s*(\S+)/g);
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions)).toEqual(new Set(["24"]));
  });

  it("pins every action to a full commit", () => {
    const uses = all(text, /uses:\s*(\S+)/g);
    expect(uses.length).toBeGreaterThan(0);
    for (const action of uses) expect(action).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });
});

describe("ci.yml", () => {
  const ci = read("ci.yml");

  it("has the two jobs main will require", () => {
    expect(ci).toMatch(/^ {2}verify:$/m);
    expect(ci).toMatch(/^ {2}e2e:$/m);
  });

  it("verifies in order: types, lint, unit and integration tests, production build", () => {
    const at = ["npm run typecheck", "npm run lint", "npm run test:unit", "npm run build"].map((step) => ci.indexOf(step));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("runs the browser suite and keeps its report only when it fails", () => {
    expect(ci).toContain("npx playwright test");
    expect(ci).toMatch(/if: failure\(\)\n\s+uses: actions\/upload-artifact@/);
  });

  it("shards the browser suite over four parallel jobs, and the e2e check waits for every shard and the console suite", () => {
    expect(ci).toMatch(/^ {2}e2e-shard:$/m);
    expect(ci).toContain("shard: [1, 2, 3, 4]");
    expect(ci).toContain("npx playwright test --shard=${{ matrix.shard }}/4");
    expect(ci).toMatch(/^ {2}console:$/m);
    const gate = ci.slice(ci.search(/^ {2}e2e:$/m));
    expect(gate).toContain("needs: [e2e-shard, console]");
    // a failed or timed-out shard still reaches the gate; a run superseded by a newer push does not report
    expect(gate).toContain("if: ${{ !cancelled() }}");
    expect(gate).toContain("npx playwright merge-reports --reporter html ./all-blob-reports");
  });

  it("runs the database tests and the console suite against a local Supabase stack, in their own job", () => {
    const job = ci.slice(ci.search(/^ {2}console:$/m), ci.search(/^ {2}e2e:$/m));
    expect(job).toContain("npx supabase@2.117.0 test db");
    expect(job).toContain("npm run test:e2e:console");
  });

  it("gives every job a time limit", () => {
    expect((ci.match(/timeout-minutes:/g) ?? []).length).toBe((ci.match(/runs-on:/g) ?? []).length);
  });

  it("holds the journey's chunk budgets on every pull request, after the production build", () => {
    const build = ci.indexOf("npm run build");
    expect(build).toBeGreaterThan(-1);
    expect(ci.indexOf("node scripts/journey-budgets.mjs")).toBeGreaterThan(build);
  });

  it("keeps each shard's results as a blob report, for the gate to merge when a shard fails", () => {
    const config = readFileSync(join(process.cwd(), "playwright.config.ts"), "utf8");
    expect(config).toContain('reporter: process.env.CI ? [["github"], ["blob"]] : [["list"]]');
  });
});

describe("audit.yml", () => {
  const audit = read("audit.yml");

  it("audits production dependencies and fails on high or critical advisories", () => {
    expect(audit).toContain("npm audit --omit=dev --audit-level=high");
  });

  it("runs weekly and when the dependency files change, never on unrelated work", () => {
    expect(audit).toMatch(/schedule:\n\s+- cron: /);
    expect(audit).toMatch(/paths: \[package\.json, package-lock\.json\]/);
  });
});
