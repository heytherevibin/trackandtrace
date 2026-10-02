import { readFileSync, readdirSync, statSync } from "node:fs";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";

const DOOR = "src/services/email/send";

/** Every file under src/, with forward slashes whatever the platform. */
function sources(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = posix.join(dir.replace(/\\/g, "/"), name);
    if (statSync(path).isDirectory()) sources(path, found);
    else if (/\.tsx?$/.test(name)) found.push(path);
  }
  return found;
}

/**
 * Every module specifier a file names, whichever way it names it: `import … from`, a bare `import`,
 * `export … from`, a dynamic `import(...)`, `require(...)`. Both quote styles, and backticks.
 *
 * It reads the specifier and nothing around it, so a multi-line import, a type-only import and a
 * re-export all look the same. It does not strip comments: a comment that quotes the door's path
 * after `from` is reported, which is the safe direction to be wrong in.
 */
function specifiers(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/\b(?:from|import|require)\s*\(?\s*(["'`])([^"'`\r\n]+)\1/g)) found.push(match[2]);
  return found;
}

/** Whether `specifier`, written in `file`, names the door: by alias or by any relative spelling. */
function namesTheDoor(file: string, specifier: string): boolean {
  const target = specifier.startsWith("@/")
    ? posix.join("src", specifier.slice(2))
    : specifier.startsWith(".")
      ? posix.join(posix.dirname(file), specifier)
      : null;
  return target !== null && target.replace(/\.(?:[cm]?[jt]sx?)$/, "") === DOOR;
}

describe("how the door is recognised", () => {
  const FROM = "src/services/email/other.ts";
  const SHAPES: ReadonlyArray<readonly [string, string, string]> = [
    ["double-quoted import", FROM, `import { sendEmail } from "@/services/email/send";`],
    ["single-quoted import", FROM, `import { sendEmail } from '@/services/email/send';`],
    ["type-only import", FROM, `import type { Letter } from "@/services/email/send";`],
    ["multi-line import", FROM, `import {\n  sendEmail,\n  type Letter,\n} from "@/services/email/send";`],
    ["bare import", FROM, `import "@/services/email/send";`],
    ["export from", FROM, `export { sendEmail } from "@/services/email/send";`],
    ["export * from", FROM, `export * from '@/services/email/send';`],
    ["dynamic import", FROM, `const m = await import("@/services/email/send");`],
    ["dynamic import, single quotes", FROM, `const m = await import('@/services/email/send');`],
    ["require", FROM, `const { sendEmail } = require("@/services/email/send");`],
    ["require, single quotes", FROM, `const { sendEmail } = require('@/services/email/send');`],
    ["a sibling, ./send", FROM, `import { sendEmail } from "./send";`],
    ["a sibling with an extension", FROM, `import { sendEmail } from "./send.ts";`],
    ["a parent's path, ../email/send", "src/services/other/x.ts", `import { sendEmail } from "../email/send";`],
    ["a deep relative path", "src/console/auth/x.ts", `import { sendEmail } from "../../services/email/send";`],
    ["a relative dynamic import", FROM, `await import("./send");`],
    ["a relative require", FROM, `require('./send');`],
    ["the alias with an extension", FROM, `import { sendEmail } from "@/services/email/send.js";`],
  ];

  it.each(SHAPES)("sees %s", (_name, file, code) => {
    expect(specifiers(code).some((s) => namesTheDoor(file, s))).toBe(true);
  });

  const BENIGN: ReadonlyArray<readonly [string, string, string]> = [
    ["the wrapper", FROM, `import { sendToAddress } from "@/services/email/suppression";`],
    ["the console's own send", "src/console/email/invite.ts", `import { sendConsoleEmail } from "./send";`],
    ["a different module that ends in send", FROM, `import { x } from "@/console/email/send";`],
    ["the outbox beside the door", FROM, `import { outbox } from "./outbox";`],
    ["a package", FROM, `import { z } from "zod";`],
  ];

  it.each(BENIGN)("does not flag %s", (_name, file, code) => {
    expect(specifiers(code).some((s) => namesTheDoor(file, s))).toBe(false);
  });
});

describe("the one door", () => {
  it("is the only way mail leaves this application", () => {
    // sendEmail does not know about suppression and must not: it has no database. The guard is that
    // nothing may reach it except the wrapper that does check. A convention decays; this does not.
    const allowed = new Set(["src/services/email/send.ts", "src/services/email/suppression.ts"]);
    const offenders = sources("src")
      .filter((p) => !allowed.has(p))
      .filter((p) => specifiers(readFileSync(p, "utf8")).some((s) => namesTheDoor(p, s)));
    expect(
      offenders,
      [
        "These files reach `sendEmail` (src/services/email/send.ts) directly, and it does not check suppression.",
        "All outgoing mail goes through `sendToAddress(letter, kind)` from `@/services/email/suppression`:",
        'use kind "list" for mail a person did not just ask for, "transactional" for mail they did.',
        "A hard bounce blocks both kinds; a complaint blocks only list mail. Do not import from `send`.",
      ].join("\n"),
    ).toEqual([]);
  });
});
