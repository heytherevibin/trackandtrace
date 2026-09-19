import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Console code (which may name providers) never reaches traveller code. The console tree, its
// pages, and the host router (src/proxy.ts) may import any @/console/* module. Its not-found
// fallback (src/app/global-not-found.tsx) needs only the host-routing modules, so it is narrowed
// to those two rather than given the run of @/console/*. Relative `../console/...` paths are out
// of scope: only the `@/console/` alias is checked.
const ROOT = join(__dirname, "..", "..", "..");
const FULL_ACCESS = [`src${sep}console${sep}`, `src${sep}app${sep}console${sep}`, `src${sep}proxy.ts`];
const NARROW_ACCESS: ReadonlyMap<string, readonly string[]> = new Map([[`src${sep}app${sep}global-not-found.tsx`, ["@/console/hosts", "@/console/href"]]]);

// Matches `from "@/console/x"`, a dynamic `import("@/console/x")`, and a bare side-effect
// `import "@/console/x"` (no `from`, no braces — the import keyword leads straight into the string).
const CONSOLE_IMPORT_RE = /(?:from\s+|import\s*\(\s*|^\s*import\s+)["'](@\/console\/[^"']+)["']/gm;

function consoleImportSpecifiers(content: string): string[] {
  return [...content.matchAll(CONSOLE_IMPORT_RE)].map((match) => match[1]);
}

function isOffender(file: string, content: string): boolean {
  const imports = consoleImportSpecifiers(content);
  const allowedHere = NARROW_ACCESS.get(file);
  if (allowedHere) return imports.some((specifier) => !allowedHere.includes(specifier));
  return imports.length > 0;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("the console boundary", () => {
  it("is imported only by console code and the proxy; the not-found fallback only for host routing", () => {
    const offenders = sourceFiles(join(ROOT, "src"))
      .map((file) => relative(ROOT, file))
      .filter((file) => !FULL_ACCESS.some((prefix) => file.startsWith(prefix)))
      .filter((file) => isOffender(file, readFileSync(join(ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });

  describe("consoleImportSpecifiers", () => {
    it("catches a named import and a bare side-effect import", () => {
      expect(consoleImportSpecifiers('import { x } from "@/console/messages";')).toEqual(["@/console/messages"]);
      expect(consoleImportSpecifiers('import "@/console/csp";')).toEqual(["@/console/csp"]);
    });

    it("leaves relative console imports out of scope", () => {
      expect(consoleImportSpecifiers('import { x } from "../console/messages";')).toEqual([]);
    });
  });

  describe("isOffender for the narrowed not-found fallback", () => {
    const file = `src${sep}app${sep}global-not-found.tsx`;

    it("allows @/console/hosts and @/console/href", () => {
      expect(isOffender(file, 'import { isConsoleHost } from "@/console/hosts";\nimport { consoleHref } from "@/console/href";')).toBe(false);
    });

    it("flags any other @/console import, including a bare side-effect one", () => {
      expect(isOffender(file, 'import "@/console/csp";')).toBe(true);
      expect(isOffender(file, 'import { consoleMessages } from "@/console/messages";')).toBe(true);
    });
  });
});
