import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Contract: travellers see one service, Trakline. Provider names live only in server code
// (src/services), server env and internal docs, never in pages, components, messages, the wire
// schema, the service worker or email templates.

const ROOTS = ["src/app", "src/components", "src/messages", "src/utils", "src/styles", "src/types/schemas.ts", "public", "supabase/templates"];
const PROVIDER = /railkit|rapidapi|irctcapi/i;

function files(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => files(join(path, name)));
}

describe("no provider names in front of travellers", () => {
  it("finds none in client-facing code, copy, assets or templates", () => {
    const offenders = ROOTS.flatMap((root) => files(join(process.cwd(), root)))
      .filter((path) => /\.(ts|tsx|js|css|html|json|webmanifest|svg|txt)$/.test(path))
      .filter((path) => PROVIDER.test(readFileSync(path, "utf8")))
      .map((path) => relative(process.cwd(), path));
    expect(offenders).toEqual([]);
  });
});
