import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Every file under src/, except the two allowed to know `sendEmail` exists. */
function sources(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, found);
    else if (/\.tsx?$/.test(name)) found.push(path);
  }
  return found;
}

describe("the one door", () => {
  it("is the only way mail leaves this application", () => {
    // sendEmail does not know about suppression and must not: it has no database. The guard is that
    // nothing may call it except the wrapper that does check. A convention decays; this does not.
    const allowed = new Set(["src/services/email/send.ts", "src/services/email/suppression.ts"]);
    const offenders = sources("src")
      .filter((p) => !allowed.has(p.replace(/\\/g, "/")))
      .filter((p) => /from "@\/services\/email\/send"/.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });
});
