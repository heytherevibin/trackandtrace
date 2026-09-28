import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Console pages REPORT on the shared store; they never decide anything with it. So they read
// through `publicStoreForReading`, which fails when Upstash cannot be reached, and never through
// `publicStore`, which quietly answers from this instance's memory instead — and would have the page
// say "Answering" and "0 requests" about a day it knows nothing of.
const ROOT = join(__dirname, "..", "..", "..");
const PUBLIC_STORE_CALL = /\bpublicStore\s*\(/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("console reads of the shared store", () => {
  it("go through publicStoreForReading, never the store that falls back to memory", () => {
    const offenders = [join(ROOT, "src", "app", "console"), join(ROOT, "src", "console")]
      .flatMap(sourceFiles)
      .filter((file) => PUBLIC_STORE_CALL.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it("the pattern catches a call and leaves the reading accessor alone", () => {
    expect(PUBLIC_STORE_CALL.test("const { kv } = publicStore();")).toBe(true);
    expect(PUBLIC_STORE_CALL.test("const { kv } = publicStoreForReading();")).toBe(false);
  });
});
