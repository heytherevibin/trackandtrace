import { readFileSync, readdirSync, statSync } from "node:fs";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";

const DOOR = "src/services/email/send";
const WRAPPER = "src/services/email/suppression.ts";

/**
 * Where code that could send mail lives. `scripts/` is a root of its own: it imports `src/` by
 * relative path (`../src/…`), and the announcements runner is a script.
 */
const ROOTS = ["src", "scripts"] as const;

/** Every extension TypeScript and Node will run, per tsconfig (`allowJs`, `**\/*.mts`). */
const CODE = /\.[cm]?[jt]sx?$/;

/** Every code file under `dir`, with forward slashes whatever the platform. */
function sources(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = posix.join(dir.replace(/\\/g, "/"), name);
    if (statSync(path).isDirectory()) sources(path, found);
    else if (CODE.test(name)) found.push(path);
  }
  return found;
}

/**
 * A pure `import type … from "x"` statement. It cannot put a value in the program, so it cannot send
 * mail; it is the one statement this contract lets through. `import { type X } from …` is NOT this:
 * it is a value import statement that happens to carry a type, and is still read.
 *
 * The body may not contain a quote or a semicolon, so the match cannot run on into a neighbouring
 * statement and hide a real import behind a type one.
 */
const TYPE_ONLY_IMPORT = /\bimport\s+type\s+[^;"'`]*?\bfrom\s*(["'`])[^"'`\r\n]+\1/g;

/**
 * Every module specifier a file names, whichever way it names it: `import … from`, a bare `import`,
 * `export … from`, a dynamic `import(...)`, `require(...)`. Both quote styles, and backticks. Pure
 * `import type` statements are left out.
 *
 * It reads the specifier and nothing around it, so a multi-line import and a re-export look the
 * same. It does not strip comments: a comment that quotes the door's path after `from` is reported,
 * which is the safe direction to be wrong in.
 */
function specifiers(source: string): string[] {
  const found: string[] = [];
  for (const match of source.replace(TYPE_ONLY_IMPORT, "").matchAll(/\b(?:from|import|require)\s*\(?\s*(["'`])([^"'`\r\n]+)\1/g)) {
    found.push(match[2]);
  }
  return found;
}

/** Whether `specifier`, written in `file`, names the door: by alias or by any relative spelling. */
function namesTheDoor(file: string, specifier: string): boolean {
  const target = specifier.startsWith("@/")
    ? posix.join("src", specifier.slice(2))
    : specifier.startsWith(".")
      ? posix.join(posix.dirname(file), specifier)
      : null;
  return target !== null && target.replace(/\.[cm]?[jt]sx?$/, "") === DOOR;
}

describe("how the door is recognised", () => {
  const FROM = "src/services/email/other.ts";
  const SHAPES: ReadonlyArray<readonly [string, string, string]> = [
    ["double-quoted import", FROM, `import { sendEmail } from "@/services/email/send";`],
    ["single-quoted import", FROM, `import { sendEmail } from '@/services/email/send';`],
    ["a value import that carries a type", FROM, `import { sendEmail, type Letter } from "@/services/email/send";`],
    ["multi-line import", FROM, `import {\n  sendEmail,\n  type Letter,\n} from "@/services/email/send";`],
    ["bare import", FROM, `import "@/services/email/send";`],
    ["export from", FROM, `export { sendEmail } from "@/services/email/send";`],
    ["export type from", FROM, `export type { Letter } from "@/services/email/send";`],
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
    ["a script reaching into src/", "scripts/x.mjs", `import { sendEmail } from "../src/services/email/send.ts";`],
    ["a script, single quotes, no extension", "scripts/x.mjs", `import { sendEmail } from '../src/services/email/send';`],
    ["a script, dynamic import", "scripts/send-it.mjs", `const { sendEmail } = await import("../src/services/email/send.ts");`],
    ["a CommonJS script", "scripts/x.cjs", `const { sendEmail } = require("../src/services/email/send.js");`],
    ["a type import followed by a value one", FROM, `import type { Letter } from "@/services/email/send"\nimport { sendEmail } from "@/services/email/send"`],
  ];

  it.each(SHAPES)("sees %s", (_name, file, code) => {
    expect(specifiers(code).some((s) => namesTheDoor(file, s))).toBe(true);
  });

  const BENIGN: ReadonlyArray<readonly [string, string, string]> = [
    ["the wrapper", FROM, `import { sendToAddress } from "@/services/email/suppression";`],
    ["the console's own send", "src/console/email/invite.ts", `import { sendConsoleEmail } from "./send";`],
    ["a different module that ends in send", FROM, `import { x } from "@/console/email/send";`],
    ["a script's own neighbour called send", "scripts/x.mjs", `import { x } from "./send.mjs";`],
    ["the outbox beside the door", FROM, `import { outbox } from "./outbox";`],
    ["a package", FROM, `import { z } from "zod";`],
    ["a pure type import, alias", FROM, `import type { Letter } from "@/services/email/send";`],
    ["a pure type import, relative", FROM, `import type { Letter, SendResult } from "./send";`],
    ["a multi-line pure type import", FROM, `import type {\n  Letter,\n  SendResult,\n} from "@/services/email/send";`],
  ];

  it.each(BENIGN)("does not flag %s", (_name, file, code) => {
    expect(specifiers(code).some((s) => namesTheDoor(file, s))).toBe(false);
  });
});

describe("the one door", () => {
  it("is the only way mail leaves this application", () => {
    // sendEmail does not know about suppression and must not: it has no database. The guard is that
    // nothing may reach it except the wrapper that does check. A convention decays; this does not.
    const allowed = new Set(["src/services/email/send.ts", WRAPPER]);
    const offenders = ROOTS.flatMap((root) => sources(root))
      .filter((p) => !allowed.has(p))
      .filter((p) => specifiers(readFileSync(p, "utf8")).some((s) => namesTheDoor(p, s)));
    expect(
      offenders,
      [
        "These files reach `sendEmail` (src/services/email/send.ts) directly, and it does not check suppression.",
        "All outgoing mail goes through `sendToAddress(letter, kind)` from `@/services/email/suppression`:",
        'use kind "list" for mail a person did not just ask for, "transactional" for mail they did.',
        "A hard bounce blocks both kinds; a complaint blocks only list mail. Do not import from `send`.",
        "(A pure `import type { … } from` is fine: it cannot send anything.)",
      ].join("\n"),
    ).toEqual([]);
  });

  it("keeps the wrapper itself from handing the sender on", () => {
    // The wrapper is exempt from the scan above, so it must not become a way round: if it re-exported
    // `sendEmail`, every other file could import the sender through it and nothing would notice.
    const source = readFileSync(WRAPPER, "utf8");
    const reExports = [...source.matchAll(/^\s*export\s*(?:type\s*)?(?:\{|\*)[^;]*;?|^\s*export\s+default\b[^;]*;?/gm)].map((m) => m[0].trim());
    expect(reExports, "the wrapper may declare what it exports, never re-export a name from elsewhere").toEqual([]);

    const declared = [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+(\w+)/gm)]
      .map((m) => m[1])
      .sort();
    expect(declared, "exactly these, so a new export is a decision someone has to make here").toEqual(["DoorResult", "MailKind", "sendToAddress"]);
  });
});
