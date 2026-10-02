import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// CI policy from the Phase 0 spec, part A: no secrets, a read-only token,
// Vercel's Node version, and actions pinned to a commit.

const DIR = join(process.cwd(), ".github/workflows");
const FILES = ["ci.yml", "audit.yml", "journey-nightly.yml"] as const;

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
    expect(gate).toContain("npx playwright merge-reports --reporter html ./all-blob-reports");
  });

  it("always reports the e2e check, and fails it unless every shard and the console suite succeeded", () => {
    const gate = ci.slice(ci.search(/^ {2}e2e:$/m));
    // A skipped required check counts as passing: the gate must run even when a job it needs was cancelled or skipped.
    expect(gate).toMatch(/^ {4}if: \$\{\{ always\(\) \}\}$/m);
    expect(gate).not.toMatch(/^ {4}if: \$\{\{ !cancelled\(\) \}\}$/m);
    // …and it passes only on `success`: cancelled, skipped and failure all fail it.
    expect(gate).toContain("SHARDS: ${{ needs.e2e-shard.result }}");
    expect(gate).toContain("CONSOLE: ${{ needs.console.result }}");
    expect(gate).toContain('run: test "$SHARDS" = success && test "$CONSOLE" = success');
    // The report steps run after a real failure, never for a cancelled run.
    const conditions = [...gate.matchAll(/^ {6}(?:- | {2})if: (.+)$/gm)].map((m) => m[1]);
    expect(conditions).toHaveLength(6);
    for (const condition of conditions) expect(condition).toBe("${{ failure() && !cancelled() }}");
  });

  it("runs the database tests and the console suite against a local Supabase stack, in their own job", () => {
    const job = ci.slice(ci.search(/^ {2}console:$/m), ci.search(/^ {2}e2e:$/m));
    expect(job).toContain("npx supabase@2.117.0 test db");
    expect(job).toContain("npm run test:e2e:console");
  });

  it("gives every job a time limit", () => {
    expect((ci.match(/^ {4}timeout-minutes:/gm) ?? []).length).toBe((ci.match(/^ {4}runs-on:/gm) ?? []).length);
  });

  it("stops a slow shard's tests inside its job's limit, so the step fails and its blob report is still kept", () => {
    const shard = ci.slice(ci.search(/^ {2}e2e-shard:$/m), ci.search(/^ {2}console:$/m));
    const job = Number(/^ {4}timeout-minutes: (\d+)$/m.exec(shard)?.[1]);
    const step = /^ {6}- run: npx playwright test --shard=\$\{\{ matrix\.shard \}\}\/4\n {8}timeout-minutes: (\d+)$/m.exec(shard);
    expect(step?.[1]).toBe("17");
    expect(Number(step?.[1])).toBeLessThan(job);
    // and room around it for a cache-miss setup (npm ci, the browsers) and the report upload: the job's limit must never
    // beat the step's to it, or the blob report is lost with the job (final review)
    expect(job - Number(step?.[1])).toBeGreaterThanOrEqual(8);
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

  // `--shard` cuts the suite, in project order and then by file path, into four runs of equal test counts. The desktop
  // project, all in a row, filled shards 1 and 2 by itself, and its journey specs drawn live (SwiftShader on the runner)
  // made shard 2 the slowest of every run: 11.8, 12.3, 11.8, 11.4 and 11.6 minutes against 7.7 for the others' mean (the
  // five runs to 36746923546). Its later specs run after the phone's, so its live drawing and its run fall to different
  // shards.
  it("runs the desktop suite's later specs after the phone's, so live-drawing and run fall to different shards", async () => {
    const { default: config } = await import("../../playwright.config");
    const projects = config.projects ?? [];
    expect(projects.map((p) => p.name)).toEqual(["desktop", "mobile", "desktop", "console-desktop", "console-mobile"]);
    const matches = (pattern: unknown, file: string) => [pattern].flat().some((re) => re instanceof RegExp && re.test(file));
    const runs = (i: number, file: string) => {
      const p = projects[i];
      return (p?.testMatch === undefined || matches(p.testMatch, file)) && !matches(p?.testIgnore, file);
    };
    const specs = readdirSync(join(process.cwd(), "tests/e2e"), { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".spec.ts") && !/^(console(-auth)?|production|nightly)\//.test(f))
      .map((f) => join(process.cwd(), "tests/e2e", f));
    expect(specs.length).toBeGreaterThan(40);
    // every spec runs on the phone, and on the desktop exactly once
    for (const spec of specs) {
      expect(runs(1, spec), spec).toBe(true);
      expect([runs(0, spec), runs(2, spec)].filter(Boolean), spec).toHaveLength(1);
    }
    const at = (name: string) => specs.find((s) => s.endsWith(`journey/${name}.spec.ts`)) ?? "";
    expect(runs(0, at("live-drawing"))).toBe(true);
    expect(runs(2, at("run"))).toBe(true);
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

describe("journey-nightly.yml", () => {
  const nightly = read("journey-nightly.yml");

  it("runs at night and by hand, and on a pull request only when it changes itself (J6-11)", () => {
    expect(nightly).toMatch(/schedule:\n\s+- cron: /);
    expect(nightly).toContain("workflow_dispatch:");
    expect(nightly).toMatch(/pull_request:\n\s+paths: \[\.github\/workflows\/journey-nightly\.yml\]/);
  });

  it("runs its jobs only under this repository's name (never a fork's own schedule or dispatch), and gives every job a time limit", () => {
    const jobs = (nightly.match(/runs-on:/g) ?? []).length;
    expect(jobs).toBe(2);
    expect((nightly.match(/if: github\.repository == 'heytherevibin\/trackandtrace'/g) ?? []).length).toBe(jobs);
    expect((nightly.match(/timeout-minutes:/g) ?? []).length).toBe(jobs);
  });

  it("serves sample data and nothing live: no live source, no credential, nowhere", () => {
    expect(nightly).not.toMatch(/PNR_SOURCE:\s*(railkit|live)/);
    expect(nightly).not.toMatch(/RAILKIT|UPSTASH|SUPABASE|DATA_KEY|SENTRY|RESEND|LOCAL_FIXTURE/);
  });

  it("measures what a GPU-less runner can: the chunk budgets, the production build, the throttled runs, the wide e2e", () => {
    // read from `jobs:` on, so only the steps count, never a comment above them. The build is build:local, the only
    // build the serve script accepts (a plain `npm run build` leaves it unstamped).
    const steps = nightly.slice(nightly.search(/^jobs:$/m));
    const order = ["npm run build:local", "node scripts/journey-budgets.mjs", "npx playwright test -c playwright.production.config.ts", "node scripts/journey-perf.mjs --software"].map((step) => steps.indexOf(step));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(nightly).toContain("npx playwright test -c playwright.nightly.config.ts --shard=${{ matrix.shard }}/3");
    expect(nightly).toContain("npx playwright install --with-deps chromium webkit");
  });

  it("says plainly that the real-GPU budgets are measured by hand", () => {
    expect(nightly).toContain("node scripts/journey-perf.mjs");
    expect(nightly).toMatch(/no GPU/);
  });
});
