import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Console code (which may name providers) never reaches traveller code. Only the console tree, its pages, and the
// host router may import @/console.
const ROOT = join(__dirname, "..", "..", "..");
const ALLOWED = [`src${sep}console${sep}`, `src${sep}app${sep}console${sep}`, `src${sep}proxy.ts`];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("the console boundary", () => {
  it("is imported only by console code and the proxy", () => {
    const offenders = sourceFiles(join(ROOT, "src"))
      .map((file) => relative(ROOT, file))
      .filter((file) => !ALLOWED.some((prefix) => file.startsWith(prefix)))
      .filter((file) => /(?:from\s+|import\()\s*["']@\/console\//.test(readFileSync(join(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
