#!/usr/bin/env node
// Is an announcement stuck? Reads the store back and says which letters have stopped advancing, so
// a send that silently stopped working is noticed rather than discovered.
//
//   node --env-file=.env.local scripts/announce-report.mjs
//   (or: npm run announce:report)
//
// Exit: 0 when nothing is stuck · 1 when the store was read and something is stuck, and NOTHING
// ELSE · 2 when the report could not start, could not read the store, or could not read every
// letter and found nothing in the rest. A store that cannot be read is not "nothing stuck" and not
// "something stuck", so it gets its own code; and a crash must never exit 1, because Node's own
// exit for an uncaught throw is 1 and a check wired to this would read a crash as a finding. So
// `main` never throws: every step that can, from the first import on, ends in 2.
//
// This file is only the wiring. **What counts as stuck, and what this reading cannot see, is
// `announce-coverage.mjs`; read its header before changing any rule.** Everything there is pure and
// unit-tested; the assembly here is driven by a test through the seams `main` takes, as `drain` is
// in announce-plan.mjs, so that what it assembles and the exit code it answers are both observed.
//
// It sends nothing and asks the mail provider for nothing: it reads our own database through the
// same three reads the sender uses, so it can be run as often as anyone likes.
//
// WHAT IT PRINTS is a letter's id and a reason, and counts. Never an address, a subject, a body or a
// signature: the letters and claims it reads carry more than that, and none of it is passed on. A
// failed read names the function that failed and nothing the store answered.

import { pathToFileURL } from "node:url";
import { registerAppImports } from "./crawl-imports.mjs";
import { exitCodeFor, stuck, summarise } from "./announce-coverage.mjs";

const HERE = new URL("./", import.meta.url);

let registered = false;
/** The app's own modules, with the TypeScript hooks registered once, on first use. @param {string} path */
async function loadApp(path) {
  const srcRoot = new URL("../src/", HERE);
  if (!registered) {
    registerAppImports(srcRoot);
    registered = true;
  }
  return import(new URL(path, srcRoot).href);
}

const reason = (error) => (error instanceof Error ? error.message : "unknown error");

/**
 * Reads every open letter, assembles what the verdict needs, prints it, and answers the exit code.
 * One letter that cannot be read is SKIPPED and named, and the rest are reported: `openLetters`
 * tolerates a bad row on purpose, and a report that dies on one is a report that stops reporting.
 * Skipped is never clean, though: see `exitCodeFor`.
 *
 * @param {{ openLetters: () => Promise<readonly { id: string, state: string, queuedAt: string }[]>, remainingFor: (id: string) => Promise<{ pending: number, sending: number, lastSentAt?: string | null }>, openClaims: (id: string) => Promise<readonly { personId: string, claimedAt: string, firstAttemptedAt: string | null }[]> }} reads
 * @param {{ now: () => Date, say: (line: string) => void }} world
 * @returns {Promise<number>}
 */
export async function report(reads, { now, say }) {
  const open = await reads.openLetters();
  const letters = [];
  const rows = [];
  const skipped = [];
  let unmeasured = 0;
  for (const one of open) {
    let remaining;
    let claims;
    try {
      [remaining, claims] = await Promise.all([reads.remainingFor(one.id), reads.openClaims(one.id)]);
    } catch (error) {
      skipped.push(`  letter ${one.id}: skipped, ${reason(error)}`);
      continue;
    }
    // `lastSentAt` is read straight off the answer: the store does not type it yet. Absent and null
    // both mean "has never sent", and the verdict reads them the same. Only the note below tells them apart.
    if (remaining.lastSentAt === undefined) unmeasured += 1;
    letters.push({ id: one.id, state: one.state, pending: remaining.pending, sending: remaining.sending, lastSentAt: remaining.lastSentAt ?? null, queuedAt: one.queuedAt });
    for (const claim of claims) {
      rows.push({ letterId: one.id, personId: claim.personId, state: "sending", claimedAt: claim.claimedAt, firstAttemptedAt: claim.firstAttemptedAt });
    }
  }

  const entries = stuck(letters, rows, now());
  for (const line of summarise(entries, letters.length, skipped.length)) say(line);
  for (const line of skipped) say(line);
  if (unmeasured > 0) {
    say(`note: the store gave no last-delivery time for ${unmeasured} of ${letters.length} letters, so each was measured from when it was queued; a letter that is sending is named once it is 48 hours old with rows pending.`);
  }
  say("note: deliveries whose outcome is unknown are not read here, so none can be named.");
  return exitCodeFor(entries, skipped.length);
}

/**
 * The whole run, and it never throws: the exit code is the return value.
 *
 * @param {{ env?: NodeJS.ProcessEnv, now?: () => Date, say?: (line: string) => void, complain?: (line: string) => void, load?: (path: string) => Promise<any> }} [world]
 * @returns {Promise<number>}
 */
export async function main({ env = process.env, now = () => new Date(), say = (line) => console.log(line), complain = (line) => console.error(line), load = loadApp } = {}) {
  let reads;
  try {
    const { parseEnv } = await load("services/env.ts");
    const parsed = parseEnv(env);
    if (!parsed.ok) {
      complain(`[announce] the environment is not valid:\n  ${parsed.issues.join("\n  ")}\nPass one with --env-file, as the sibling scripts do.`);
      return 2;
    }
    reads = await load("services/announcements/drain-store.ts");
  } catch (error) {
    complain(`[announce] the report could not start: ${reason(error)}`);
    return 2;
  }
  try {
    return await report(reads, { now, say });
  } catch (error) {
    complain(`[announce] the store could not be read, so nothing is reported either way: ${reason(error)}`);
    return 2;
  }
}

// `process.exitCode`, never `process.exit`: stdout to a pipe is asynchronous and exit does not drain it.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = await main();
