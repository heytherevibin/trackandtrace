#!/usr/bin/env node
// Runs the console's end-to-end suite against a real local Supabase stack. `playwright.console.config.ts`
// deliberately needs real connection details -- the opposite of playwright.config.ts, which blanks
// them so the traveller run never reaches a real project -- so this script reads them from the
// running stack itself and hands them to the one child process that needs them.
//
//   npm run test:e2e:console
//
// API_URL, PUBLISHABLE_KEY and SECRET_KEY are the local stack's well-known development values, not
// secrets that leave this machine -- but they are still never logged and never written to a file,
// only placed in this process's own environment for the Playwright child below.

import { execFileSync, spawn } from "node:child_process";

function fail(message) {
  console.error(`[console-e2e] ${message}`);
  process.exit(1);
}

/** Parses `supabase status -o env`'s `KEY="value"` lines without ever printing one. */
function parseEnvLines(text) {
  const found = {};
  for (const line of text.split("\n")) {
    const match = /^([A-Z_][A-Z0-9_]*)="(.*)"$/.exec(line);
    if (match) found[match[1]] = match[2];
  }
  return found;
}

function readStack() {
  let output;
  try {
    output = execFileSync("npx", ["supabase@2.117.0", "status", "-o", "env"], { encoding: "utf8" });
  } catch (err) {
    fail(
      "could not read the local Supabase stack's status. Is it running? Start it with `npm run db:start`.\n" +
        (err.stderr?.toString().trim() || err.message),
    );
  }
  const found = parseEnvLines(output);
  const missing = ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"].filter((key) => !found[key]);
  if (missing.length > 0) {
    fail(`the local Supabase stack's status is missing ${missing.join(", ")}. Is the stack running (\`npm run db:start\`)?`);
  }
  return { url: found.API_URL, publishableKey: found.PUBLISHABLE_KEY, secretKey: found.SECRET_KEY };
}

/**
 * `resetConsole()` (tests/e2e/console-auth/fixtures.ts) shells out to `psql`, so without one every
 * spec in this suite dies with `spawnSync psql ENOENT` before a browser opens -- twenty identical
 * stack traces that read like a regression and are not one. macOS ships no `psql` unless libpq or
 * the Postgres app is installed, so this is the ordinary state of a fresh machine. Checked here,
 * once, with the sentence a reader needs, rather than discovered twenty times in a scrollback.
 */
function requirePsql() {
  try {
    execFileSync("psql", ["--version"], { stdio: "ignore" });
  } catch {
    fail(
      "`psql` is not on PATH, and this suite's resetConsole() shells out to it -- every spec would fail\n" +
        "before a browser opened. Install libpq (`brew install libpq` and add its bin to PATH), or put any\n" +
        "psql that can reach the local stack on PATH.",
    );
  }
}

requirePsql();

const stack = readStack();

const child = spawn("npx", ["playwright", "test", "--config", "playwright.console.config.ts"], {
  stdio: "inherit",
  env: {
    ...process.env,
    SUPABASE_URL: stack.url,
    SUPABASE_PUBLISHABLE_KEY: stack.publishableKey,
    SUPABASE_SECRET_KEY: stack.secretKey,
  },
});

child.on("error", (err) => fail(`could not start Playwright: ${err.message}`));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
