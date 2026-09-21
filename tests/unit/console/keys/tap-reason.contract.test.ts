import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// tapReason (src/console/keys/tap-schema.ts) is the one reason schema in the console: its `.trim()`
// decides the exact string console.action_digest hashes at mint, and every route that carries a
// reason into a tap must re-validate with this same schema or a reason with a trailing space mints
// one digest and spends against another -- every such action then fails with "no tap for this
// action" and nothing says why (task-8-addendum.md §3). Greps source rather than exercising it, the
// same shape tests/unit/console/boundary.contract.test.ts uses for the console import boundary: this
// cannot prove any one route imports tapReason, but it stops a second, merely-similar-looking schema
// from ever being declared alongside it.
const ROOT = join(__dirname, "..", "..", "..", "..");
const OWN_FILE = join("src", "console", "keys", "tap-schema.ts");

// z.string().trim().min(10 -- and near variants (extra whitespace, a different quote style around
// the message) -- wherever it appears outside tap-schema.ts itself.
const REASON_SCHEMA_RE = /z\s*\.\s*string\s*\(\s*\)\s*\.\s*trim\s*\(\s*\)\s*\.\s*min\s*\(\s*10\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("tapReason is the only reason schema in the console", () => {
  it("finds no second z.string().trim().min(10…) declaration outside tap-schema.ts", () => {
    const offenders = sourceFiles(join(ROOT, "src"))
      .map((file) => relative(ROOT, file))
      .filter((file) => file !== OWN_FILE)
      .filter((file) => REASON_SCHEMA_RE.test(readFileSync(join(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the pattern itself still matches tap-schema.ts's own declaration", () => {
    expect(REASON_SCHEMA_RE.test(readFileSync(join(ROOT, OWN_FILE), "utf8"))).toBe(true);
  });
});
