#!/usr/bin/env node
// Sends the announcement letter at the head of the queue, as much of it as today's allowance covers.
// Run daily by `.github/workflows/announce.yml`; a person can run it and read what it says.
//
//   node --env-file=.env.local scripts/announce-send.mjs
//   (or: npm run announce:send)
//
// Every decision — which letter, what becomes of a suppressed address, where the unsubscribe header
// points, when Stop is read — is in `announce-plan.mjs`, which is pure and tested. This file only
// wires that to the real store, the real day counter and the one door mail may leave through, and is
// the only file that touches the world, as `crawl-availability.mjs` stands to `crawl-plan.mjs`.
//
// MAIL LEAVES THROUGH `sendToAddress` AND NOTHING ELSE. It checks the suppression table first and
// fails closed, and a contract test fails the build if any file under `src/` or `scripts/` reaches
// the sender another way.
//
// WHAT IT PRINTS is counts and the letter's id. Never an address, never a signature: the output of a
// scheduled run lands in a CI log that is not as private as the database.
//
// Exit: 0 when the run did what it could (including "nothing queued", "stopped" and "the day's
// allowance is spent", which are normal); 1 when any send failed, because a run in which sends fail
// is one a person should look at; 2 when it was started wrongly. A store that cannot answer throws.

import { pathToFileURL } from "node:url";
import { registerAppImports } from "./crawl-imports.mjs";
import { drain } from "./announce-plan.mjs";

const HERE = new URL("./", import.meta.url);

/** Started wrongly and nothing was sent. Exit 2, distinct from a real crash, which must still throw. */
class Misuse extends Error {}

async function main() {
  const srcRoot = new URL("../src/", HERE);
  registerAppImports(srcRoot);
  const load = (path) => import(new URL(path, srcRoot).href);

  const { parseEnv } = await load("services/env.ts");
  const parsed = parseEnv(process.env);
  if (!parsed.ok) throw new Misuse(`the environment is not valid:\n  ${parsed.issues.join("\n  ")}\nPass one with --env-file, as the sibling scripts do.`);
  const environment = parsed.env;
  // A link signed with a per-process key verifies nowhere else, and an unsubscribe link that does
  // not work is the legal problem this module exists to avoid. So no DATA_KEY, no send.
  if (!environment.DATA_KEY) throw new Misuse("DATA_KEY is not set, so the unsubscribe links this would sign could not be verified later. Run through `node --env-file=.env.local`, and never commit the key.");
  if (!environment.RESEND_API_KEY && !environment.E2E) throw new Misuse("RESEND_API_KEY is not set, so nothing could be sent.");

  const store = await load("services/announcements/store.ts");
  const reads = await load("services/announcements/drain-store.ts");
  const { takeAnnouncements } = await load("services/announcements/budget.ts");
  const { letterText, listHeaders } = await load("services/announcements/letter.ts");
  const { sendToAddress } = await load("services/email/suppression.ts");
  const { signUnsubscribe, unsubscribeKey, unsubscribeUrl, travellerOrigin } = await load("services/subscriptions/links.ts");
  // The reading store, not `publicStore`: that one answers from this process's memory when Upstash
  // errors, which would hand a run a fresh, full day's allowance. Here an unreadable counter throws,
  // `takeAnnouncements` fails closed to 0, and the run sends nothing.
  const { publicStoreForReading } = await load("services/shared-store.ts");
  const { kv, prefix } = publicStoreForReading(environment);

  const key = unsubscribeKey();
  const summary = await drain(
    {
      deps: { letterText, listHeaders, unsubscribeUrl },
      sign: (person, list) => signUnsubscribe(key, person, list),
      now: () => new Date(),
      say: (line) => console.log(line),
      openLetters: reads.openLetters,
      stateOf: reads.letterState,
      openClaims: reads.openClaims,
      remaining: reads.remainingFor,
      take: (want) => takeAnnouncements(kv, prefix, new Date(), want),
      claim: store.claimDeliveries,
      mark: store.markDelivery,
      finish: reads.finishLetter,
      send: (mail, kind, idempotencyKey) => sendToAddress(mail, kind, idempotencyKey),
    },
    // Links in mail that reaches an inbox are the site's own address, never one assembled from the
    // machine this happens to run on.
    { origin: travellerOrigin(null, "production"), from: environment.SUBSCRIBE_EMAIL_FROM },
  );

  // `process.exitCode`, never `process.exit`: stdout to a pipe is asynchronous and exit does not drain it.
  process.exitCode = summary.failed > 0 ? 1 : 0;
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
