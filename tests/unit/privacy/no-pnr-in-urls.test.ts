import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Contract: our own addresses never carry a PNR. Paths and query strings land in platform request
// logs; the part after "#" and request bodies do not. Third-party adapters in src/services/sources
// are exempt: a provider's API design puts the PNR in its own URL, which the privacy page discloses.

const ROOT = join(process.cwd(), "src");
const EXEMPT = join("services", "sources");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const FORBIDDEN: readonly { readonly pattern: RegExp; readonly why: string }[] = [
  { pattern: /\/pnr\/\$\{/, why: "a PNR interpolated into a /pnr/ path" },
  { pattern: /\/api\/pnr\/\$\{/, why: "a PNR interpolated into an /api/pnr/ path" },
  { pattern: /[?&]pnr=/, why: "a PNR in a query string" },
  { pattern: /["'`]\/pnr\/["'`]\s*\+/, why: "a PNR concatenated onto /pnr/" },
];

describe("no PNR in our URLs", () => {
  it("finds no code that puts a PNR in a path or query string", () => {
    const offenders = files(ROOT)
      .filter((path) => !relative(ROOT, path).startsWith(EXEMPT))
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        return FORBIDDEN.filter(({ pattern }) => pattern.test(source)).map(({ why }) => `${relative(process.cwd(), path)}: ${why}`);
      });
    expect(offenders).toEqual([]);
  });
});
