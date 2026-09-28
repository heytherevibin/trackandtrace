import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// A module that says "use client" hands a server file references to its components, not its
// values. Import a string constant from one into a server component and the server holds a client
// reference where the string should be: it type-checks, unit tests (which ignore the boundary)
// pass, and it is silently wrong at runtime. Found 2026-09-28: the site notice read
// cookies().get(NOTICE_COOKIE) with NOTICE_COOKIE undefined, so a closed notice came back on every
// page. This guard: a file that can reach the server may take only components (PascalCase) and
// types from a client module. Values both sides need live in a plain module.
//
// "Can reach the server": a module with no "use client" line still runs only in the browser when
// every module importing it does (the landing journey's scripts, say). Those are client too.

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

function isClient(source: string): boolean {
  const code = source.replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  return /^["']use client["']/.test(code);
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const COMPONENT = /^[A-Z][a-z][A-Za-z0-9]*$/;

/** Value imports of each file: static, re-exports and dynamic import(). Type-only imports carry no code. */
function valueImports(path: string, source: string): string[] {
  const specs = [
    ...[...source.matchAll(/(?:import|export)\s+(?!type\s)[^;]*?\s+from\s+["']([^"']+)["']/g)].map((m) => m[1]!),
    ...[...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]!),
  ];
  return specs.map((spec) => resolveImport(path, spec)).filter((target): target is string => target !== null);
}

/** Marked "use client", or imported only ever by client modules (to a fixed point). */
function clientModules(all: readonly string[]): Set<string> {
  const importers = new Map<string, Set<string>>(all.map((path) => [path, new Set<string>()]));
  for (const path of all) {
    for (const target of valueImports(path, readFileSync(path, "utf8"))) importers.get(target)?.add(path);
  }
  const client = new Set(all.filter((path) => isClient(readFileSync(path, "utf8"))));
  for (let grew = true; grew; ) {
    grew = false;
    for (const path of all) {
      const from = importers.get(path)!;
      if (client.has(path) || from.size === 0 || path.includes(`${join("src", "app")}`)) continue;
      if ([...from].every((importer) => client.has(importer))) {
        client.add(path);
        grew = true;
      }
    }
  }
  return client;
}

/** Every value (not type) a server-reachable file imports by name from a client module, and is not a component. */
function crossings(): string[] {
  const all = files(SRC);
  const client = clientModules(all);
  const marked = new Set(all.filter((path) => isClient(readFileSync(path, "utf8"))));
  const found: string[] = [];
  for (const path of all) {
    if (client.has(path)) continue;
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/import\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
      const [, typeOnly, clause, spec] = match;
      const target = resolveImport(path, spec!);
      if (typeOnly || !target || !marked.has(target)) continue;
      const named = clause!.match(/\{([^}]*)\}/)?.[1] ?? "";
      const names = named
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part && !part.startsWith("type "))
        .map((part) => part.split(/\s+as\s+/)[0]!.trim());
      for (const name of names) {
        if (!COMPONENT.test(name)) found.push(`${relative(ROOT, path)} imports ${name} from ${relative(ROOT, target)}`);
      }
      if (/\*\s+as\s+/.test(clause!)) found.push(`${relative(ROOT, path)} imports * from ${relative(ROOT, target)}`);
    }
  }
  return found;
}

describe("the client boundary", () => {
  it("no server or shared file imports a value other than a component from a client module", () => {
    expect(crossings()).toEqual([]);
  });
});
