#!/usr/bin/env node
// Is an announcement stuck? Reads the store back and says which letters have stopped advancing, so
// a send that silently stopped working is noticed rather than discovered.
//
//   node --env-file=.env.local scripts/announce-report.mjs
//   (or: npm run announce:report)
//
// Exit: 0 when nothing is stuck · 1 when something is · 2 when the store could not be read, or the
// environment is not set up to read it. A store that cannot be read is NOT "nothing stuck" and is
// not "something stuck" either, so it gets its own code rather than either of those.
//
// This file is only the wiring. **What counts as stuck, and what this reading cannot see, is
// `announce-coverage.mjs`; read its header before changing any rule.** Everything there is pure and
// unit-tested; nothing here decides anything.
//
// It sends nothing and asks the mail provider for nothing: it reads our own database through the
// same three reads the sender uses, so it can be run as often as anyone likes.
//
// WHAT IT PRINTS is a letter's id and a reason, and counts. Never an address, a subject, a body or a
// signature: the rows it reads carry more than that, and none of it is passed on. A failed read
// names the function that failed and nothing the store answered.

import { pathToFileURL } from "node:url";
import { registerAppImports } from "./crawl-imports.mjs";
import { exitCodeFor, stuck, summarise } from "./announce-coverage.mjs";

const HERE = new URL("./", import.meta.url);

/** Started wrongly or the store could not be read, and nothing was reported. Exit 2. */
class Misuse extends Error {}

async function main() {
  const srcRoot = new URL("../src/", HERE);
  registerAppImports(srcRoot);
  const load = (path) => import(new URL(path, srcRoot).href);

  const { parseEnv } = await load("services/env.ts");
  const parsed = parseEnv(process.env);
  if (!parsed.ok) throw new Misuse(`the environment is not valid:\n  ${parsed.issues.join("\n  ")}\nPass one with --env-file, as the sibling scripts do.`);

  const reads = await load("services/announcements/drain-store.ts");

  // The reads throw for a store that cannot answer, or answers in the wrong shape. That is reported
  // as exit 2 with the message, which names the function and never what came back.
  let letters;
  let rows;
  let unmeasured;
  try {
    const open = await reads.openLetters();
    letters = [];
    rows = [];
    unmeasured = 0;
    for (const one of open) {
      const [remaining, claims] = await Promise.all([reads.remainingFor(one.id), reads.openClaims(one.id)]);
      // `lastSentAt` is read straight off the answer: the store does not type it yet. Absent and null
      // both mean "has never sent", and the verdict reads them the same. Only the note below tells them apart.
      if (remaining.lastSentAt === undefined) unmeasured += 1;
      letters.push({ id: one.id, state: one.state, pending: remaining.pending, lastSentAt: remaining.lastSentAt ?? null, queuedAt: one.queuedAt });
      for (const claim of claims) {
        rows.push({ letterId: one.id, personId: claim.personId, state: "sending", claimedAt: claim.claimedAt, firstAttemptedAt: claim.firstAttemptedAt });
      }
    }
  } catch (error) {
    throw new Misuse(`the store could not be read, so nothing is reported either way: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  const entries = stuck(letters, rows, new Date());
  for (const line of summarise(entries, letters.length)) console.log(line);
  if (unmeasured > 0) {
    console.log(`note: the store gave no last-delivery time for ${unmeasured} of ${letters.length} letters, so each was measured from when it was queued; a letter that is sending is named once it is 48 hours old with rows pending.`);
  }
  console.log("note: deliveries whose outcome is unknown are not read here, so none can be named.");

  // `process.exitCode`, never `process.exit`: stdout to a pipe is asynchronous and exit does not drain it.
  process.exitCode = exitCodeFor(entries);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await main();
  } catch (error) {
    if (!(error instanceof Misuse)) throw error;
    console.error(`[announce] ${error.message}`);
    process.exitCode = 2;
  }
}
