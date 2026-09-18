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
